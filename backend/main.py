from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel


APP_TITLE = "Image Tools"
ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = ROOT_DIR / "data"
IMAGE_DIR = DATA_DIR / "images"
UPLOAD_DIR = DATA_DIR / "uploads"
SETTINGS_PATH = DATA_DIR / "settings.json"

app = FastAPI(title=APP_TITLE)


class AppSettings(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = "gpt-image-2"


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
