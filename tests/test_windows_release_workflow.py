import json
import tomllib
from pathlib import Path


def package_scripts() -> dict[str, str]:
    return json.loads(Path("package.json").read_text())["scripts"]


def tauri_config() -> dict:
    return json.loads(Path("src-tauri/tauri.conf.json").read_text())


def test_windows_desktop_build_script_builds_msi_directly():
    script = package_scripts()["desktop:build:windows"]

    assert script == "tauri build --target x86_64-pc-windows-msvc --bundles msi"


def test_linux_desktop_build_script_invokes_tauri_directly():
    script = package_scripts()["desktop:build"]

    assert script == "tauri build"


def windows_release_workflow() -> str:
    return Path(".github/workflows/windows-release.yml").read_text()


def portable_packager() -> str:
    return Path("scripts/package_windows_portable.ps1").read_text()


def single_process_verifier() -> str:
    return Path("scripts/verify_windows_single_process.ps1").read_text()


def upgrade_rollback_verifier() -> str:
    return Path("scripts/verify_windows_upgrade_rollback.ps1").read_text()


def upgrade_fixture_script() -> str:
    return Path("scripts/prepare_windows_upgrade_fixture.py").read_text()


def test_windows_release_workflow_is_manual_and_tag_driven():
    workflow = windows_release_workflow()

    assert "workflow_dispatch:" in workflow
    assert "release_tag:" in workflow
    assert "build_ref:" in workflow
    assert workflow.count("default: v0.3.0") == 2
    assert "ref: ${{ inputs.build_ref }}" in workflow


def test_windows_release_workflow_defaults_to_a_non_publishing_validation_run():
    workflow = windows_release_workflow()

    assert "publish_release:" in workflow
    assert "type: boolean" in workflow
    assert "default: false" in workflow
    assert workflow.count("if: ${{ inputs.publish_release }}") == 2
    assert workflow.index("if: ${{ inputs.publish_release }}") > workflow.index(
        "actions/upload-artifact@v4"
    )


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


def test_windows_release_workflow_packages_and_uploads_two_stable_assets():
    workflow = windows_release_workflow()

    assert "actions/upload-artifact@v4" in workflow
    assert "gh release upload" in workflow
    assert "release-assets/Image-Tools-$($env:RELEASE_TAG)-Windows-x64.msi" in workflow
    assert (
        "release-assets/Image-Tools-$($env:RELEASE_TAG)-Windows-x64-Portable.zip"
        in workflow
    )
    assert "release-assets/*" not in workflow
    assert "bundle/nsis" not in workflow.lower()
    assert "nsis" not in workflow.lower()
    assert "--clobber" in workflow


def test_windows_release_workflow_selects_one_msi_and_builds_portable_from_main_exe():
    workflow = windows_release_workflow()

    assert 'Get-ChildItem $msiDirectory -Filter "*.msi" -File' in workflow
    assert "$msiFiles.Count -ne 1" in workflow
    assert 'release\\Image Tools.exe' in workflow
    assert "scripts/package_windows_portable.ps1" in workflow
    assert "scripts/verify_windows_single_process.ps1" in workflow
    assert workflow.index("scripts/verify_windows_single_process.ps1") < workflow.index(
        "actions/upload-artifact@v4"
    )


def test_windows_release_workflow_runs_upgrade_and_rollback_before_artifact_upload():
    workflow = windows_release_workflow()

    assert "GH_TOKEN: ${{ github.token }}" in workflow
    assert "gh release download v0.2.3" in workflow
    assert "Image.Tools_0.2.3_x64_zh-CN.msi" in workflow
    assert "$oldMsiFiles.Count -ne 1" in workflow
    assert "scripts/verify_windows_upgrade_rollback.ps1" in workflow
    assert "-OldMsi $oldMsi" in workflow
    assert "-NewMsi $newMsi" in workflow
    assert workflow.index("gh release download v0.2.3") < workflow.index(
        "scripts/verify_windows_upgrade_rollback.ps1"
    )
    assert workflow.index("scripts/verify_windows_upgrade_rollback.ps1") < workflow.index(
        "actions/upload-artifact@v4"
    )
    assert "upgrade-assets/" not in workflow.split("path: |", 1)[1]


def test_portable_packager_enforces_a_single_branded_executable_entry():
    script = portable_packager()

    assert "Set-StrictMode -Version Latest" in script
    assert "$ErrorActionPreference = \"Stop\"" in script
    assert '[Parameter(Mandatory = $true)]' in script
    assert "Test-Path -LiteralPath $Executable -PathType Leaf" in script
    assert 'Name -cne "Image Tools.exe"' in script
    assert 'Copy-Item -LiteralPath $resolvedExecutable -Destination $stagedExecutable' in script
    assert "Compress-Archive" in script
    assert "[System.IO.Compression.ZipFile]::OpenRead" in script
    assert '$expectedEntries = @("Image Tools.exe")' in script
    assert "$entryNames.Count -ne $expectedEntries.Count" in script
    assert "$entryNames[0] -cne $expectedEntries[0]" in script
    assert "[System.IO.File]::Move($temporaryZip, $resolvedOutput, $true)" in script
    assert "finally" in script
    assert "Remove-Item -LiteralPath $temporaryRoot -Recurse -Force" in script


def test_windows_single_process_verifier_covers_payload_install_runtime_and_cleanup():
    script = single_process_verifier()

    assert "Set-StrictMode -Version Latest" in script
    assert "$ErrorActionPreference = \"Stop\"" in script
    assert '[Parameter(Mandatory = $true)]' in script
    assert "[System.IO.Compression.ZipFile]::OpenRead" in script
    assert 'Image Tools.exe' in script
    assert "msiexec.exe" in script
    assert '"/a"' in script
    assert '"/i"' in script
    assert '"/x"' in script
    assert "Get-UninstallEntries" in script
    assert '$displayNameProperty.Value -cne "Image Tools"' in script
    assert "InstallLocation" in script
    assert "DisplayIcon" in script
    assert "IMAGE_TOOLS_DATA_DIR" in script
    assert "IMAGE_TOOLS_CONFIG_DIR" in script
    assert "MainWindowHandle" in script
    assert "Get-NetTCPConnection" in script
    assert "netstat" in script
    assert "CloseMainWindow" in script
    assert "10" in script
    assert "imagetools-backend" in script
    assert "finally" in script
    assert "Stop-Process -Id" in script


def test_windows_single_process_verifier_removes_only_test_created_default_app_data():
    script = single_process_verifier()

    assert '$defaultDataDirectory = Join-Path $env:APPDATA "com.imagetools.desktop"' in script
    assert '$defaultConfigDirectory = Join-Path $env:LOCALAPPDATA "com.imagetools.desktop"' in script
    assert "$defaultDataExisted = Test-Path -LiteralPath $defaultDataDirectory" in script
    assert "$defaultConfigExisted = Test-Path -LiteralPath $defaultConfigDirectory" in script
    assert "-not $defaultDataExisted -and (Test-Path -LiteralPath $defaultDataDirectory)" in script
    assert "-not $defaultConfigExisted -and (Test-Path -LiteralPath $defaultConfigDirectory)" in script
    assert "Remove-Item -LiteralPath $defaultDataDirectory -Recurse -Force" in script
    assert "Remove-Item -LiteralPath $defaultConfigDirectory -Recurse -Force" in script


def test_upgrade_fixture_is_schema_v2_linked_and_secret_free():
    script = upgrade_fixture_script()

    assert "argparse" in script
    assert 'for name in ("create", "verify")' in script
    assert "commands.add_parser(name" in script
    assert "PRAGMA foreign_keys = ON" in script
    assert "schema_migrations" in script
    assert "providers" in script
    assert "projects" in script
    assert "sessions" in script
    assert "generation_runs" in script
    assert "images/result.png" in script
    assert "PNG_SIGNATURE" in script
    assert '"redacted"' in script
    assert "SENSITIVE_PATTERNS" in script


def test_upgrade_rollback_verifier_is_isolated_versioned_and_self_cleaning():
    script = upgrade_rollback_verifier()

    assert script.count('[Parameter(Mandatory = $true)]') >= 2
    assert "$OldMsi" in script
    assert "$NewMsi" in script
    assert "Set-StrictMode -Version Latest" in script
    assert '$ErrorActionPreference = "Stop"' in script
    assert "Get-UninstallEntries" in script
    assert "InstallLocation" in script
    assert "DisplayIcon" in script
    assert "DisplayVersion" in script
    assert '"0.2.3"' in script
    assert '"0.3.0"' in script
    assert '"imagetools.exe"' in script
    assert "IMAGE_TOOLS_DATA_DIR" in script
    assert "IMAGE_TOOLS_CONFIG_DIR" in script
    assert "prepare_windows_upgrade_fixture.py" in script
    assert '"create"' in script
    assert '"verify"' in script
    assert "Copy-Item" in script
    assert "MainWindowHandle" in script
    assert "CloseMainWindow" in script
    assert "TimeoutSeconds 10" in script
    assert "imagetools-backend" in script
    assert "finally" in script
    assert "Stop-TestProcess" in script
    assert "1605" in script


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
    assert "gh workflow run windows-release.yml -f release_tag=v0.3.0 -f build_ref=v0.3.0" in docs


def test_readme_mentions_windows_release_assets_are_built_by_github_actions():
    readme = Path("README.md").read_text()

    assert "Windows x64" in readme
    assert "GitHub Actions" in readme


def test_windows_installers_use_generated_icon_and_simplified_chinese():
    windows = tauri_config()["bundle"]["windows"]

    assert "nsis" not in windows
    assert windows["wix"]["language"] == "zh-CN"


def test_user_svg_is_the_source_for_committed_tauri_icons():
    assert Path("frontend/assets/icon.svg").is_file()
    for icon in ("icon.ico", "icon.png", "32x32.png", "128x128.png", "128x128@2x.png"):
        assert Path("src-tauri/icons", icon).is_file()


def test_release_versions_are_consistently_0_3_0():
    package = json.loads(Path("package.json").read_text())
    cargo = tomllib.loads(Path("src-tauri/Cargo.toml").read_text())

    assert package["version"] == "0.3.0"
    assert tauri_config()["version"] == "0.3.0"
    assert cargo["package"]["version"] == "0.3.0"
