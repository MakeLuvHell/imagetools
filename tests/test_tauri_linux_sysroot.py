from pathlib import Path
import subprocess
import sys

import pytest

from scripts import bootstrap_tauri_linux_sysroot as bootstrap
from scripts import run_tauri_linux_env as runner


def test_parse_apt_print_uris_extracts_url_and_filename():
    output = "\n".join(
        [
            "Reading package lists...",
            "'http://example.test/pkgconf.deb' pkgconf_1.0_amd64.deb 123 MD5Sum:abc",
            "'http://example.test/libgtk.deb' libgtk_1.0_amd64.deb 456 MD5Sum:def",
        ]
    )

    packages = bootstrap.parse_apt_print_uris(output)

    assert packages == [
        ("http://example.test/pkgconf.deb", "pkgconf_1.0_amd64.deb"),
        ("http://example.test/libgtk.deb", "libgtk_1.0_amd64.deb"),
    ]


def test_parse_apt_print_uris_rejects_empty_package_list():
    try:
        bootstrap.parse_apt_print_uris("Reading package lists...")
    except ValueError as exc:
        assert "No apt package URIs" in str(exc)
    else:
        raise AssertionError("Expected missing apt URIs to raise ValueError")


def test_download_packages_falls_back_when_apt_uri_resolution_fails(tmp_path, monkeypatch):
    def fail_apt_package_uris(_packages):
        raise subprocess.CalledProcessError(100, ["apt-get", "--print-uris"])

    downloaded = []
    monkeypatch.setattr(bootstrap, "apt_package_uris", fail_apt_package_uris)
    monkeypatch.setattr(
        bootstrap,
        "download_seed_package",
        lambda package, deb_dir: downloaded.append((package, deb_dir)),
    )

    bootstrap.download_packages(["libgtk-3-0t64"], tmp_path)

    assert downloaded == [("libgtk-3-0t64", tmp_path)]


def test_package_name_from_dpkg_owner_strips_arch_suffix():
    package = bootstrap.package_name_from_dpkg_owner(
        "libgtk-3-0t64:amd64: /usr/lib/x86_64-linux-gnu/libgtk-3.so.0"
    )

    assert package == "libgtk-3-0t64"


def test_package_name_from_dpkg_owner_returns_empty_for_missing_output():
    assert bootstrap.package_name_from_dpkg_owner("") == ""


def test_broken_library_symlink_targets_follow_symlink_chain(tmp_path):
    sysroot = tmp_path / "tauri-sysroot"
    lib_dir = sysroot / "usr" / "lib" / "x86_64-linux-gnu"
    lib_dir.mkdir(parents=True)
    (lib_dir / "libpng.so").symlink_to("libpng16.so")
    (lib_dir / "libpng16.so").symlink_to("libpng16.so.16")

    targets = bootstrap.broken_library_symlink_targets(sysroot)

    assert targets == [lib_dir / "libpng16.so.16"]


def test_runtime_packages_for_broken_symlinks_uses_dpkg_owners(tmp_path):
    sysroot = tmp_path / "tauri-sysroot"
    lib_dir = sysroot / "usr" / "lib" / "x86_64-linux-gnu"
    lib_dir.mkdir(parents=True)
    (lib_dir / "libgtk-3.so").symlink_to("libgtk-3.so.0")

    def fake_dpkg_owner(path: str) -> str:
        assert path == "/usr/lib/x86_64-linux-gnu/libgtk-3.so.0"
        return "libgtk-3-0t64:amd64: /usr/lib/x86_64-linux-gnu/libgtk-3.so.0"

    packages = bootstrap.runtime_packages_for_broken_symlinks(sysroot, owner=fake_dpkg_owner)

    assert packages == {"libgtk-3-0t64"}


def test_sysroot_dependencies_reject_broken_library_links(tmp_path, monkeypatch):
    lib_dir = tmp_path / "usr" / "lib" / "x86_64-linux-gnu"
    lib_dir.mkdir(parents=True)
    (lib_dir / "libgtk-3.so").symlink_to("libgtk-3.so.0")
    monkeypatch.setattr(runner, "sysroot_env", lambda _: {"PATH": "/usr/bin"})
    monkeypatch.setattr(runner.shutil, "which", lambda *_args, **_kwargs: "/usr/bin/pkg-config")
    monkeypatch.setattr(runner.deps, "missing_pkg_config_modules", lambda **_kwargs: [])

    assert not runner.sysroot_dependencies_available(tmp_path)


def test_sysroot_env_points_pkg_config_to_local_sysroot(tmp_path):
    sysroot = tmp_path / "tauri-sysroot"
    env = runner.sysroot_env(sysroot, {"PATH": "/usr/bin", "LD_LIBRARY_PATH": ""})

    assert env["PATH"].startswith(str(sysroot / "usr" / "bin"))
    assert env["PKG_CONFIG_SYSROOT_DIR"] == str(sysroot)
    assert str(sysroot / "usr" / "lib" / "x86_64-linux-gnu" / "pkgconfig") in env["PKG_CONFIG_LIBDIR"]
    assert str(sysroot / "usr" / "include") in env["C_INCLUDE_PATH"]


def test_sysroot_path_uses_build_directory():
    assert runner.sysroot_path(Path("/repo")) == Path("/repo/build/tauri-sysroot")


def test_command_env_rejects_sysroot_that_remains_incomplete_after_bootstrap(tmp_path, monkeypatch):
    sysroot = tmp_path / "build" / "tauri-sysroot"
    unresolved_target = sysroot / "usr" / "lib" / "x86_64-linux-gnu" / "libgtk-3.so.0"
    monkeypatch.setattr(runner.platform, "system", lambda: "Linux")
    monkeypatch.setattr(runner, "system_dependencies_available", lambda: False)
    monkeypatch.setattr(runner, "sysroot_path", lambda _project_root: sysroot)
    monkeypatch.setattr(runner, "sysroot_dependencies_available", lambda _sysroot: False)
    monkeypatch.setattr(runner.bootstrap, "bootstrap", lambda _project_root: sysroot)
    monkeypatch.setattr(runner.bootstrap, "broken_library_symlink_targets", lambda _sysroot: [unresolved_target])

    with pytest.raises(RuntimeError, match="libgtk-3.so.0"):
        runner.command_env(tmp_path)


def test_run_tauri_linux_env_script_can_run_without_args():
    result = subprocess.run(
        [sys.executable, "scripts/run_tauri_linux_env.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )

    assert result.returncode == 2
    assert "Usage: run_tauri_linux_env.py" in result.stderr
