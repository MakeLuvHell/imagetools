import json
from pathlib import Path


def tauri_config() -> dict:
    return json.loads(Path("src-tauri/tauri.conf.json").read_text())


def test_tauri_identifier_avoids_macos_app_suffix():
    assert not tauri_config()["identifier"].endswith(".app")


def test_tauri_linux_bundle_targets_are_installers_without_appimage_download():
    assert tauri_config()["bundle"]["targets"] == ["deb", "rpm"]


def test_tauri_bundle_uses_project_icon():
    icons = tauri_config()["bundle"]["icon"]

    assert "icons/icon.png" in icons
    assert "icons/icon.ico" in icons


def test_tauri_windows_icon_file_exists():
    assert Path("src-tauri/icons/icon.ico").is_file()


def test_tauri_windows_release_app_uses_gui_subsystem():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert 'windows_subsystem = "windows"' in main_rs


def test_tauri_dev_uses_reloadable_source_backend():
    config = json.loads(Path("src-tauri/tauri.dev.conf.json").read_text())
    command = config["build"]["beforeDevCommand"]

    assert command["cwd"] == ".."
    assert command["wait"] is False
    assert "uvicorn backend.main:app" in command["script"]
    assert "--port 7860" in command["script"]
    assert "--reload" in command["script"]
    assert config["bundle"]["externalBin"] == []


def test_desktop_dev_uses_dev_overlay_without_bundling_sidecar():
    package = json.loads(Path("package.json").read_text())
    command = package["scripts"]["desktop:dev"]

    assert "tauri dev" in command
    assert "tauri.dev.conf.json" in command
    assert "backend:bundle" not in command
