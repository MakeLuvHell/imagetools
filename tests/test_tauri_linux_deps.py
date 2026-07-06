from scripts import check_tauri_linux_deps as deps


def test_missing_commands_reports_absent_pkg_config():
    missing = deps.missing_commands(lambda name: None if name == "pkg-config" else f"/usr/bin/{name}")

    assert missing == ["pkg-config"]


def test_missing_pkg_config_modules_uses_runner_exit_codes():
    def fake_runner(command):
        return 1 if command[-1] == "webkit2gtk-4.1" else 0

    missing = deps.missing_pkg_config_modules(
        modules=["glib-2.0", "webkit2gtk-4.1"],
        runner=fake_runner,
    )

    assert missing == ["webkit2gtk-4.1"]


def test_format_ubuntu_install_hint_lists_required_packages():
    hint = deps.format_ubuntu_install_hint()

    assert "sudo apt install -y" in hint
    assert "pkg-config" in hint
    assert "libwebkit2gtk-4.1-dev" in hint
