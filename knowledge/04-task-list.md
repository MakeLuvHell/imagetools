# Task List

## Execution Rules

- Each task should have a concrete output.
- Each task should be small enough to verify independently.
- Do not start implementation until the review notes are resolved or explicitly accepted.

## Task Status

| ID | Area | Task | Output | Depends On | Status |
| --- | --- | --- | --- | --- | --- |
| UI001 | State | Model new-task drafts and optimistic runs | Tested pure workbench state | None | Done |
| UI002 | Shell | Bundle icons and build the Windows shell | Offline assets and themed shell | None | Done |
| UI003 | Sessions | Render sidebar, new tasks, and session dialogs | Accessible session workflow | UI001, UI002 | Done |
| UI004 | Providers | Add Provider management dialog | Complete Provider CRUD UI | UI003 | Done |
| UI005 | Composer | Build layered Composer and parameter menus | Draft-aware generation Composer | UI002-UI004 | Done |
| UI006 | Timeline | Render and reconcile task states | Persistent chronological task stream | UI001, UI003, UI005 | Done |
| UI007 | Testing | Add Playwright accessibility and visual checks | Isolated deterministic UI suite | UI002-UI006 | Done |
| UI008 | Release | Update docs and run release-grade verification | Verified desktop development build | UI001-UI007 | Done |

## Recommended Order

1. UI001 and UI002 establish state and shell foundations.
2. UI003 and UI004 complete navigation and Provider management.
3. UI005 and UI006 deliver the Composer-to-task-stream workflow.
4. UI007 and UI008 complete visual and release verification.

## Blockers

- No implementation blockers remain.
- Final Windows pixel calibration still requires WebView2 screenshots on Windows hardware or CI.

## Verification Checklist

- Run each ticket's focused test before advancing it.
- Run the full Python, Node, Playwright, and Rust suite in UI008.
- Keep normal per-ticket Git commits; do not squash.
