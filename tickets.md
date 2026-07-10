# Codex Desktop Windows UI Tickets

Source: `docs/spec/2026-07-10-codex-windows-ui.md` and `docs/superpowers/plans/2026-07-10-codex-windows-ui.md`

## T001: Model New-Task Drafts And Optimistic Runs

**Status:** In Progress

**What to build:** Add pure workbench state for an unpersisted new-task draft, automatic session titles, serializable per-session drafts, compact parameter summaries, and optimistic generation rows isolated by session and submission ID.

**Blocked by:** None.

**Acceptance criteria:**

- Startup selects the new-task view without creating a SQLite session.
- Draft keys distinguish the new task from persisted sessions and malformed stored drafts fall back safely.
- Session titles normalize the first prompt line and are capped at 36 Unicode characters.
- Concurrent pending submissions can be inserted, failed, and removed independently.
- `node --test tests/frontend_workbench.test.js` passes.

## T002: Bundle Icons And Build The Windows Shell

**Status:** Pending

**What to build:** Bundle pinned Lucide and app-brand assets locally, then replace the form-heavy page with the native-titlebar Windows shell, restrained sidebar, unframed task canvas, Composer root, theme tokens, and stable responsive geometry.

**Blocked by:** None.

**Acceptance criteria:**

- No icon CDN or simulated HTML titlebar is present.
- Sidebar, timeline, Composer, menu, and dialog roots exist without a permanent parameter grid.
- Light and dark system themes share the same layout and typography metrics.
- Static contract tests, vendor sync, Node tests, and `git diff --check` pass.

## T003: Render Sidebar, New Tasks, And Session Dialogs

**Status:** Pending

**What to build:** Add DOM renderers and application orchestration for session selection, filtered recent sessions, draft-first new tasks, and in-app rename/delete dialogs with accessible focus behavior.

**Blocked by:** T001, T002.

**Acceptance criteria:**

- New Task returns to an unpersisted draft without creating an empty session.
- Sidebar selection and filtering remain consistent after refreshes and deletes.
- Rename and delete use application dialogs, not browser prompt/confirm.
- Renderer, contract, and existing frontend tests pass.

## T004: Add Provider Management In An App Dialog

**Status:** Pending

**What to build:** Implement complete Provider CRUD in an in-app dialog, including selection/default state, complete PATCH payloads, API-key preservation, validation, and accessible keyboard interaction.

**Blocked by:** T003.

**Acceptance criteria:**

- Providers can be created, edited, selected as default, and deleted through real UI actions.
- Editing with an empty API-key field preserves the stored key.
- PATCH sends the complete provider payload expected by the backend.
- Provider renderer, frontend, and backend API tests pass.

## T005: Build The Layered Composer And Parameter Menus

**Status:** Pending

**What to build:** Build the two-layer Composer with growing prompt input, reference-image controls, Provider/model context, compact parameter summary, basic/advanced menus, submission shortcuts, and serializable draft restoration.

**Blocked by:** T002, T003, T004.

**Acceptance criteria:**

- No six-column parameter form remains visible in the main layout.
- Enter submits, Shift+Enter inserts a newline, Escape closes menus, and menu keyboard navigation works.
- Uploaded `File` references stay in memory while serializable draft fields persist in localStorage.
- Reference-image mode forces a single output.
- Composer state, UI, and static contract tests pass.

## T006: Render The Task Stream And Reconcile Generation Status

**Status:** Pending

**What to build:** Render chronological prompt/run rows, stable image grids, result actions and preview, optimistic running state, persisted success/failure reconciliation, and backend exception hardening.

**Blocked by:** T001, T003, T005.

**Acceptance criteria:**

- Running, successful, and failed generations remain in one chronological task stream.
- First valid submit creates a session; drafts clear only after a persisted run is confirmed.
- Network or pre-validation failures remain local; failures after run creation are stored in SQLite.
- Unexpected backend exceptions cannot leave a generation permanently `running`.
- Copy-parameters, use-as-reference, preview, and image actions are functional.
- Focused frontend and backend generation-history tests pass.

## T007: Add Playwright Accessibility And Visual Verification

**Status:** Pending

**What to build:** Add isolated deterministic Playwright fixtures and tests for keyboard interaction, dialog focus, responsive layout, themes, task states, Composer menus, and screenshot baselines.

**Blocked by:** T002, T003, T004, T005, T006.

**Acceptance criteria:**

- Tests use an isolated data directory, reject external requests, and do not reuse an existing server.
- Font readiness is awaited before screenshots.
- Light and dark screenshots pass at `1280x860` and `960x640` without overlap or overflow.
- Empty, running, success, failure, menu, dialog, and preview states are covered.

## T008: Finalize Documentation And Release-Grade Verification

**Status:** Pending

**What to build:** Update project knowledge and developer documentation, verify frontend asset bundling and backend packaging, run the full Python/Node/Playwright/Rust suite, and smoke-test Tauri hot reload.

**Blocked by:** T001, T002, T003, T004, T005, T006, T007.

**Acceptance criteria:**

- README and knowledge files describe the final stack, development loop, and verification strategy.
- Vendor regeneration produces no unexpected diff and all frontend assets are included in the sidecar bundle.
- Full pytest, Node, Playwright, and Cargo verification passes.
- Linux Tauri smoke testing succeeds; Windows WebView2 screenshots remain the final pixel-fidelity authority.
