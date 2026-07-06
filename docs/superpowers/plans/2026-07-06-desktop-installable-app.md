# Desktop Installable App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri desktop app that starts the existing FastAPI Image Tools backend automatically and opens the current UI in a native installable window.

**Architecture:** Keep FastAPI as the local backend and package it as a Tauri sidecar. Tauri owns window lifecycle, app data directory selection, sidecar startup, readiness checking, and installer packaging. The frontend keeps using same-origin HTTP routes served by FastAPI.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, pytest, PyInstaller, Node/npm, Tauri v2, Rust.

---

## File Structure

- Modify `backend/main.py`: resolve runtime data paths from `IMAGE_TOOLS_DATA_DIR`, add `/api/health`, keep current web flow.
- Create `backend/desktop_entry.py`: small sidecar entrypoint that starts `uvicorn` from environment variables.
- Modify `tests/test_backend_helpers.py`: tests for runtime path resolution and health endpoint.
- Create `tests/test_desktop_entry.py`: tests for desktop sidecar host/port parsing.
- Create `scripts/bundle_backend.py`: PyInstaller wrapper that emits a Tauri sidecar binary name for the current platform.
- Create `tests/test_bundle_backend.py`: tests for platform-specific sidecar names and PyInstaller arguments.
- Create `package.json`: desktop build scripts using Tauri CLI.
- Create `.mise.toml`: project toolchain and task runner config.
- Create `requirements-dev.txt`: development/build dependencies including PyInstaller.
- Create `src-tauri/Cargo.toml`: Tauri and plugin dependencies.
- Create `src-tauri/tauri.conf.json`: app metadata, bundle settings, sidecar declaration.
- Create `src-tauri/src/main.rs`: Tauri startup, sidecar launch, health wait, window creation, sidecar shutdown.
- Modify `README.md`: document web dev flow and desktop build flow.

---

### Task 1: Backend Runtime Paths And Health Endpoint

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_backend_helpers.py`

- [ ] **Step 1: Write failing tests**

Append these tests to `tests/test_backend_helpers.py`:

```python
from fastapi.testclient import TestClient


def test_runtime_paths_use_environment_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_DATA_DIR", str(tmp_path / "desktop-data"))

    paths = main.resolve_runtime_paths()

    assert paths.data_dir == tmp_path / "desktop-data"
    assert paths.image_dir == tmp_path / "desktop-data" / "images"
    assert paths.upload_dir == tmp_path / "desktop-data" / "uploads"
    assert paths.settings_path == tmp_path / "desktop-data" / "settings.json"


def test_runtime_paths_default_to_repo_data_dir(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_DATA_DIR", raising=False)

    paths = main.resolve_runtime_paths()

    assert paths.data_dir == main.ROOT_DIR / "data"
    assert paths.image_dir == main.ROOT_DIR / "data" / "images"
    assert paths.upload_dir == main.ROOT_DIR / "data" / "uploads"
    assert paths.settings_path == main.ROOT_DIR / "data" / "settings.json"


def test_health_endpoint_returns_ok():
    client = TestClient(main.app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "app": "Image Tools"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest -q tests/test_backend_helpers.py::test_runtime_paths_use_environment_data_dir tests/test_backend_helpers.py::test_runtime_paths_default_to_repo_data_dir tests/test_backend_helpers.py::test_health_endpoint_returns_ok
```

Expected: failures because `resolve_runtime_paths` and `/api/health` do not exist.

- [ ] **Step 3: Implement runtime path resolution and health**

Update the path constants near the top of `backend/main.py` to:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class RuntimePaths:
    data_dir: Path
    image_dir: Path
    upload_dir: Path
    settings_path: Path


def resolve_runtime_paths() -> RuntimePaths:
    configured_data_dir = os.getenv("IMAGE_TOOLS_DATA_DIR", "").strip()
    data_dir = Path(configured_data_dir).expanduser() if configured_data_dir else ROOT_DIR / "data"
    data_dir = data_dir.resolve()
    return RuntimePaths(
        data_dir=data_dir,
        image_dir=data_dir / "images",
        upload_dir=data_dir / "uploads",
        settings_path=data_dir / "settings.json",
    )


RUNTIME_PATHS = resolve_runtime_paths()
DATA_DIR = RUNTIME_PATHS.data_dir
IMAGE_DIR = RUNTIME_PATHS.image_dir
UPLOAD_DIR = RUNTIME_PATHS.upload_dir
SETTINGS_PATH = RUNTIME_PATHS.settings_path
```

Add this route before `GET /api/settings`:

```python
@app.get("/api/health")
def health() -> dict[str, object]:
    return {"ok": True, "app": APP_TITLE}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest -q tests/test_backend_helpers.py::test_runtime_paths_use_environment_data_dir tests/test_backend_helpers.py::test_runtime_paths_default_to_repo_data_dir tests/test_backend_helpers.py::test_health_endpoint_returns_ok
```

Expected: all selected tests pass.

- [ ] **Step 5: Run backend suite and commit**

Run:

```bash
pytest -q
git add backend/main.py tests/test_backend_helpers.py
git commit -m "feat(backend): 添加桌面运行时后端钩子"
```

Expected: all Python tests pass before commit.

---

### Task 2: Desktop Sidecar Entrypoint

**Files:**
- Create: `backend/desktop_entry.py`
- Create: `tests/test_desktop_entry.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_desktop_entry.py`:

```python
from backend import desktop_entry


def test_desktop_host_defaults_to_loopback(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_HOST", raising=False)

    assert desktop_entry.desktop_host() == "127.0.0.1"


def test_desktop_host_uses_non_empty_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_HOST", "0.0.0.0")

    assert desktop_entry.desktop_host() == "0.0.0.0"


def test_desktop_port_defaults_to_7860(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_PORT", raising=False)

    assert desktop_entry.desktop_port() == 7860


def test_desktop_port_uses_valid_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_PORT", "49321")

    assert desktop_entry.desktop_port() == 49321


def test_desktop_port_rejects_invalid_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_PORT", "not-a-port")

    try:
        desktop_entry.desktop_port()
    except ValueError as exc:
        assert "IMAGE_TOOLS_PORT" in str(exc)
    else:
        raise AssertionError("Expected invalid IMAGE_TOOLS_PORT to raise ValueError")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest -q tests/test_desktop_entry.py
```

Expected: import failure because `backend.desktop_entry` does not exist.

- [ ] **Step 3: Implement the entrypoint**

Create `backend/desktop_entry.py`:

```python
from __future__ import annotations

import os

import uvicorn


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7860


def desktop_host() -> str:
    return os.getenv("IMAGE_TOOLS_HOST", "").strip() or DEFAULT_HOST


def desktop_port() -> int:
    raw = os.getenv("IMAGE_TOOLS_PORT", "").strip()
    if not raw:
        return DEFAULT_PORT
    try:
        port = int(raw)
    except ValueError as exc:
        raise ValueError("IMAGE_TOOLS_PORT must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("IMAGE_TOOLS_PORT must be between 1 and 65535")
    return port


def main() -> None:
    uvicorn.run("backend.main:app", host=desktop_host(), port=desktop_port(), log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest -q tests/test_desktop_entry.py
```

Expected: all sidecar entrypoint tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
pytest -q
git add backend/desktop_entry.py tests/test_desktop_entry.py
git commit -m "feat(backend): 添加桌面后端启动入口"
```

Expected: full Python test suite passes before commit.

---

### Task 3: Backend Bundle Script

**Files:**
- Create: `scripts/bundle_backend.py`
- Create: `tests/test_bundle_backend.py`
- Create: `requirements-dev.txt`

- [ ] **Step 1: Write failing tests**

Create `tests/test_bundle_backend.py`:

```python
from pathlib import Path

from scripts import bundle_backend


def test_sidecar_filename_adds_target_triple_before_extension():
    assert (
        bundle_backend.sidecar_filename("imagetools-backend", "x86_64-unknown-linux-gnu")
        == "imagetools-backend-x86_64-unknown-linux-gnu"
    )
    assert (
        bundle_backend.sidecar_filename("imagetools-backend", "x86_64-pc-windows-msvc")
        == "imagetools-backend-x86_64-pc-windows-msvc.exe"
    )


def test_pyinstaller_args_target_desktop_entry(tmp_path):
    project_root = tmp_path
    output_path = project_root / "src-tauri" / "binaries" / "imagetools-backend-x86_64-unknown-linux-gnu"

    args = bundle_backend.pyinstaller_args(project_root, output_path)

    assert args[:3] == ["-m", "PyInstaller", "--clean"]
    assert "--onefile" in args
    assert "--name" in args
    assert str(project_root / "backend" / "desktop_entry.py") in args
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pytest -q tests/test_bundle_backend.py
```

Expected: import failure because `scripts.bundle_backend` does not exist.

- [ ] **Step 3: Implement bundle helper**

Create `scripts/bundle_backend.py`:

```python
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


APP_NAME = "imagetools-backend"


def current_target_triple() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()
    arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
    if system == "darwin":
        return f"{arch}-apple-darwin"
    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    return f"{arch}-unknown-linux-gnu"


def sidecar_filename(name: str, target_triple: str) -> str:
    suffix = ".exe" if "windows" in target_triple else ""
    return f"{name}-{target_triple}{suffix}"


def pyinstaller_args(project_root: Path, output_path: Path) -> list[str]:
    entrypoint = project_root / "backend" / "desktop_entry.py"
    work_dir = project_root / "build" / "pyinstaller"
    spec_dir = project_root / "build"
    return [
        "-m",
        "PyInstaller",
        "--clean",
        "--onefile",
        "--name",
        output_path.stem,
        "--distpath",
        str(output_path.parent),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        str(entrypoint),
    ]


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    target_triple = os.getenv("TAURI_TARGET_TRIPLE", "").strip() or current_target_triple()
    output_dir = project_root / "src-tauri" / "binaries"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / sidecar_filename(APP_NAME, target_triple)
    if not shutil.which("pyinstaller") and not shutil.which("PyInstaller"):
        raise SystemExit("PyInstaller is not installed. Run: python -m pip install -r requirements-dev.txt")
    subprocess.run([sys.executable, *pyinstaller_args(project_root, output_path)], cwd=project_root, check=True)


if __name__ == "__main__":
    main()
```

Create `requirements-dev.txt`:

```text
-r requirements.txt
pyinstaller>=6.0.0
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pytest -q tests/test_bundle_backend.py
```

Expected: bundle helper tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
pytest -q
git add scripts/bundle_backend.py tests/test_bundle_backend.py requirements-dev.txt
git commit -m "feat(build): 添加后端 sidecar 打包脚本"
```

Expected: full Python suite passes before commit.

---

### Task 4: Tauri Desktop Shell

**Files:**
- Create: `.mise.toml`
- Create: `package.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`

- [ ] **Step 1: Write Rust unit tests inside the Tauri entrypoint**

Create `src-tauri/src/main.rs` with these pure tests and placeholder functions:

```rust
fn health_response_is_ok(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

#[cfg(test)]
mod tests {
    use super::health_response_is_ok;

    #[test]
    fn accepts_http_11_health_success() {
        assert!(health_response_is_ok("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}"));
    }

    #[test]
    fn rejects_health_failure_status() {
        assert!(!health_response_is_ok("HTTP/1.1 503 Service Unavailable\r\n\r\n"));
    }
}
```

- [ ] **Step 2: Run Rust tests to verify the test harness works**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected in the current environment: this cannot run until Rust is installed. After Rust is installed and `Cargo.toml` exists, these tests should pass.

- [ ] **Step 3: Add Tauri package files**

Create `.mise.toml`:

```toml
[tools]
node = "24.16.0"
python = "3.12.13"
rust = "1.96.1"

[env]
RUSTUP_DIST_SERVER = "https://mirrors.tuna.tsinghua.edu.cn/rustup"
RUSTUP_UPDATE_ROOT = "https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup"

[tasks.install]
description = "Install Python and Node dependencies"
run = "python -m pip install -r requirements-dev.txt && npm install"

[tasks.test]
description = "Run backend and frontend tests"
run = "pytest -q && node --test tests/frontend_preferences.test.js"

[tasks.backend-bundle]
description = "Build the Python backend sidecar"
run = "python scripts/bundle_backend.py"

[tasks.desktop-check]
description = "Check the Tauri Rust project"
run = "cargo check --manifest-path src-tauri/Cargo.toml"

[tasks.desktop-prereqs]
description = "Check Linux system packages required by Tauri"
run = "python scripts/check_tauri_linux_deps.py"

[tasks.desktop-dev]
description = "Run the Tauri desktop app in development mode"
run = "npm run desktop:dev"

[tasks.desktop-build]
description = "Build the Tauri desktop app"
run = "npm run desktop:build"
```

Create `package.json`:

```json
{
  "name": "imagetools",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "backend:bundle": "python scripts/bundle_backend.py",
    "desktop:dev": "npm run backend:bundle && tauri dev",
    "desktop:build": "npm run backend:bundle && tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "imagetools"
version = "0.1.0"
description = "Image Tools desktop app"
authors = ["Image Tools"]
edition = "2021"

[lib]
name = "imagetools_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[[bin]]
name = "imagetools"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
url = "2"
```

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Image Tools",
  "version": "0.1.0",
  "identifier": "com.imagetools.app",
  "build": {
    "beforeDevCommand": "",
    "beforeBuildCommand": "",
    "devUrl": "http://127.0.0.1:7860"
  },
  "app": {
    "withGlobalTauri": false,
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": ["binaries/imagetools-backend"]
  }
}
```

- [ ] **Step 4: Implement Tauri startup**

Replace `src-tauri/src/main.rs` with:

```rust
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use url::Url;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn find_available_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn health_response_is_ok(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn request_health(port: u16) -> bool {
    let address = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect(address) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    health_response_is_ok(&response)
}

fn wait_for_backend(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if request_health(port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("backend did not become ready before timeout".into())
}

fn start_backend(app: &tauri::App) -> Result<u16, Box<dyn std::error::Error>> {
    let port = find_available_port()?;
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let (_events, child) = app
        .shell()
        .sidecar("imagetools-backend")?
        .env("IMAGE_TOOLS_HOST", "127.0.0.1")
        .env("IMAGE_TOOLS_PORT", port.to_string())
        .env("IMAGE_TOOLS_DATA_DIR", data_dir.to_string_lossy().to_string())
        .spawn()?;
    app.manage(BackendProcess(Mutex::new(Some(child))));
    wait_for_backend(port)?;
    Ok(port)
}

fn stop_backend(app_handle: &tauri::AppHandle) {
    if let Some(state) = app_handle.try_state::<BackendProcess>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let port = start_backend(app)?;
            let url = Url::parse(&format!("http://127.0.0.1:{port}/"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Image Tools")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                stop_backend(&window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Image Tools desktop app");
}

#[cfg(test)]
mod tests {
    use super::health_response_is_ok;

    #[test]
    fn accepts_http_11_health_success() {
        assert!(health_response_is_ok("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}"));
    }

    #[test]
    fn rejects_health_failure_status() {
        assert!(!health_response_is_ok("HTTP/1.1 503 Service Unavailable\r\n\r\n"));
    }
}
```

- [ ] **Step 5: Verify the Rust project**

Run after Rust is installed:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust tests and checks pass. If APIs differ from the installed Tauri version, adjust only the Tauri startup code until these checks pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add .mise.toml package.json src-tauri
git commit -m "feat(desktop): 添加 Tauri 桌面壳"
```

Expected: Tauri files are committed after Rust checks pass, or committed with a clear note if Rust is unavailable in the environment.

---

### Task 5: Documentation And Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add a desktop section after the existing web run instructions:

```markdown
## 桌面安装版

桌面版使用 Tauri 打包。Tauri 负责原生窗口和安装包，Python/FastAPI 后端会作为 sidecar 自动启动。

### 桌面开发依赖

推荐使用 `mise` 安装项目工具链：

```bash
mise install
```

项目 `.mise.toml` 固定了：

- Python 3.12.13
- Node.js 24.16.0
- Rust 1.96.1

还需要安装当前平台的 Tauri 系统依赖。

安装 Python 和 Node 依赖：

```bash
mise run install
```

检查 Linux 桌面系统依赖：

```bash
mise run desktop-prereqs
```

### 启动桌面开发版

```bash
mise run desktop-dev
```

### 构建安装包

```bash
mise run desktop-build
```

构建产物位于 `src-tauri/target/release/bundle/`。桌面版运行时数据会保存到系统应用数据目录；普通 Web 开发仍默认使用仓库内的 `data/`。
```

- [ ] **Step 2: Run automated verification**

Run:

```bash
mise run test
mise run install
```

Expected: Python tests pass, Node tests pass, npm creates or updates `package-lock.json`.

- [ ] **Step 3: Run desktop verification where dependencies exist**

Run:

```bash
mise run desktop-prereqs
mise run backend-bundle
mise run desktop-check
mise run desktop-build
```

Expected: sidecar bundle is created, Rust check passes, Tauri build creates an installer bundle. If Rust or PyInstaller is missing, record the missing dependency exactly and leave the goal active.

- [ ] **Step 4: Commit docs and lockfile**

Run:

```bash
git add README.md package-lock.json
git commit -m "docs(readme): 记录桌面应用构建流程"
```

Expected: docs and npm lockfile are committed.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `feature/installable-app`, or only generated build artifacts ignored by git.
