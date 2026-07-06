from __future__ import annotations

import os
import subprocess
from collections.abc import Callable, Iterable
from pathlib import Path


APT_PACKAGES = [
    "pkg-config",
    "shared-mime-info",
    "libglib2.0-dev",
    "libgtk-3-dev",
    "libwebkit2gtk-4.1-dev",
    "libayatana-appindicator3-dev",
    "librsvg2-dev",
    "libxdo-dev",
]
LIBRARY_DIRS = [
    Path("usr/lib/x86_64-linux-gnu"),
    Path("usr/lib"),
]


def parse_apt_print_uris(output: str) -> list[tuple[str, str]]:
    packages: list[tuple[str, str]] = []
    for line in output.splitlines():
        if not line.startswith("'http"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        packages.append((parts[0].strip("'"), parts[1]))
    if not packages:
        raise ValueError("No apt package URIs found in apt-get output")
    return packages


def apt_package_uris(packages: list[str]) -> list[tuple[str, str]]:
    result = subprocess.run(
        ["apt-get", "--print-uris", "--yes", "install", *packages],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return parse_apt_print_uris(result.stdout)


def package_name_from_dpkg_owner(output: str) -> str:
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        owner = line.split(": ", 1)[0].split(",", 1)[0].strip()
        return owner.split(":", 1)[0]
    return ""


def dpkg_owner(path: str) -> str:
    result = subprocess.run(
        ["dpkg", "-S", path],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def _resolve_sysroot_symlink(path: Path, sysroot: Path) -> Path:
    current = path
    seen: set[Path] = set()
    for _ in range(40):
        if not current.is_symlink() or current in seen:
            return current
        seen.add(current)
        target = Path(os.readlink(current))
        if target.is_absolute():
            current = sysroot / target.relative_to("/")
        else:
            current = current.parent / target
    return current


def broken_library_symlink_targets(sysroot: Path) -> list[Path]:
    targets: set[Path] = set()
    for relative_dir in LIBRARY_DIRS:
        library_dir = sysroot / relative_dir
        if not library_dir.exists():
            continue
        for candidate in library_dir.iterdir():
            if not candidate.is_symlink() or not candidate.name.endswith(".so"):
                continue
            target = _resolve_sysroot_symlink(candidate, sysroot)
            if not target.exists():
                targets.add(target)
    return sorted(targets)


def _sysroot_path_to_host_path(sysroot: Path, path: Path) -> str:
    try:
        return "/" + str(path.relative_to(sysroot))
    except ValueError:
        return ""


def runtime_packages_for_broken_symlinks(
    sysroot: Path,
    owner: Callable[[str], str] = dpkg_owner,
) -> set[str]:
    packages: set[str] = set()
    for target in broken_library_symlink_targets(sysroot):
        host_path = _sysroot_path_to_host_path(sysroot, target)
        if not host_path:
            continue
        package_name = package_name_from_dpkg_owner(owner(host_path))
        if package_name:
            packages.add(package_name)
    return packages


def download_package(url: str, filename: str, deb_dir: Path) -> None:
    target = deb_dir / filename
    if target.exists():
        return
    subprocess.run(
        ["curl", "-L", "--fail", "--retry", "3", "--silent", "--show-error", url, "-o", str(target)],
        check=True,
    )


def download_seed_package(package: str, deb_dir: Path) -> None:
    if any(deb_dir.glob(f"{package}_*.deb")):
        return
    subprocess.run(["apt", "download", package], cwd=deb_dir, check=True)


def download_packages(packages: Iterable[str], deb_dir: Path) -> None:
    package_list = sorted(set(packages))
    if not package_list:
        return
    try:
        uris = apt_package_uris(package_list)
    except ValueError:
        uris = []
    for url, filename in uris:
        download_package(url, filename, deb_dir)
    for package in package_list:
        download_seed_package(package, deb_dir)


def extract_debs(deb_dir: Path, sysroot: Path) -> None:
    for deb in sorted(deb_dir.glob("*.deb")):
        subprocess.run(["dpkg-deb", "-x", str(deb), str(sysroot)], check=True)


def install_runtime_packages_for_broken_symlinks(sysroot: Path, deb_dir: Path, max_rounds: int = 4) -> None:
    downloaded_packages: set[str] = set()
    for _ in range(max_rounds):
        if not broken_library_symlink_targets(sysroot):
            return
        packages = runtime_packages_for_broken_symlinks(sysroot) - downloaded_packages
        if not packages:
            return
        download_packages(packages, deb_dir)
        downloaded_packages.update(packages)
        extract_debs(deb_dir, sysroot)


def bootstrap(project_root: Path) -> Path:
    build_dir = project_root / "build"
    deb_dir = build_dir / "tauri-debs"
    sysroot = build_dir / "tauri-sysroot"
    deb_dir.mkdir(parents=True, exist_ok=True)
    sysroot.mkdir(parents=True, exist_ok=True)

    download_packages(APT_PACKAGES, deb_dir)
    extract_debs(deb_dir, sysroot)
    install_runtime_packages_for_broken_symlinks(sysroot, deb_dir)
    return sysroot


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    sysroot = bootstrap(project_root)
    print(f"Tauri Linux sysroot ready: {sysroot}")


if __name__ == "__main__":
    main()
