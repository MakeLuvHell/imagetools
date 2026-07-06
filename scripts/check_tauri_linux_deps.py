from __future__ import annotations

import shutil
import subprocess
import sys
from collections.abc import Callable, Iterable


REQUIRED_COMMANDS = ["pkg-config"]
REQUIRED_PKG_CONFIG_MODULES = [
    "glib-2.0",
    "gobject-2.0",
    "gio-2.0",
    "gdk-3.0",
    "gtk+-3.0",
    "webkit2gtk-4.1",
    "ayatana-appindicator3-0.1",
    "librsvg-2.0",
    "xdo",
]
UBUNTU_PACKAGES = [
    "build-essential",
    "curl",
    "file",
    "libayatana-appindicator3-dev",
    "librsvg2-dev",
    "libssl-dev",
    "libwebkit2gtk-4.1-dev",
    "libxdo-dev",
    "pkg-config",
    "wget",
]


def missing_commands(which: Callable[[str], str | None] = shutil.which) -> list[str]:
    return [command for command in REQUIRED_COMMANDS if which(command) is None]


def missing_pkg_config_modules(
    modules: Iterable[str] = REQUIRED_PKG_CONFIG_MODULES,
    runner: Callable[[list[str]], int] | None = None,
) -> list[str]:
    if runner is None:
        runner = _pkg_config_runner
    return [module for module in modules if runner(["pkg-config", "--exists", module]) != 0]


def _pkg_config_runner(command: list[str]) -> int:
    return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode


def format_ubuntu_install_hint() -> str:
    package_lines = " \\\n  ".join(UBUNTU_PACKAGES)
    return f"sudo apt install -y \\\n  {package_lines}"


def main() -> int:
    missing_tools = missing_commands()
    if missing_tools:
        print(f"Missing commands: {', '.join(missing_tools)}", file=sys.stderr)
        print(format_ubuntu_install_hint(), file=sys.stderr)
        return 1

    missing_modules = missing_pkg_config_modules()
    if missing_modules:
        print(f"Missing pkg-config modules: {', '.join(missing_modules)}", file=sys.stderr)
        print(format_ubuntu_install_hint(), file=sys.stderr)
        return 1

    print("Tauri Linux system dependencies are available.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
