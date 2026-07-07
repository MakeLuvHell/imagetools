from pathlib import Path
import sys

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


def test_pyinstaller_args_hide_windows_sidecar_console(tmp_path):
    output_path = tmp_path / "src-tauri" / "binaries" / "imagetools-backend-x86_64-pc-windows-msvc.exe"

    args = bundle_backend.pyinstaller_args(tmp_path, output_path)

    assert "--noconsole" in args


def test_pyinstaller_args_keep_linux_sidecar_console_available(tmp_path):
    output_path = tmp_path / "src-tauri" / "binaries" / "imagetools-backend-x86_64-unknown-linux-gnu"

    args = bundle_backend.pyinstaller_args(tmp_path, output_path)

    assert "--noconsole" not in args


def test_build_backend_uses_current_python_pyinstaller_module(tmp_path, monkeypatch):
    captured = {}
    expected_path = tmp_path / "src-tauri" / "binaries" / "imagetools-backend-x86_64-pc-windows-msvc.exe"

    monkeypatch.setattr(bundle_backend, "pyinstaller_available", lambda: True)

    def fake_run(command, cwd, check):
        captured["command"] = command
        captured["cwd"] = cwd
        captured["check"] = check

    monkeypatch.setattr(bundle_backend.subprocess, "run", fake_run)

    output_path = bundle_backend.build_backend(tmp_path, "x86_64-pc-windows-msvc")

    assert output_path == expected_path
    assert captured["command"][:4] == [sys.executable, "-m", "PyInstaller", "--clean"]
    assert captured["cwd"] == tmp_path
    assert captured["check"] is True
