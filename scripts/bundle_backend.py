from __future__ import annotations

import os
import platform
import subprocess
import sys
from importlib.util import find_spec
from pathlib import Path


APP_NAME = "imagetools-backend"


def current_target_triple() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()
    arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
    if system == "darwin":
        return f"{arch}-apple-darwin"
    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    return f"{arch}-unknown-linux-gnu"


def sidecar_filename(name: str, target_triple: str) -> str:
    suffix = ".exe" if "windows" in target_triple else ""
    return f"{name}-{target_triple}{suffix}"


def pyinstaller_args(project_root: Path, output_path: Path) -> list[str]:
    entrypoint = project_root / "backend" / "desktop_entry.py"
    work_dir = project_root / "build" / "pyinstaller"
    spec_dir = project_root / "build"
    return [
        "-m",
        "PyInstaller",
        "--clean",
        "--onefile",
        "--name",
        output_path.stem,
        "--distpath",
        str(output_path.parent),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        str(entrypoint),
    ]


def pyinstaller_available() -> bool:
    return find_spec("PyInstaller") is not None


def build_backend(project_root: Path, target_triple: str) -> Path:
    output_dir = project_root / "src-tauri" / "binaries"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / sidecar_filename(APP_NAME, target_triple)
    if not pyinstaller_available():
        raise SystemExit("PyInstaller is not installed. Run: python -m pip install -r requirements-dev.txt")
    subprocess.run([sys.executable, *pyinstaller_args(project_root, output_path)], cwd=project_root, check=True)
    return output_path


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    target_triple = os.getenv("TAURI_TARGET_TRIPLE", "").strip() or current_target_triple()
    build_backend(project_root, target_triple)


if __name__ == "__main__":
    main()
