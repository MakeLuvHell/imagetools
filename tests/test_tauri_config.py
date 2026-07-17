import json
from pathlib import Path


def tauri_config() -> dict:
    return json.loads(Path("src-tauri/tauri.conf.json").read_text())


def test_tauri_identifier_avoids_macos_app_suffix():
    assert not tauri_config()["identifier"].endswith(".app")


def test_tauri_linux_bundle_targets_are_installers_without_appimage_download():
    assert tauri_config()["bundle"]["targets"] == ["deb", "rpm"]


def test_tauri_main_binary_name_is_the_branded_windows_executable():
    assert tauri_config()["mainBinaryName"] == "Image Tools"


def test_tauri_bundle_uses_project_icon():
    icons = tauri_config()["bundle"]["icon"]

    assert "icons/icon.png" in icons
    assert "icons/icon.ico" in icons


def test_tauri_windows_icon_file_exists():
    assert Path("src-tauri/icons/icon.ico").is_file()


def test_tauri_windows_bundle_is_wix_only_and_simplified_chinese():
    windows = tauri_config()["bundle"]["windows"]

    assert windows == {"wix": {"language": "zh-CN"}}
    assert "nsis" not in json.dumps(tauri_config()).lower()


def test_tauri_windows_release_app_uses_gui_subsystem():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert 'windows_subsystem = "windows"' in main_rs


def test_tauri_registers_shutdown_handler_before_the_event_loop_starts():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    handler = ".on_window_event(|window, event| {"
    assert handler in main_rs
    assert main_rs.index(handler) < main_rs.index(".run(tauri::generate_context!())")
    assert "window.on_window_event" not in main_rs
    shutdown_handler = main_rs[main_rs.index(handler) : main_rs.index(".run(tauri::generate_context!())")]
    assert shutdown_handler.index("std::thread::spawn") < shutdown_handler.index(
        "window.app_handle().exit(0)"
    )


def test_tauri_loads_bundled_assets_without_a_sidecar_or_dev_server():
    config = tauri_config()

    assert config["build"] == {
        "beforeDevCommand": "",
        "beforeBuildCommand": "",
        "frontendDist": "../frontend",
    }
    assert "externalBin" not in config["bundle"]
    assert not Path("src-tauri/tauri.dev.conf.json").exists()


def test_desktop_scripts_invoke_tauri_directly():
    scripts = json.loads(Path("package.json").read_text())["scripts"]

    assert scripts["desktop:dev"] == "tauri dev"
    assert scripts["desktop:build"] == "tauri build"
    assert "backend:bundle" not in scripts


def test_python_sidecar_sources_and_shell_plugin_are_absent():
    cargo = Path("src-tauri/Cargo.toml").read_text()
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert not Path("backend").exists()
    assert not Path("scripts/bundle_backend.py").exists()
    assert not Path("scripts/run_desktop_dev_backend.py").exists()
    assert not Path("scripts/run_desktop_dev.js").exists()
    assert "tauri-plugin-shell" not in cargo
    assert "tauri_plugin_shell" not in main_rs


def test_tauri_initializes_workbench_from_absolute_app_directories_and_overrides():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert "app.path().app_data_dir()?" in main_rs
    assert "app.path().app_local_data_dir()?" in main_rs
    assert 'std::env::var_os("IMAGE_TOOLS_DATA_DIR")' in main_rs
    assert 'std::env::var_os("IMAGE_TOOLS_CONFIG_DIR")' in main_rs
    assert "path.is_absolute()" in main_rs
    assert "WorkbenchState::initialize(&data_dir, &config_dir)" in main_rs


def test_tauri_exposes_a_native_directory_picker_command():
    main_rs = Path("src-tauri/src/main.rs").read_text()
    cargo = Path("src-tauri/Cargo.toml").read_text()
    config = tauri_config()

    assert "tauri-plugin-dialog" in cargo
    assert "tauri_plugin_dialog::init()" in main_rs
    assert "pick_data_directory" in main_rs
    assert "save_result_image" in main_rs
    assert "generate_workbench_handler![" in main_rs
    assert config["app"]["withGlobalTauri"] is True


def test_tauri_exposes_native_window_theme_sync():
    main_rs = Path("src-tauri/src/main.rs").read_text()

    assert "fn theme_override" in main_rs
    assert "fn set_app_theme" in main_rs
    assert "window.set_theme(theme)" in main_rs
    assert "set_app_theme" in main_rs
