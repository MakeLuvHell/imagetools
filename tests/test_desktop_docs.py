from pathlib import Path


README = Path("README.md")
RELEASE_DOC = Path("docs/releases/github-release.md")


def test_readme_is_desktop_first_and_documents_runtime_storage():
    text = README.read_text(encoding="utf-8")

    assert "Windows 桌面图片创作工作台" in text
    assert "单一 Tauri/Rust 应用进程" in text
    assert "Image Tools.exe" in text
    assert "Tauri IPC" in text
    assert "不监听 UI 端口" in text
    assert "workbench.sqlite3" in text
    assert "images/" in text
    assert "uploads/" in text
    assert "mise run desktop-dev" in text
    assert "mise run test" in text
    assert "mise run desktop-check" in text
    assert "mise run desktop-build" in text
    assert "核心版 Web 生图工具" not in text
    for retired_term in (
        "FastAPI",
        "Uvicorn",
        "PyInstaller",
        "sidecar",
        "backend-bundle",
        "NSIS",
    ):
        assert retired_term not in text


def test_release_docs_mention_windows_x64_assets_and_gate():
    text = RELEASE_DOC.read_text(encoding="utf-8")

    assert "Windows x64" in text
    assert "desktop:build:windows" in text
    assert "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi" in text
    assert "Image-Tools-v0.4.0-Windows-x64.msi" in text
    assert "Image-Tools-v0.4.0-Windows-x64-Portable.zip" in text
    assert "verify_windows_single_process.ps1" in text
