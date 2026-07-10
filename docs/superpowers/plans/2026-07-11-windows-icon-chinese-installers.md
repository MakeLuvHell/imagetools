# Windows Icon And Chinese Installers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Image Tools 0.2.1 with the user-provided SVG artwork and Simplified Chinese NSIS and MSI installers.

**Architecture:** Keep `frontend/assets/icon.svg` as the source artwork and commit the deterministic Tauri-generated icon set under `src-tauri/icons/`. Express installer localization in Tauri's native Windows bundle configuration, while packaging tests enforce the exact NSIS and WiX locale identifiers and release metadata.

**Tech Stack:** Tauri 2.11, NSIS, WiX/MSI, Node.js, pytest, Cargo

---

### Task 1: Lock The Windows Packaging Contract

**Files:**
- Modify: `tests/test_windows_release_workflow.py`
- Test: `tests/test_windows_release_workflow.py`

- [ ] **Step 1: Write failing tests for installer languages and icons**

Add a helper that parses `src-tauri/tauri.conf.json`, then assert the Windows bundler contract:

```python
def tauri_config() -> dict:
    return json.loads(Path("src-tauri/tauri.conf.json").read_text())


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
```

- [ ] **Step 2: Run the focused tests and verify the locale test fails**

Run: `pytest tests/test_windows_release_workflow.py -q`

Expected: the installer configuration test fails because `bundle.windows` is absent.

- [ ] **Step 3: Commit the red packaging tests**

```bash
git add tests/test_windows_release_workflow.py
git commit -m "test(release): require Chinese Windows installers"
```

### Task 2: Generate And Configure Windows Icons

**Files:**
- Add: `frontend/assets/icon.svg`
- Generate: `src-tauri/icons/32x32.png`
- Generate: `src-tauri/icons/128x128.png`
- Generate: `src-tauri/icons/128x128@2x.png`
- Generate: `src-tauri/icons/icon.ico`
- Generate: `src-tauri/icons/icon.png`
- Generate: other standard Tauri platform icon assets under `src-tauri/icons/`
- Modify: `src-tauri/tauri.conf.json`
- Generate: `frontend/assets/app-icon.png`
- Test: `tests/test_windows_release_workflow.py`

- [ ] **Step 1: Generate the standard icon set from the source SVG**

Run: `npx tauri icon frontend/assets/icon.svg`

Expected: Tauri reports generated PNG and ICO assets under `src-tauri/icons/` and exits 0.

- [ ] **Step 2: Configure native Windows installer localization and icon paths**

Add this object below `bundle.externalBin` in `src-tauri/tauri.conf.json`:

```json
"windows": {
  "nsis": {
    "installerIcon": "icons/icon.ico",
    "uninstallerIcon": "icons/icon.ico",
    "languages": ["SimpChinese"],
    "displayLanguageSelector": false
  },
  "wix": {
    "language": "zh-CN"
  }
}
```

- [ ] **Step 3: Synchronize the frontend brand icon**

Run: `npm run frontend:vendor`

Expected: `frontend/assets/app-icon.png` becomes byte-identical to `src-tauri/icons/icon.png`.

- [ ] **Step 4: Run focused tests and schema validation**

Run: `pytest tests/test_windows_release_workflow.py -q`

Expected: all tests pass.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: the Tauri build script loads the project configuration without a schema/configuration error and Cargo exits 0.

- [ ] **Step 5: Commit icon and installer configuration**

```bash
git add frontend/assets/icon.svg frontend/assets/app-icon.png src-tauri/icons src-tauri/tauri.conf.json
git commit -m "feat(release): add Chinese Windows installer branding"
```

### Task 3: Prepare Version 0.2.1 Release Metadata

**Files:**
- Modify: `tests/test_windows_release_workflow.py`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `.github/workflows/windows-release.yml`
- Modify: `docs/releases/github-release.md`
- Create: `docs/releases/v0.2.1.md`
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/09-decisions.md`

- [ ] **Step 1: Change release assertions to require version 0.2.1 defaults**

Update the workflow test to assert:

```python
assert workflow.count("default: v0.2.1") == 2
```

Update the documentation assertion to require:

```python
assert "gh workflow run windows-release.yml -f release_tag=v0.2.1 -f build_ref=v0.2.1" in docs
```

Add a test that package, Tauri, and Cargo versions all equal `0.2.1`.

- [ ] **Step 2: Run the focused tests and verify version assertions fail**

Run: `pytest tests/test_windows_release_workflow.py -q`

Expected: failures report the existing `0.2.0` versions and old workflow defaults.

- [ ] **Step 3: Update all version sources**

Run: `npm version 0.2.1 --no-git-tag-version`

Then update `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` to `0.2.1`, and run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Cargo updates the root package entry in `src-tauri/Cargo.lock` and completes successfully.

- [ ] **Step 4: Update workflow defaults and release documentation**

Set both `release_tag` and `build_ref` defaults in `.github/workflows/windows-release.yml` to `v0.2.1`. Update `docs/releases/github-release.md` with the matching manual command. Add `docs/releases/v0.2.1.md` describing the new icon, Simplified Chinese NSIS/MSI experience, and unchanged Windows x64 scope.

- [ ] **Step 5: Record the resolved packaging decision**

Mark the release-preparation item complete in `knowledge/04-task-list.md` and add a dated entry to `knowledge/09-decisions.md` stating that the SVG is the canonical artwork, generated icons are committed, and NSIS/WiX use their native Simplified Chinese locale identifiers.

- [ ] **Step 6: Run focused tests**

Run: `pytest tests/test_windows_release_workflow.py -q`

Expected: all tests pass.

- [ ] **Step 7: Commit release preparation**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json .github/workflows/windows-release.yml docs/releases tests/test_windows_release_workflow.py knowledge/04-task-list.md knowledge/09-decisions.md
git commit -m "chore(release): prepare v0.2.1"
```

### Task 4: Verify The Release Preparation

**Files:**
- Verify only; no intended production changes

- [ ] **Step 1: Verify generated asset synchronization**

Run: `npm run frontend:vendor && cmp src-tauri/icons/icon.png frontend/assets/app-icon.png`

Expected: both commands exit 0.

- [ ] **Step 2: Run Python tests**

Run: `pytest -q`

Expected: all tests pass.

- [ ] **Step 3: Run Node tests**

Run: `node --test tests/*.test.js`

Expected: all tests pass.

- [ ] **Step 4: Run Tauri/Cargo validation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit 0 for `imagetools v0.2.1`.

- [ ] **Step 5: Inspect repository state**

Run: `git status --short && git log -5 --oneline`

Expected: no generated drift or uncommitted files; separate design, test, feature, and release-preparation commits remain in history.

- [ ] **Step 6: Leave the release tag uncreated until verification passes**

After all checks pass, create and push `v0.2.1` only as an explicit release action. Do not move or overwrite `v0.2.0`.
