import json
import tomllib
from pathlib import Path


def package_scripts() -> dict[str, str]:
    return json.loads(Path("package.json").read_text())["scripts"]


def tauri_config() -> dict:
    return json.loads(Path("src-tauri/tauri.conf.json").read_text())


def test_windows_desktop_build_script_builds_sidecar_and_windows_bundles():
    script = package_scripts()["desktop:build:windows"]

    assert "npm run backend:bundle" in script
    assert "tauri build" in script
    assert "--target x86_64-pc-windows-msvc" in script
    assert "--bundles nsis,msi" in script


def test_linux_desktop_build_script_keeps_existing_entrypoint():
    script = package_scripts()["desktop:build"]

    assert script == "npm run backend:bundle && tauri build"


def windows_release_workflow() -> str:
    return Path(".github/workflows/windows-release.yml").read_text()


def test_windows_release_workflow_is_manual_and_tag_driven():
    workflow = windows_release_workflow()

    assert "workflow_dispatch:" in workflow
    assert "release_tag:" in workflow
    assert "build_ref:" in workflow
    assert workflow.count("default: v0.2.2") == 2
    assert "ref: ${{ inputs.build_ref }}" in workflow


def test_windows_release_workflow_builds_on_windows_x64():
    workflow = windows_release_workflow()

    assert "runs-on: windows-latest" in workflow
    assert "TAURI_TARGET_TRIPLE: x86_64-pc-windows-msvc" in workflow
    assert "npm run desktop:build:windows" in workflow


def test_windows_release_workflow_uses_official_rustup_dist_on_windows():
    workflow = windows_release_workflow()

    assert "RUSTUP_DIST_SERVER" in workflow
    assert "RUSTUP_UPDATE_ROOT" in workflow
    assert "https://static.rust-lang.org" in workflow
    assert "mise exec -- pwsh" in workflow


def test_windows_release_workflow_uploads_installers_to_release():
    workflow = windows_release_workflow()

    assert "actions/upload-artifact@v4" in workflow
    assert "gh release upload" in workflow
    assert "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe" in workflow
    assert "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi" in workflow
    assert "*.exe" in workflow
    assert "*.msi" in workflow
    assert "--clobber" in workflow


def test_windows_release_workflow_creates_a_missing_release_before_upload():
    workflow = windows_release_workflow()

    assert "gh release view" in workflow
    assert "gh release create" in workflow
    assert "--verify-tag" in workflow
    assert 'docs/releases/$($env:RELEASE_TAG).md' in workflow
    assert "--generate-notes" in workflow


def test_release_docs_include_windows_workflow_command():
    docs = Path("docs/releases/github-release.md").read_text()

    assert "Windows x64" in docs
    assert "windows-release.yml" in docs
    assert "gh workflow run windows-release.yml -f release_tag=v0.2.2 -f build_ref=v0.2.2" in docs


def test_readme_mentions_windows_release_assets_are_built_by_github_actions():
    readme = Path("README.md").read_text()

    assert "Windows x64" in readme
    assert "GitHub Actions" in readme


def test_windows_installers_use_generated_icon_and_simplified_chinese():
    windows = tauri_config()["bundle"]["windows"]

    assert windows["nsis"]["installerIcon"] == "icons/icon.ico"
    assert windows["nsis"]["uninstallerIcon"] == "icons/icon.ico"
    assert windows["nsis"]["languages"] == ["SimpChinese"]
    assert windows["nsis"]["displayLanguageSelector"] is False
    assert windows["wix"]["language"] == "zh-CN"


def test_user_svg_is_the_source_for_committed_tauri_icons():
    assert Path("frontend/assets/icon.svg").is_file()
    for icon in ("icon.ico", "icon.png", "32x32.png", "128x128.png", "128x128@2x.png"):
        assert Path("src-tauri/icons", icon).is_file()


def test_release_versions_are_consistently_0_2_2():
    package = json.loads(Path("package.json").read_text())
    cargo = tomllib.loads(Path("src-tauri/Cargo.toml").read_text())

    assert package["version"] == "0.2.2"
    assert tauri_config()["version"] == "0.2.2"
    assert cargo["package"]["version"] == "0.2.2"
