from __future__ import annotations

import base64
import json
import mimetypes
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


APP_TITLE = "Image Tools"
ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = ROOT_DIR / "data"
IMAGE_DIR = DATA_DIR / "images"
UPLOAD_DIR = DATA_DIR / "uploads"
SETTINGS_PATH = DATA_DIR / "settings.json"

class ApiError(RuntimeError):
    pass


class AppSettings(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = "gpt-image-2"


def ensure_runtime_dirs() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_runtime_dirs()
    yield


app = FastAPI(title=APP_TITLE, lifespan=lifespan)


def normalize_base_url(value: str) -> str:
    clean = value.strip()
    if not clean:
        return ""
    if not clean.startswith(("http://", "https://")):
        clean = f"http://{clean}"
    clean = clean.rstrip("/")
    if clean.endswith("/v1"):
        clean = clean[:-3]
    return clean.rstrip("/")


def load_settings() -> AppSettings:
    if not SETTINGS_PATH.exists():
        return AppSettings()
    try:
        payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return AppSettings()
    return AppSettings(
        base_url=normalize_base_url(str(payload.get("base_url") or "")),
        api_key=str(payload.get("api_key") or ""),
        model=str(payload.get("model") or "gpt-image-2"),
    )


def save_settings(settings: AppSettings) -> AppSettings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean = AppSettings(
        base_url=normalize_base_url(settings.base_url),
        api_key=settings.api_key.strip(),
        model=settings.model.strip() or "gpt-image-2",
    )
    SETTINGS_PATH.write_text(json.dumps(clean.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
    return clean


def public_settings(settings: AppSettings) -> dict[str, object]:
    return {
        "base_url": settings.base_url,
        "api_key": "",
        "api_key_set": bool(settings.api_key),
        "model": settings.model,
    }


class ImageApiClient:
    def __init__(self, settings: AppSettings) -> None:
        self.base_url = normalize_base_url(settings.base_url)
        self.api_key = settings.api_key.strip()

    def generate(
        self,
        *,
        prompt: str,
        model: str,
        size: str,
        count: int,
        quality: str,
        output_dir: Path,
    ) -> tuple[list[Path], dict[str, Any]]:
        payload: dict[str, Any] = {
            "prompt": prompt,
            "model": model,
            "size": size,
            "n": count,
        }
        if quality != "auto":
            payload["quality"] = quality
        response = self.request_json("POST", "/v1/images/generations", json=payload)
        return self.save_response_images(response, output_dir), response

    def edit(
        self,
        *,
        reference_path: Path,
        prompt: str,
        model: str,
        size: str,
        quality: str,
        output_dir: Path,
    ) -> tuple[list[Path], dict[str, Any]]:
        fields = {"prompt": prompt, "model": model, "size": size}
        if quality != "auto":
            fields["quality"] = quality
        mime_type = mimetypes.guess_type(str(reference_path))[0] or "application/octet-stream"
        with reference_path.open("rb") as image_file:
            files = {"image": (reference_path.name, image_file, mime_type)}
            response = self.request_json("POST", "/v1/images/edits", data=fields, files=files)
        return self.save_response_images(response, output_dir), response

    def request_json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.base_url:
            raise ApiError("请先填写 API 地址。")
        if not self.api_key:
            raise ApiError("请先填写 API Key。")
        url = f"{self.base_url}{path}"
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            with httpx.Client(timeout=120, follow_redirects=True) as client:
                response = client.request(method, url, headers=headers, **kwargs)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "json" not in content_type.lower():
                    raise ApiError(f"接口返回的不是 JSON。请求地址：{url}")
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            text = exc.response.text.replace("\n", " ")[:500]
            raise ApiError(f"接口返回错误 {status}: {text}\n请求地址：{url}") from exc
        except httpx.RequestError as exc:
            raise ApiError(f"无法连接接口：{exc}") from exc
        except ValueError as exc:
            raise ApiError(f"接口返回 JSON 无法解析。请求地址：{url}") from exc
        if not isinstance(payload, dict):
            raise ApiError("接口返回格式不正确。")
        return payload

    def save_response_images(self, response: dict[str, Any], output_dir: Path) -> list[Path]:
        data = response.get("data")
        if not isinstance(data, list) or not data:
            raise ApiError("接口响应中没有图片数据。")
        output_dir.mkdir(parents=True, exist_ok=True)
        paths: list[Path] = []
        for index, item in enumerate(data, 1):
            if not isinstance(item, dict):
                continue
            if item.get("b64_json"):
                paths.append(save_base64(str(item["b64_json"]), output_dir, index))
            elif item.get("url"):
                paths.append(save_url(str(item["url"]), output_dir, index))
        if not paths:
            raise ApiError("接口响应中没有可识别的图片。")
        return paths


def image_filename(index: int, suffix: str) -> str:
    clean_suffix = suffix if suffix.startswith(".") else f".{suffix}"
    return f"image_{time.strftime('%Y%m%d_%H%M%S')}_{index}_{uuid4().hex[:6]}{clean_suffix}"


def save_base64(value: str, output_dir: Path, index: int) -> Path:
    if "," in value and value.split(",", 1)[0].startswith("data:"):
        value = value.split(",", 1)[1]
    raw = base64.b64decode(value)
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / image_filename(index, ".png")
    path.write_bytes(raw)
    return path


def save_url(value: str, output_dir: Path, index: int) -> Path:
    parsed = urlparse(value)
    suffix = Path(parsed.path).suffix or ".png"
    path = output_dir / image_filename(index, suffix)
    if parsed.scheme in {"http", "https"}:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            response = client.get(value)
            response.raise_for_status()
            path.write_bytes(response.content)
    else:
        source = Path(value)
        if not source.exists():
            raise ApiError(f"无法读取图片地址：{value}")
        path.write_bytes(source.read_bytes())
    return path


def to_public_path(path: Path) -> str:
    return f"/files/{path.relative_to(DATA_DIR).as_posix()}"


app.mount("/static", StaticFiles(directory=FRONTEND_DIR, check_dir=False), name="static")
app.mount("/files", StaticFiles(directory=DATA_DIR, check_dir=False), name="files")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.head("/")
def index_head() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/settings")
def get_settings() -> dict[str, object]:
    return public_settings(load_settings())


@app.post("/api/settings")
def update_settings(settings: AppSettings) -> dict[str, object]:
    if not settings.base_url.strip():
        raise HTTPException(status_code=400, detail="请填写 API 地址。")
    if not settings.api_key.strip():
        raise HTTPException(status_code=400, detail="请填写 API Key。")
    return public_settings(save_settings(settings))


@app.post("/api/generate")
async def generate(
    prompt: str = Form(...),
    model: str = Form(""),
    width: int = Form(1024),
    height: int = Form(1024),
    count: int = Form(1),
    quality: str = Form("auto"),
    reference: UploadFile | None = File(None),
) -> dict[str, Any]:
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="请先输入提示词。")

    ensure_runtime_dirs()
    settings = load_settings()
    selected_model = model.strip() or settings.model
    size = f"{width}x{height}"
    image_count = max(1, min(4, count))
    reference_path: Path | None = None

    try:
        if reference and reference.filename:
            suffix = Path(reference.filename).suffix or ".png"
            reference_path = UPLOAD_DIR / f"ref_{time.strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:6]}{suffix}"
            with reference_path.open("wb") as target:
                shutil.copyfileobj(reference.file, target)

        client = ImageApiClient(settings)
        if reference_path:
            image_paths, _ = client.edit(
                reference_path=reference_path,
                prompt=prompt,
                model=selected_model,
                size=size,
                quality=quality,
                output_dir=IMAGE_DIR,
            )
            kind = "image_to_image"
        else:
            image_paths, _ = client.generate(
                prompt=prompt,
                model=selected_model,
                size=size,
                count=image_count,
                quality=quality,
                output_dir=IMAGE_DIR,
            )
            kind = "text_to_image"
        return {
            "kind": kind,
            "model": selected_model,
            "size": size,
            "images": [to_public_path(path) for path in image_paths],
        }
    except ApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
