# 会话分类 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable pinned sessions and local projects, then render and manage them in the workbench sidebar.

**Architecture:** SQLite schema v2 adds projects and session classification fields through an idempotent migration. FastAPI exposes project CRUD and focused session actions. Frontend state normalizes the new fields, while DOM rendering groups sidebar rows and app orchestration owns API mutations and menus.

**Tech Stack:** Python 3.12, FastAPI, SQLite, vanilla JavaScript, jsdom, Playwright.

---

### Task 1: Persist projects and classifications

**Files:**
- Modify: `tests/test_workbench_db.py`
- Modify: `backend/workbench_db.py`

- [x] Write migration, project CRUD, assignment, pinning, and delete-unassign tests; run `pytest -q tests/test_workbench_db.py` and observe missing APIs.
- [x] Implement schema v2 migration, `Project`, session fields, and store methods; rerun `pytest -q tests/test_workbench_db.py`.

### Task 2: Expose classification APIs

**Files:**
- Modify: `tests/test_session_api.py`
- Modify: `backend/main.py`

- [x] Write API tests for project CRUD, assignment, and pin actions; run `pytest -q tests/test_session_api.py` and observe missing routes or fields.
- [x] Implement public serializers, payload validation, routes, and Chinese errors; rerun `pytest -q tests/test_session_api.py`.

### Task 3: Group sidebar rendering and management

**Files:**
- Modify: `tests/frontend_workbench.test.js`
- Modify: `tests/frontend_ui.test.js`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `tests/ui/helpers.js`
- Modify: `tests/ui/codex_windows.spec.js`
- Modify: `frontend/index.html`
- Modify: `frontend/workbench.js`
- Modify: `frontend/ui.js`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`

- [x] Write state/renderer/browser tests for grouped content and actions; run the focused Node and Playwright tests to observe the missing UI behavior.
- [x] Implement sidebar sections, project dialog/menu, session assignment and pin actions, responsive styling, and mocked routes; rerun the focused tests.

### Task 4: Preserve project knowledge and verify

**Files:**
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/09-decisions.md`

- [x] Record the task and migration decision, then run `pytest -q`, `node --test tests/*.test.js`, `npm run test:ui`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `git diff --check`.
