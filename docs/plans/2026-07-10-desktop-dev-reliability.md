# Desktop Development Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the one-command desktop development workflow fail safely when its source backend cannot be trusted.

**Architecture:** A development launcher owns the fixed backend port and publishes a launch token. Uvicorn exposes that token through the health endpoint, and debug Rust rejects mismatches. The package script rejects the unsupported release development profile. Linux sysroot setup revalidates its recovered state before use.

**Tech Stack:** Python 3.12, FastAPI/Uvicorn, Tauri 2/Rust, pytest, npm.

---

### Task 1: Require A Launcher-Owned Development Backend

**Files:**
- Create: `scripts/run_desktop_dev_backend.py`
- Modify: `backend/main.py`
- Modify: `src-tauri/tauri.dev.conf.json`
- Modify: `src-tauri/src/main.rs`
- Modify: `tests/test_tauri_config.py`

1. Write failing tests for the launcher command, health-token response, and Rust token validation.
2. Run the focused tests and confirm the token contract is missing.
3. Add a launcher that exclusively binds port 7860, generates a token, starts Uvicorn using the inherited socket, and exposes the token through the backend health response.
4. Make debug Rust require the token before it opens a window.
5. Run focused Python tests and Rust checks.

### Task 2: Reject Unsupported Release Development Mode

**Files:**
- Modify: `package.json`
- Modify: `tests/test_tauri_config.py`
- Modify: `README.md`

1. Write a failing test requiring `desktop:dev` to reject release arguments.
2. Implement a small package-script guard and document the supported command.
3. Run the focused test.

### Task 3: Revalidate Repaired Linux Sysroots

**Files:**
- Modify: `scripts/run_tauri_linux_env.py`
- Modify: `tests/test_tauri_linux_sysroot.py`

1. Write a failing test where bootstrap returns but the sysroot remains incomplete.
2. Run the focused test and confirm it currently accepts the bad state.
3. Recheck dependencies after bootstrap and raise an error listing unresolved symlink targets.
4. Run focused sysroot tests.

### Task 4: Verify The Full Workflow

**Files:**
- Modify: `README.md`

1. Run `mise run test`, `mise run desktop-check`, release `cargo check`, and `git diff --check`.
2. Start the launcher, modify a backend source file, and verify Uvicorn reloads while `/api/health` remains available.
