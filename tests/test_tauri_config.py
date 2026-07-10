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
    assert command["script"] == "python scripts/run_desktop_dev_backend.py"
    assert config["bundle"]["externalBin"] == []


def test_desktop_dev_uses_dev_overlay_without_bundling_sidecar():
    package = json.loads(Path("package.json").read_text())
    command = package["scripts"]["desktop:dev"]

    assert command == "node scripts/run_desktop_dev.js"
    assert "backend:bundle" not in command


def test_desktop_dev_rejects_release_profile_that_needs_a_sidecar():
    script = Path("scripts/run_desktop_dev.js").read_text()

    assert "--release" in script
    assert "not supported" in script


def test_tauri_rust_selects_source_backend_only_for_debug_builds():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert "const DEV_BACKEND_PORT: u16 = 7860;" in main_rs
    assert "#[cfg(debug_assertions)]" in main_rs
    assert "#[cfg(not(debug_assertions))]" in main_rs
    assert "prepare_backend(app)" in main_rs


def test_tauri_debug_backend_requires_the_launcher_token():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert "DEV_BACKEND_TOKEN_PATH" in main_rs
    assert "read_dev_backend_token" in main_rs
    assert "wait_for_dev_backend" in main_rs
