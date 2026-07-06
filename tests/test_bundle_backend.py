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
