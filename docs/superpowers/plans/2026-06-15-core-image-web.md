# Core Image Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved core local web tool for prompt-based image generation with optional reference image upload, API settings, previews, and basic image actions.

**Architecture:** A FastAPI backend serves a static frontend, stores runtime settings under `data/settings.json`, proxies compatible OpenAI image API calls, and saves returned images locally. The frontend is plain HTML/CSS/JS with one compact work surface for settings, prompt controls, generation state, errors, and results.

**Tech Stack:** Python 3, FastAPI, uvicorn, httpx, pydantic, python-multipart, pytest, plain HTML/CSS/JavaScript.

---

## File Structure

- Create `backend/__init__.py`: package marker.
- Create `backend/main.py`: FastAPI app, settings persistence, image API client, file saving, and routes.
- Create `frontend/index.html`: single-page app markup.
- Create `frontend/styles.css`: compact application styling and responsive layout.
- Create `frontend/app.js`: browser state, settings form, generation form, upload preview, result actions, and API calls.
- Create `tests/test_backend_helpers.py`: focused tests for base URL normalization, settings load/save, and base64 image saving.
- Create `requirements.txt`: runtime and test dependencies.
- Create `.gitignore`: ignore runtime data, caches, virtual environments, and editor noise.
- Create `README.md`: setup, run, and usage instructions.

## Task 1: Backend Helpers And Tests

**Files:**
- Create: `requirements.txt`
- Create: `backend/__init__.py`
- Create: `backend/main.py`
- Create: `tests/test_backend_helpers.py`
- Create: `.gitignore`

- [ ] **Step 1: Add dependencies**

Create `requirements.txt`:

```text
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
python-multipart>=0.0.9
httpx>=0.27.0
pydantic>=2.0.0
pytest>=8.0.0
```

- [ ] **Step 2: Add package marker and git ignore rules**

Create `backend/__init__.py` as an empty file.

Create `.gitignore`:

```gitignore
__pycache__/
*.py[cod]
.pytest_cache/
.venv/
venv/
env/
data/
.DS_Store
```

- [ ] **Step 3: Write backend helper tests**

Create `tests/test_backend_helpers.py`:

```python
import base64

from backend import main


def test_normalize_base_url_adds_scheme_and_strips_v1():
    assert main.normalize_base_url("api.example.com/v1/") == "http://api.example.com"
    assert main.normalize_base_url("https://api.example.com/v1") == "https://api.example.com"


def test_load_settings_returns_defaults_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")

    settings = main.load_settings()

    assert settings.base_url == ""
    assert settings.api_key == ""
    assert settings.model == "gpt-image-2"


def test_save_and_load_settings_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")

    saved = main.save_settings(
        main.AppSettings(
            base_url="https://api.example.com/v1/",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )
    loaded = main.load_settings()

    assert saved.base_url == "https://api.example.com"
    assert loaded.base_url == "https://api.example.com"
    assert loaded.api_key == "sk-test"
    assert loaded.model == "gpt-image-2"


def test_save_base64_accepts_data_url(tmp_path):
    encoded = base64.b64encode(b"png-bytes").decode("ascii")

    path = main.save_base64(f"data:image/png;base64,{encoded}", tmp_path, 1)

    assert path.exists()
    assert path.read_bytes() == b"png-bytes"
    assert path.name.startswith("image_")
    assert path.suffix == ".png"
```

- [ ] **Step 4: Add minimal backend helper implementation**

Create `backend/main.py` with the helper code needed by tests plus placeholder app setup:

```python
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
```

- [ ] **Step 5: Run tests and verify helper coverage**

Run:

```bash
python -m pytest tests/test_backend_helpers.py -v
```

Expected: all four tests pass.

- [ ] **Step 6: Commit backend helpers**

Run:

```bash
git add .gitignore requirements.txt backend/__init__.py backend/main.py tests/test_backend_helpers.py
git commit -m "Add backend helper tests and settings utilities"
```

## Task 2: Backend Routes And Image Proxy

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_backend_helpers.py`

- [ ] **Step 1: Add tests for redacted settings and response image parsing**

Append to `tests/test_backend_helpers.py`:

```python
def test_public_settings_redacts_api_key():
    public = main.public_settings(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-secret",
            model="gpt-image-2",
        )
    )

    assert public["base_url"] == "https://api.example.com"
    assert public["api_key_set"] is True
    assert public["api_key"] == ""
    assert public["model"] == "gpt-image-2"


def test_save_response_images_decodes_base64_items(tmp_path):
    encoded = base64.b64encode(b"image-one").decode("ascii")
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )

    paths = client.save_response_images({"data": [{"b64_json": encoded}]}, tmp_path)

    assert len(paths) == 1
    assert paths[0].read_bytes() == b"image-one"
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run:

```bash
python -m pytest tests/test_backend_helpers.py -v
```

Expected: failure for missing `public_settings` or `ImageApiClient`.

- [ ] **Step 3: Replace `backend/main.py` with full backend**

Implement:

- Static app serving.
- Data directory creation on startup.
- Public settings redaction.
- `ImageApiClient` with generation and edit calls.
- Base64 and URL image saving.
- `GET /api/settings`, `POST /api/settings`, and `POST /api/generate`.

Key function signatures to preserve:

```python
def public_settings(settings: AppSettings) -> dict[str, object]:
    ...


class ImageApiClient:
    def __init__(self, settings: AppSettings) -> None:
        ...

    def generate(self, *, prompt: str, model: str, size: str, count: int, quality: str, output_dir: Path) -> tuple[list[Path], dict[str, object]]:
        ...

    def edit(self, *, reference_path: Path, prompt: str, model: str, size: str, quality: str, output_dir: Path) -> tuple[list[Path], dict[str, object]]:
        ...

    def save_response_images(self, response: dict[str, object], output_dir: Path) -> list[Path]:
        ...
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
python -m pytest tests/test_backend_helpers.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit backend routes**

Run:

```bash
git add backend/main.py tests/test_backend_helpers.py
git commit -m "Add image generation backend routes"
```

## Task 3: Frontend Shell And Interaction

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/styles.css`
- Create: `frontend/app.js`

- [ ] **Step 1: Create HTML**

Create `frontend/index.html` with:

- API settings form.
- Prompt and option controls.
- Reference upload preview.
- Generate button.
- Empty, loading, error, and result regions.

- [ ] **Step 2: Create CSS**

Create `frontend/styles.css` with:

- App shell using responsive grid.
- Fixed, stable controls.
- Compact cards at no more than 8px radius for repeated result items.
- Balanced neutral palette with a small blue accent.
- Mobile layout under `860px`.

- [ ] **Step 3: Create JavaScript**

Create `frontend/app.js` with:

- `loadSettings()`
- `saveSettings()`
- `handleReferenceChange()`
- `submitGeneration()`
- `renderImages(images, prompt)`
- `renderError(message)`
- image actions: download, copy link, use as reference.

Generation should send `FormData` fields: `prompt`, `model`, `quality`, `count`, `width`, `height`, and optional `reference`.

- [ ] **Step 4: Commit frontend**

Run:

```bash
git add frontend/index.html frontend/styles.css frontend/app.js
git commit -m "Add core image web frontend"
```

## Task 4: Documentation And Verification

**Files:**
- Create: `README.md`
- Modify: any files required by test or smoke-test results.

- [ ] **Step 1: Create README**

Create `README.md` with:

- Project purpose.
- Python setup.
- Install command.
- Run command.
- Browser URL.
- Notes about API settings and saved files.
- Core version scope.

- [ ] **Step 2: Run all tests**

Run:

```bash
python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 3: Start server**

Run:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860
```

Expected: server starts and serves `http://127.0.0.1:7860`.

- [ ] **Step 4: Smoke test HTTP endpoints**

In a second shell, run:

```bash
curl -s http://127.0.0.1:7860/api/settings
curl -I http://127.0.0.1:7860/
```

Expected:

- `/api/settings` returns JSON with `base_url`, `api_key`, `api_key_set`, and `model`.
- `/` returns HTTP 200.

- [ ] **Step 5: Commit docs and final fixes**

Run:

```bash
git add README.md backend frontend tests requirements.txt .gitignore
git commit -m "Document core image web app"
```

