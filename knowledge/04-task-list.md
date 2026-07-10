# Task List

## Execution Rules

- Each task should have a concrete output.
- Each task should be small enough to verify independently.
- Do not start implementation until the review notes are resolved or explicitly accepted.

## Task Status

| ID | Area | Task | Output | Depends On | Status |
| --- | --- | --- | --- | --- | --- |
| T001 | State | Model new-task drafts and optimistic runs | Tested pure workbench state | None | In Progress |
| T002 | Shell | Bundle icons and build the Windows shell | Offline assets and themed shell | None | Pending |
| T003 | Sessions | Render sidebar, new tasks, and session dialogs | Accessible session workflow | T001, T002 | Pending |
| T004 | Providers | Add Provider management dialog | Complete Provider CRUD UI | T003 | Pending |
| T005 | Composer | Build layered Composer and parameter menus | Draft-aware generation Composer | T002-T004 | Pending |
| T006 | Timeline | Render and reconcile task states | Persistent chronological task stream | T001, T003, T005 | Pending |
| T007 | Testing | Add Playwright accessibility and visual checks | Isolated deterministic UI suite | T002-T006 | Pending |
| T008 | Release | Update docs and run release-grade verification | Verified desktop development build | T001-T007 | Pending |

## Recommended Order

1. T001 and T002 establish state and shell foundations.
2. T003 and T004 complete navigation and Provider management.
3. T005 and T006 deliver the Composer-to-task-stream workflow.
4. T007 and T008 complete visual and release verification.

## Blockers

- T003-T008 remain blocked by the dependencies listed above.
- Final Windows pixel fidelity requires WebView2 verification on Windows hardware or CI.

## Verification Checklist

- Run the focused test listed by each ticket before advancing it.
- Run the full Python, Node, Playwright, and Rust suite in T008.
- Keep Git history as normal per-ticket commits; do not squash.
