from __future__ import annotations

from pathlib import Path

from scripts.bootstrap_tauri_linux_sysroot import download_packages, extract_debs


APT_PACKAGES = ["libnspr4", "libnss3"]


def bootstrap(project_root: Path) -> Path:
    build_dir = project_root / "build"
    deb_dir = build_dir / "playwright-debs"
    sysroot = build_dir / "playwright-sysroot"
    deb_dir.mkdir(parents=True, exist_ok=True)
    sysroot.mkdir(parents=True, exist_ok=True)
    download_packages(APT_PACKAGES, deb_dir)
    extract_debs(deb_dir, sysroot)
    return sysroot


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    print(f"Playwright Linux sysroot ready: {bootstrap(root)}")
