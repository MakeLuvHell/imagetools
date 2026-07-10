from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.bootstrap_playwright_linux_sysroot import bootstrap


def command_env() -> dict[str, str]:
    env = dict(os.environ)
    if platform.system().lower() != "linux":
        return env
    sysroot = PROJECT_ROOT / "build" / "playwright-sysroot"
    lib_dir = sysroot / "usr" / "lib" / "x86_64-linux-gnu"
    if not (lib_dir / "libnspr4.so").exists() or not (lib_dir / "libnss3.so").exists():
        bootstrap(PROJECT_ROOT)
    env["LD_LIBRARY_PATH"] = f"{lib_dir}:{env.get('LD_LIBRARY_PATH', '')}"
    return env


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: run_playwright_linux_env.py <command> [args...]", file=sys.stderr)
        return 2
    return subprocess.run(
        sys.argv[1:],
        cwd=PROJECT_ROOT,
        env=command_env(),
        check=False,
    ).returncode


if __name__ == "__main__":
    raise SystemExit(main())
