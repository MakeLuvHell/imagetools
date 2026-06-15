from __future__ import annotations

import base64
import json
import mimetypes
import os
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
QUALITY_OPTIONS = {"auto", "low", "medium", "high"}
OUTPUT_FORMAT_OPTIONS = {"png", "jpeg", "webp"}
BACKGROUND_OPTIONS = {"auto", "opaque", "transparent"}
MODERATION_OPTIONS = {"auto", "low"}
MIN_IMAGE_PIXELS = 655_360
MAX_IMAGE_PIXELS = 8_294_400
MAX_IMAGE_EDGE = 3840
UPSTREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=10.0)
CHSHAPI_IMAGE_BASE_URL = "https://img-api.chshapi.org/v1"

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
    return clean.rstrip("/")


def migrate_provider_base_url(value: str) -> str:
    clean = normalize_base_url(value)
    if clean == "https://img-api.chshapi.org":
        return CHSHAPI_IMAGE_BASE_URL
    return clean


def join_api_url(base_url: str, path: str) -> str:
    clean_base = base_url.rstrip("/")
    clean_path = path if path.startswith("/") else f"/{path}"
    if clean_base.endswith("/v1") and clean_path.startswith("/v1/"):
        return f"{clean_base}{clean_path[3:]}"
    return f"{clean_base}{clean_path}"


def default_settings() -> AppSettings:
    return AppSettings(
        base_url=migrate_provider_base_url(os.getenv("IMAGE_TOOLS_BASE_URL", "")),
        api_key=os.getenv("IMAGE_TOOLS_API_KEY", "").strip(),
        model=os.getenv("IMAGE_TOOLS_MODEL", "gpt-image-2").strip() or "gpt-image-2",
    )


def load_settings() -> AppSettings:
    defaults = default_settings()
    if not SETTINGS_PATH.exists():
        return defaults
    try:
        payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defaults
    return AppSettings(
        base_url=migrate_provider_base_url(str(payload.get("base_url") or defaults.base_url)),
        api_key=str(payload.get("api_key") or defaults.api_key),
        model=str(payload.get("model") or defaults.model),
    )


def save_settings(settings: AppSettings, keep_existing_key: bool = False) -> AppSettings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    api_key = settings.api_key.strip()
    if keep_existing_key and not api_key:
        api_key = load_settings().api_key
    clean = AppSettings(
        base_url=migrate_provider_base_url(settings.base_url),
        api_key=api_key,
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


def normalize_option(value: str, allowed: set[str], fallback: str) -> str:
    clean = value.strip()
    return clean if clean in allowed else fallback


def validate_image_size(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        raise ApiError("图片尺寸必须大于 0。")
    if width % 16 != 0 or height % 16 != 0:
        raise ApiError("图片宽高必须是 16 的倍数。")
    if max(width, height) > MAX_IMAGE_EDGE:
        raise ApiError("图片最长边不能超过 3840px。")
    if max(width, height) / min(width, height) > 3:
        raise ApiError("图片长短边比例不能超过 3:1。")
    total_pixels = width * height
    if total_pixels < MIN_IMAGE_PIXELS or total_pixels > MAX_IMAGE_PIXELS:
        raise ApiError("图片总像素必须在 655,360 到 8,294,400 之间。")
    return f"{width}x{height}"


def supports_transparent_background(model: str) -> bool:
    return "gpt-image-2" not in model.lower()


def validate_background_for_model(background: str, model: str) -> str:
    if background == "transparent" and not supports_transparent_background(model):
        raise ApiError("gpt-image-2 不支持透明背景。请选择“自动”或“不透明”。")
    return background


def format_http_error(exc: httpx.HTTPStatusError, url: str) -> str:
    response = exc.response
    status = response.status_code
    text = response.text.replace("\n", " ")[:500]
    content_type = response.headers.get("content-type", "")
    if status in {500, 503, 504}:
        return f"接口服务器异常 {status}: {text}\n请求地址：{url}"
    if "html" in content_type.lower() or "<html" in text.lower() or "<!doctype" in text.lower():
        return f"接口返回了网页错误页，不是 API JSON 响应。状态码：{status}。\n请求地址：{url}"
    return f"接口返回错误 {status}: {text}\n请求地址：{url}"


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
        output_format: str,
        output_compression: int,
        background: str,
        moderation: str,
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
        payload["output_format"] = output_format
        if output_format in {"jpeg", "webp"}:
            payload["output_compression"] = output_compression
        if background != "auto":
            payload["background"] = background
        if moderation != "auto":
            payload["moderation"] = moderation
        response = self.request_json("POST", "/v1/images/generations", json=payload)
        return self.save_response_images(response, output_dir, f".{output_format}"), response

    def edit(
        self,
        *,
        reference_path: Path,
        prompt: str,
        model: str,
        size: str,
        quality: str,
        output_format: str,
        output_compression: int,
        background: str,
        output_dir: Path,
    ) -> tuple[list[Path], dict[str, Any]]:
        fields = {"prompt": prompt, "model": model, "size": size}
        if quality != "auto":
            fields["quality"] = quality
        fields["output_format"] = output_format
        if output_format in {"jpeg", "webp"}:
            fields["output_compression"] = str(output_compression)
        if background != "auto":
            fields["background"] = background
        mime_type = mimetypes.guess_type(str(reference_path))[0] or "application/octet-stream"
        with reference_path.open("rb") as image_file:
            files = {"image": (reference_path.name, image_file, mime_type)}
            response = self.request_json("POST", "/v1/images/edits", data=fields, files=files)
        return self.save_response_images(response, output_dir, f".{output_format}"), response

    def request_json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.base_url:
            raise ApiError("请先填写 API 地址。")
        if not self.api_key:
            raise ApiError("请先填写 API Key。")
        url = join_api_url(self.base_url, path)
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            with httpx.Client(timeout=UPSTREAM_TIMEOUT, follow_redirects=True) as client:
                response = client.request(method, url, headers=headers, **kwargs)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "json" not in content_type.lower():
                    raise ApiError(f"接口返回的不是 JSON。请求地址：{url}")
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise ApiError(format_http_error(exc, url)) from exc
        except httpx.TimeoutException as exc:
            raise ApiError(f"接口响应超时。请求地址：{url}") from exc
        except httpx.RequestError as exc:
            raise ApiError(f"无法连接接口：{exc}") from exc
        except ValueError as exc:
            raise ApiError(f"接口返回 JSON 无法解析。请求地址：{url}") from exc
        if not isinstance(payload, dict):
            raise ApiError("接口返回格式不正确。")
        return payload

    def save_response_images(
        self,
        response: dict[str, Any],
        output_dir: Path,
        base64_suffix: str = ".png",
    ) -> list[Path]:
        data = response.get("data")
        if not isinstance(data, list) or not data:
            raise ApiError("接口响应中没有图片数据。")
        output_dir.mkdir(parents=True, exist_ok=True)
        paths: list[Path] = []
        for index, item in enumerate(data, 1):
            if not isinstance(item, dict):
                continue
            if item.get("b64_json"):
                paths.append(save_base64(str(item["b64_json"]), output_dir, index, base64_suffix))
            elif item.get("url"):
                paths.append(save_url(str(item["url"]), output_dir, index))
        if not paths:
            raise ApiError("接口响应中没有可识别的图片。")
        return paths


def image_filename(index: int, suffix: str) -> str:
    clean_suffix = suffix if suffix.startswith(".") else f".{suffix}"
    return f"image_{time.strftime('%Y%m%d_%H%M%S')}_{index}_{uuid4().hex[:6]}{clean_suffix}"


def save_base64(value: str, output_dir: Path, index: int, suffix: str = ".png") -> Path:
    if "," in value and value.split(",", 1)[0].startswith("data:"):
        value = value.split(",", 1)[1]
    raw = base64.b64decode(value)
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / image_filename(index, suffix)
    path.write_bytes(raw)
    return path


def save_url(value: str, output_dir: Path, index: int) -> Path:
    parsed = urlparse(value)
    suffix = Path(parsed.path).suffix or ".png"
    path = output_dir / image_filename(index, suffix)
    if parsed.scheme in {"http", "https"}:
        try:
            with httpx.Client(timeout=UPSTREAM_TIMEOUT, follow_redirects=True) as client:
                response = client.get(value)
                response.raise_for_status()
                path.write_bytes(response.content)
        except httpx.TimeoutException as exc:
            raise ApiError(f"下载图片超时：{value}") from exc
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
    if not settings.api_key.strip() and not load_settings().api_key:
        raise HTTPException(status_code=400, detail="请填写 API Key。")
    saved = save_settings(settings, keep_existing_key=True)
    return public_settings(saved)


@app.post("/api/generate")
async def generate(
    prompt: str = Form(...),
    model: str = Form(""),
    width: int = Form(1024),
    height: int = Form(1024),
    count: int = Form(1),
    quality: str = Form("auto"),
    output_format: str = Form("png"),
    output_compression: int = Form(100),
    background: str = Form("auto"),
    moderation: str = Form("auto"),
    reference: UploadFile | None = File(None),
) -> dict[str, Any]:
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="请先输入提示词。")

    ensure_runtime_dirs()
    settings = load_settings()
    selected_model = model.strip() or settings.model
    try:
        size = validate_image_size(width, height)
    except ApiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    image_count = max(1, min(4, count))
    selected_quality = normalize_option(quality, QUALITY_OPTIONS, "auto")
    selected_output_format = normalize_option(output_format, OUTPUT_FORMAT_OPTIONS, "png")
    selected_output_compression = max(0, min(100, output_compression))
    selected_background = normalize_option(background, BACKGROUND_OPTIONS, "auto")
    selected_moderation = normalize_option(moderation, MODERATION_OPTIONS, "auto")
    try:
        selected_background = validate_background_for_model(selected_background, selected_model)
    except ApiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
                quality=selected_quality,
                output_format=selected_output_format,
                output_compression=selected_output_compression,
                background=selected_background,
                output_dir=IMAGE_DIR,
            )
            kind = "image_to_image"
        else:
            image_paths, _ = client.generate(
                prompt=prompt,
                model=selected_model,
                size=size,
                count=image_count,
                quality=selected_quality,
                output_format=selected_output_format,
                output_compression=selected_output_compression,
                background=selected_background,
                moderation=selected_moderation,
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
