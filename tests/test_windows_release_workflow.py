import json
from pathlib import Path


def package_scripts() -> dict[str, str]:
    return json.loads(Path("package.json").read_text())["scripts"]


def test_windows_desktop_build_script_builds_sidecar_and_windows_bundles():
    script = package_scripts()["desktop:build:windows"]

    assert "npm run backend:bundle" in script
    assert "tauri build" in script
    assert "--target x86_64-pc-windows-msvc" in script
    assert "--bundles nsis,msi" in script


def test_linux_desktop_build_script_keeps_existing_entrypoint():
    script = package_scripts()["desktop:build"]

    assert script == "npm run backend:bundle && tauri build"
