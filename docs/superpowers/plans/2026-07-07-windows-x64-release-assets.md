# Windows x64 Release Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable GitHub Actions path that builds Windows x64 Image Tools installers and uploads them to the existing GitHub Release.

**Architecture:** Keep Linux builds local through the existing `mise run desktop-build` flow. Add a Windows-specific package script and a `windows-latest` workflow because Tauri Windows MSI installers must be built on Windows, while NSIS cross-builds from Linux are a last-resort path. The workflow separates `build_ref` from `release_tag`: it builds from `main` for the current `v0.1.0` backfill, then uploads `.exe`/`.msi` assets to the existing release tag.

**Tech Stack:** GitHub Actions, Windows hosted runner, mise, Python 3.12, Node 24, Rust 1.96, PyInstaller, Tauri v2, GitHub Release API/CLI.

---

## References

- Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
- Tauri GitHub pipeline docs: https://v2.tauri.app/distribute/pipelines/github/
- GitHub Releases docs: https://docs.github.com/repositories/releasing-projects-on-github/managing-releases-in-a-repository

## File Structure

- Modify `package.json`: add a Windows x64 desktop build script that builds the PyInstaller sidecar and Tauri Windows installers.
- Create `tests/test_windows_release_workflow.py`: lightweight assertions for package scripts and workflow release behavior.
- Create `.github/workflows/windows-release.yml`: manually triggered workflow to build Windows x64 installers and upload them to a release tag.
- Modify `docs/releases/github-release.md`: document how to trigger the Windows x64 workflow and how to verify assets.
- Modify `README.md`: add a short note that Windows x64 assets are produced by GitHub Actions, not the local Linux/WSL build.

---

### Task 1: Windows Build Script

**Files:**
- Modify: `package.json`
- Modify: `tests/test_windows_release_workflow.py`

- [ ] **Step 1: Write failing tests for package scripts**

Create `tests/test_windows_release_workflow.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py
```

Expected: failure with `KeyError: 'desktop:build:windows'`.

- [ ] **Step 3: Add the Windows build script**

Update `package.json` scripts to include `desktop:build:windows`:

```json
{
  "scripts": {
    "backend:bundle": "python scripts/bundle_backend.py",
    "desktop:dev": "npm run backend:bundle && tauri dev",
    "desktop:build": "npm run backend:bundle && tauri build",
    "desktop:build:windows": "npm run backend:bundle && tauri build --target x86_64-pc-windows-msvc --bundles nsis,msi"
  }
}
```

Keep the existing `desktop:build` script unchanged so Linux local builds continue to use `src-tauri/tauri.conf.json` targets `["deb", "rpm"]`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py
```

Expected: all tests in `tests/test_windows_release_workflow.py` pass.

- [ ] **Step 5: Run related test suite**

Run:

```bash
mise run test
```

Expected: Python and Node tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json tests/test_windows_release_workflow.py
git commit -m "feat(build): 添加 Windows x64 桌面构建脚本"
```

Expected: commit succeeds with only package script and tests.

---

### Task 2: Windows Release Workflow

**Files:**
- Create: `.github/workflows/windows-release.yml`
- Modify: `tests/test_windows_release_workflow.py`

- [ ] **Step 1: Add failing workflow tests**

Append to `tests/test_windows_release_workflow.py`:

```python
def windows_release_workflow() -> str:
    return Path(".github/workflows/windows-release.yml").read_text()


def test_windows_release_workflow_is_manual_and_tag_driven():
    workflow = windows_release_workflow()

    assert "workflow_dispatch:" in workflow
    assert "release_tag:" in workflow
    assert "build_ref:" in workflow
    assert "default: v0.1.0" in workflow
    assert "default: main" in workflow
    assert "ref: ${{ inputs.build_ref }}" in workflow


def test_windows_release_workflow_builds_on_windows_x64():
    workflow = windows_release_workflow()

    assert "runs-on: windows-latest" in workflow
    assert "TAURI_TARGET_TRIPLE: x86_64-pc-windows-msvc" in workflow
    assert "mise exec -- npm run desktop:build:windows" in workflow


def test_windows_release_workflow_uploads_installers_to_release():
    workflow = windows_release_workflow()

    assert "actions/upload-artifact@v4" in workflow
    assert "gh release upload" in workflow
    assert "*.exe" in workflow
    assert "*.msi" in workflow
    assert "--clobber" in workflow
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py
```

Expected: failure with `FileNotFoundError` for `.github/workflows/windows-release.yml`.

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/windows-release.yml`:

```yaml
name: Windows x64 Release

on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: Release tag to upload Windows x64 assets to
        required: true
        default: v0.1.0
      build_ref:
        description: Git ref to build from
        required: true
        default: main

permissions:
  contents: write

jobs:
  build-windows-x64:
    name: Build Windows x64 installers
    runs-on: windows-latest

    steps:
      - name: Checkout build ref
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.build_ref }}

      - name: Install mise tools
        uses: jdx/mise-action@v2
        with:
          install: true
          cache: true

      - name: Install project dependencies
        shell: pwsh
        run: mise run install

      - name: Build Windows x64 installers
        shell: pwsh
        env:
          TAURI_TARGET_TRIPLE: x86_64-pc-windows-msvc
        run: mise exec -- npm run desktop:build:windows

      - name: List installer outputs
        shell: pwsh
        run: |
          Get-ChildItem src-tauri\target\release\bundle -Recurse -File |
            Select-Object FullName, Length |
            Format-Table -AutoSize

      - name: Upload installers as workflow artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-x64-installers
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.msi
          if-no-files-found: error

      - name: Upload installers to GitHub Release
        shell: pwsh
        env:
          GH_TOKEN: ${{ github.token }}
          RELEASE_TAG: ${{ inputs.release_tag }}
        run: |
          $assets = @(
            Get-ChildItem "src-tauri\target\release\bundle\nsis" -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue
            Get-ChildItem "src-tauri\target\release\bundle\msi" -Filter "*.msi" -Recurse -ErrorAction SilentlyContinue
          )

          if ($assets.Count -eq 0) {
            throw "No Windows installer assets were produced."
          }

          foreach ($asset in $assets) {
            gh release upload $env:RELEASE_TAG $asset.FullName --repo $env:GITHUB_REPOSITORY --clobber
          }
```

- [ ] **Step 4: Run workflow tests**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py
```

Expected: all workflow tests pass.

- [ ] **Step 5: Run full local tests**

Run:

```bash
mise run test
```

Expected: all Python and Node tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add .github/workflows/windows-release.yml tests/test_windows_release_workflow.py
git commit -m "ci(release): 添加 Windows x64 Release 工作流"
```

Expected: commit succeeds with workflow and tests.

---

### Task 3: Release Documentation Updates

**Files:**
- Modify: `docs/releases/github-release.md`
- Modify: `README.md`

- [ ] **Step 1: Add documentation test coverage**

Append to `tests/test_windows_release_workflow.py`:

```python
def test_release_docs_include_windows_workflow_command():
    docs = Path("docs/releases/github-release.md").read_text()

    assert "Windows x64" in docs
    assert "windows-release.yml" in docs
    assert "gh workflow run windows-release.yml -f release_tag=v0.1.0 -f build_ref=main" in docs


def test_readme_mentions_windows_release_assets_are_built_by_github_actions():
    readme = Path("README.md").read_text()

    assert "Windows x64" in readme
    assert "GitHub Actions" in readme
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py::test_release_docs_include_windows_workflow_command tests/test_windows_release_workflow.py::test_readme_mentions_windows_release_assets_are_built_by_github_actions
```

Expected: failures because the docs do not yet mention the Windows workflow.

- [ ] **Step 3: Update release documentation**

In `docs/releases/github-release.md`, after the Linux asset section, add:

````markdown
## Windows x64 安装包

Windows x64 安装包不在 Linux/WSL 本机构建。Tauri 官方 Windows installer 文档说明，Windows `.msi` 需要在 Windows 机器上构建；因此项目使用 GitHub Actions 的 `windows-latest` runner 生成 Windows x64 安装包。

触发现有 release 的 Windows x64 构建：

```bash
gh workflow run windows-release.yml -f release_tag=v0.1.0 -f build_ref=main
```

如果本机没有 `gh`，在 GitHub 网页打开：

```text
https://github.com/MakeLuvHell/imagetools/actions/workflows/windows-release.yml
```

点击 `Run workflow`，`release_tag` 填 `v0.1.0`，`build_ref` 填 `main`。

构建成功后，workflow 会把 Windows 安装包上传到：

```text
https://github.com/MakeLuvHell/imagetools/releases/tag/v0.1.0
```

预期 Windows asset 类型：

- NSIS `.exe`
- MSI `.msi`

当前没有配置代码签名证书，Windows 安装时可能显示未知发布者或 SmartScreen 提示。

注意：本次是给已经存在的 `v0.1.0` release 补 Windows x64 资产。`v0.1.0` tag 保持不变，Windows 安装包从 `main` 构建；`main` 与 `v0.1.0` 的应用版本同为 `0.1.0`，新增差异只用于 CI、脚本和文档。
````

- [ ] **Step 4: Update README desktop build section**

In `README.md`, after the local Linux bundle output paragraph, add:

```markdown
Windows x64 安装包由 GitHub Actions 的 Windows runner 构建并上传到 GitHub Release；本地 Linux/WSL 构建只生成 Linux deb/rpm。发布流程见 [`docs/releases/github-release.md`](docs/releases/github-release.md)。
```

- [ ] **Step 5: Run documentation tests**

Run:

```bash
mise exec -- pytest -q tests/test_windows_release_workflow.py
```

Expected: all Windows release workflow tests pass.

- [ ] **Step 6: Run full tests**

Run:

```bash
mise run test
```

Expected: all Python and Node tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add README.md docs/releases/github-release.md tests/test_windows_release_workflow.py
git commit -m "docs(release): 补充 Windows x64 发布流程"
```

Expected: commit succeeds with docs and tests.

---

### Task 4: Push And Trigger Windows Build

**Files:**
- No source file edits.

- [ ] **Step 1: Verify branch state**

Run:

```bash
git status --short --branch
git branch --show-current
git log --oneline --decorate -5
```

Expected: clean working tree on `main`, with the three new commits visible.

- [ ] **Step 2: Push main**

Run:

```bash
GIT_TERMINAL_PROMPT=0 git push origin main
```

Expected: `main` is updated on GitHub.

- [ ] **Step 3: Trigger workflow with GitHub CLI when available**

Run:

```bash
gh workflow run windows-release.yml -f release_tag=v0.1.0 -f build_ref=main --repo MakeLuvHell/imagetools
```

Expected: GitHub queues the workflow run.

If `gh` is not installed, open this URL and click `Run workflow`:

```text
https://github.com/MakeLuvHell/imagetools/actions/workflows/windows-release.yml
```

Set `release_tag` to:

```text
v0.1.0
```

Set `build_ref` to:

```text
main
```

- [ ] **Step 4: Wait for workflow completion**

If using `gh`, run:

```bash
gh run list --workflow windows-release.yml --repo MakeLuvHell/imagetools --limit 5
```

Expected: the newest run reaches `completed` with conclusion `success`.

If using the GitHub web UI, open the run page and wait until it shows success.

- [ ] **Step 5: Verify Windows assets on release**

Run:

```bash
python - <<'PY'
import json
import urllib.request

url = "https://api.github.com/repos/MakeLuvHell/imagetools/releases/tags/v0.1.0"
with urllib.request.urlopen(url, timeout=60) as response:
    release = json.load(response)

names = sorted(asset["name"] for asset in release.get("assets", []))
for name in names:
    print(name)

assert any(name.endswith(".exe") for name in names), names
assert any(name.endswith(".msi") for name in names), names
PY
```

Expected: output includes the existing Linux assets plus at least one `.exe` and one `.msi` Windows installer.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `main`.
