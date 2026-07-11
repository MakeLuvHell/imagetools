# Configurable Data Directory Implementation Plan

**Goal:** Let desktop users choose a durable data root, optionally copy their existing workbench payload, and activate the selection after restart without losing the former data.

**Architecture:** Keep a small bootstrap configuration outside the movable payload. Resolve and process pending migration before the backend initializes SQLite. The backend provides status and scheduling APIs; the existing Settings dialog displays and submits the selection. The running process never switches `DATA_DIR` in place.

**Tech Stack:** Python 3.12, FastAPI, SQLite backup API, Tauri 2 Rust shell, vanilla JavaScript, jsdom, Playwright

---

### Task 1: Build The Bootstrap Configuration And Migration Core

**Files:**

- Create: `backend/storage_location.py`
- Create: `tests/test_storage_location.py`

1. Write failing tests for default resolution, pending no-copy activation, pending copy activation, SQLite database backup, recursive image/upload copy, path nesting rejection, and non-empty migration destination rejection.
2. Run `pytest tests/test_storage_location.py -q`; confirm failures are caused by the missing module.
3. Implement `StorageLocation`, `read_storage_location`, `schedule_storage_location`, and `resolve_storage_location`.
4. Use SQLite `Connection.backup()` for `workbench.sqlite3`; copy `images`, `uploads`, and `settings.json` only when present.
5. Write configuration atomically through a temporary file replacement. Keep a pending selection until copy completes, then persist the active selection.
6. Run `pytest tests/test_storage_location.py -q` and commit:

```bash
git add backend/storage_location.py tests/test_storage_location.py
git commit -m "feat(storage): resolve configurable data locations"
```

### Task 2: Connect Storage Resolution To Desktop Startup And Local APIs

**Files:**

- Modify: `backend/main.py`
- Modify: `src-tauri/src/main.rs`
- Create: `tests/test_storage_location_api.py`
- Modify: `tests/test_backend_helpers.py`
- Modify: `tests/test_desktop_entry.py`

1. Add failing API tests for `GET /api/storage-location`, scheduling a custom root, validation errors, and the restart-required response.
2. Add a startup-path test requiring the desktop sidecar to receive `IMAGE_TOOLS_CONFIG_DIR` from Tauri's `app_local_data_dir`.
3. Update `RuntimePaths` to retain default data root, active data root, config root, and bootstrap configuration path. Resolve pending storage migration before setting `DATA_DIR`, `IMAGE_DIR`, `UPLOAD_DIR`, and `SETTINGS_PATH`.
4. Add `StorageLocationRequest` validation and routes:

```text
GET  /api/storage-location
POST /api/storage-location
```

5. Have the Tauri release startup create `app_local_data_dir` and pass it as `IMAGE_TOOLS_CONFIG_DIR` to the sidecar.
6. Run focused Python and Rust checks; commit:

```bash
git add backend/main.py src-tauri/src/main.rs tests/test_storage_location_api.py tests/test_backend_helpers.py tests/test_desktop_entry.py
git commit -m "feat(storage): schedule data directory changes"
```

### Task 3: Add The Settings Surface

**Files:**

- Modify: `frontend/index.html`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `tests/frontend_ui.test.js`

1. Write failing DOM/static tests for a storage section with current path, absolute-path input, copy-existing checkbox, apply action, and restart-required status.
2. Add the storage section to the existing Provider/Settings dialog. Use concise Chinese labels and keep Provider editing unchanged.
3. Add frontend fetch helpers that load storage status when the dialog opens and POST `{ data_dir, migrate_existing }` when applying. Render API errors in the local storage section.
4. After a successful POST, show restart-required state; do not reload sessions or mutate the active UI data root.
5. Add responsive styling that keeps the storage section contained at the minimum desktop viewport.
6. Run `node --test tests/*.test.js`; commit:

```bash
git add frontend/index.html frontend/app.js frontend/styles.css tests/frontend_ui.test.js tests/frontend_ui_contract.test.js
git commit -m "feat(settings): configure local data directory"
```

### Task 4: Verify The Browser Workflow

**Files:**

- Modify: `tests/ui/helpers.js`
- Modify: `tests/ui/codex_windows.spec.js`
- Update only for intentional UI changes: `tests/ui/codex_windows.spec.js-snapshots/*.png`

1. Add mocked storage-location API routes and Playwright tests for loading the current root, scheduling copy migration, error rendering, restart confirmation, keyboard focus, and no overflow at `1280x860` and `960x640`.
2. Run the targeted Playwright tests and correct only integration behavior exposed by them.
3. Run `npm run test:ui`; regenerate and inspect visual baselines only when the approved Settings dialog layout changes.
4. Commit browser verification:

```bash
git add tests/ui tests/ui/codex_windows.spec.js-snapshots
git commit -m "test(settings): verify storage location workflow"
```

### Task 5: Record And Verify

**Files:**

- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/06-api-design.md` if created, otherwise `knowledge/08-testing-strategy.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`
- Modify: `README.md`

1. Document the Windows default path, the stable bootstrap file, migration copy semantics, restart requirement, and data-recovery behavior.
2. Run `pytest -q`, `node --test tests/*.test.js`, `npm run test:ui`, and `cargo check --manifest-path src-tauri/Cargo.toml`.
3. Run the Web entry and manually schedule a temporary custom directory without restarting; confirm the UI reports restart required and the current process still uses its original root.
4. Run `git diff --check` and inspect the worktree.
5. Commit documentation and knowledge updates:

```bash
git add README.md knowledge
git commit -m "docs(storage): record data directory behavior"
```
