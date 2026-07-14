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
| PKG001 | Release | Apply new app icon and localize Windows installers | Version 0.2.1 NSIS/MSI release preparation | UI008 | Done |
| UI009 | Interaction | Anchor temporary layers and add restrained motion | Responsive popovers, dialogs, and reduced-motion support | UI008 | Done |
| STG001 | Storage | Configure a restart-only local data directory | Copy-safe migration, bootstrap configuration, settings UI, and browser coverage | UI004, UI008 | Done |
| UI010 | Settings | Replace the mixed Provider dialog with a dedicated settings view | Vertical settings navigation with isolated Provider and local-data panels | UI004, STG001 | Done |
| UI011 | Sessions | Add pinned sessions and local project groups | SQLite migration, project APIs, and grouped sidebar management | UI003, UI010 | Done |
| SET001 | Settings | Render scan-first Provider management states | Tested loading, empty, error, and Provider row renderer | UI010 | Done |
| SET002 | Settings | Move Provider mutations into focused dialogs and row menus | Accessible add, edit, default, and named-delete workflows | SET001 | Done |
| SET003 | Storage | Refocus local data settings on current and pending state | Restart-only change dialog with guarded async lifecycle | UI010, STG001 | Done |
| SET004 | Settings | Apply the Codex Desktop settings shell and visual contracts | Responsive light/dark shell, WCAG contrast contract, and 16 visual baselines | SET002, SET003 | Done |
| SET005 | Release | Update settings redesign knowledge and run release-grade verification | Updated project knowledge and verified desktop branch | SET004 | Done |

## Recommended Order

1. UI001 and UI002 establish state and shell foundations.
2. UI003 and UI004 complete navigation and Provider management.
3. UI005 and UI006 deliver the Composer-to-task-stream workflow.
4. UI007 and UI008 complete visual and release verification.
5. PKG001 prepares the branded Simplified Chinese Windows installers after UI verification.
6. UI009 refines temporary-layer geometry and interaction motion without changing product scope.
7. STG001 makes the local workbench payload location user-configurable without an in-process data-root switch.
8. UI010 separates settings concerns into a dedicated desktop work area.
9. UI011 adds durable session grouping without adding Codex-only navigation.
10. SET001-SET004 replace the interim settings UI with scan-first Provider management, a state-first storage surface, focused dialogs, and visual/accessibility regression contracts.
11. SET005 records the resolved design and testing boundaries before final branch verification.

## Blockers

- No implementation blockers remain.
- Final Windows pixel calibration still requires WebView2 screenshots on Windows hardware or CI.

## Verification Checklist

- Run each ticket's focused test before advancing it.
- Run the full Python, Node, Playwright, and Rust suite in UI008.
- Keep the settings WCAG token contract and all 16 light/dark, target-size visual baselines green.
- Keep normal per-ticket Git commits; do not squash.
