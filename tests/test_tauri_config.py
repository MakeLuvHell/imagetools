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
