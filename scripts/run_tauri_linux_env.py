from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts import bootstrap_tauri_linux_sysroot as bootstrap
from scripts import check_tauri_linux_deps as deps


def sysroot_path(project_root: Path) -> Path:
    return project_root / "build" / "tauri-sysroot"


def sysroot_env(sysroot: Path, base_env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    lib_dir = sysroot / "usr" / "lib" / "x86_64-linux-gnu"
    usr_lib = sysroot / "usr" / "lib"
    include_dir = sysroot / "usr" / "include"
    include_arch_dir = include_dir / "x86_64-linux-gnu"
    pkg_config_dirs = [
        lib_dir / "pkgconfig",
        usr_lib / "pkgconfig",
        sysroot / "usr" / "share" / "pkgconfig",
    ]
    env["PATH"] = f"{sysroot / 'usr' / 'bin'}:{env.get('PATH', '')}"
    env["LD_LIBRARY_PATH"] = f"{lib_dir}:{usr_lib}:{env.get('LD_LIBRARY_PATH', '')}"
    env["PKG_CONFIG_SYSROOT_DIR"] = str(sysroot)
    env["PKG_CONFIG_LIBDIR"] = ":".join(str(path) for path in pkg_config_dirs)
    env["LIBRARY_PATH"] = f"{lib_dir}:{usr_lib}:{env.get('LIBRARY_PATH', '')}"
    env["C_INCLUDE_PATH"] = f"{include_dir}:{include_arch_dir}:{env.get('C_INCLUDE_PATH', '')}"
    env["CPLUS_INCLUDE_PATH"] = f"{include_dir}:{include_arch_dir}:{env.get('CPLUS_INCLUDE_PATH', '')}"
    return env


def system_dependencies_available() -> bool:
    if deps.missing_commands():
        return False
    return not deps.missing_pkg_config_modules()


def sysroot_dependencies_available(sysroot: Path) -> bool:
    if bootstrap.broken_library_symlink_targets(sysroot):
        return False
    env = sysroot_env(sysroot)
    path = env["PATH"]
    if shutil.which("pkg-config", path=path) is None:
        return False

    def runner(command: list[str]) -> int:
        return subprocess.run(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode

    return not deps.missing_pkg_config_modules(runner=runner)


def command_env(project_root: Path) -> dict[str, str]:
    if platform.system().lower() != "linux" or system_dependencies_available():
        return dict(os.environ)
    sysroot = sysroot_path(project_root)
    if not sysroot_dependencies_available(sysroot):
        bootstrap.bootstrap(project_root)
    return sysroot_env(sysroot)


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if not args:
        print("Usage: run_tauri_linux_env.py <command> [args...]", file=sys.stderr)
        return 2
    return subprocess.run(args, cwd=PROJECT_ROOT, env=command_env(PROJECT_ROOT), check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
