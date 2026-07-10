from pathlib import Path


README = Path("README.md")
RELEASE_DOC = Path("docs/releases/github-release.md")


def test_readme_is_desktop_first_and_documents_runtime_storage():
    text = README.read_text(encoding="utf-8")

    assert "Windows 桌面图片创作工作台" in text
    assert "浏览器入口仅作为开发测试入口" in text
    assert "workbench.sqlite3" in text
    assert "providers" in text
    assert "generation_runs" in text
    assert "data/images/" in text
    assert "mise run desktop-dev" in text
    assert "mise run test" in text
    assert "mise run desktop-check" in text
    assert "mise run desktop-build" in text
    assert "核心版 Web 生图工具" not in text
    assert "打开：\n\n```text\nhttp://127.0.0.1:7860" not in text


def test_release_docs_mention_windows_x64_installer_path():
    text = RELEASE_DOC.read_text(encoding="utf-8")

    assert "Windows x64" in text
    assert "desktop:build:windows" in text
    assert "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis" in text
    assert "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi" in text
