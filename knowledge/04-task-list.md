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
| PKG001 | Release | Apply new app icon and localize Windows installers | Historical version 0.2.1 installer preparation | UI008 | Done |
| UI009 | Interaction | Anchor temporary layers and add restrained motion | Responsive popovers, dialogs, and reduced-motion support | UI008 | Done |
| STG001 | Storage | Configure a restart-only local data directory | Copy-safe migration, bootstrap configuration, settings UI, and browser coverage | UI004, UI008 | Done |
| UI010 | Settings | Replace the mixed Provider dialog with a dedicated settings view | Vertical settings navigation with isolated Provider and local-data panels | UI004, STG001 | Done |
| UI011 | Sessions | Add pinned sessions and local project groups | SQLite migration, project APIs, and grouped sidebar management | UI003, UI010 | Done |
| SET001 | Settings | Render scan-first Provider management states | Tested loading, empty, error, and Provider row renderer | UI010 | Done |
| SET002 | Settings | Move Provider mutations into focused dialogs and row menus | Accessible add, edit, default, and named-delete workflows | SET001 | Done |
| SET003 | Storage | Refocus local data settings on current and pending state | Restart-only change dialog with guarded async lifecycle | UI010, STG001 | Done |
| SET004 | Settings | Apply the Codex Desktop settings shell and visual contracts | Responsive light/dark shell, WCAG contrast contract, and 16 settings visual baselines | SET002, SET003 | Done |
| SET005 | Release | Update settings redesign knowledge and run release-grade verification | Updated project knowledge and verified desktop branch | SET004 | Done |
| THM001 | State | Add theme state and pre-style bootstrap | Tested system/light/dark preference restored before paint | SET005 | Done |
| THM002 | Settings | Add the dedicated Appearance category | First-position Appearance UI with Provider shortcut compatibility | THM001 | Done |
| THM003 | Desktop | Synchronize the native window theme | Current-window Tauri command for system/light/dark | THM001, THM002 | Done |
| THM004 | Testing | Cover theme visuals, failures, retries, and stale responses | Behavior, contrast, Rust, and 20-baseline regression coverage | THM001-THM003 | Done |
| THM005 | Release | Preserve theme knowledge and run release-grade verification | Updated project knowledge and verified theme branch | THM004 | Done |
| UI012 | Sessions | Update project and pin state atomically | Optional pin patch with rollback coverage | UI011 | Done |
| UI013 | State | Model project collapse and session drops | Tested localStorage normalization and drop payloads | UI012 | Done |
| UI014 | Sessions | Render a collapsible accessible session tree | Stable project and session row DOM | UI013 | Done |
| UI015 | Interaction | Add row actions, persistence, and pointer moves | Complete sidebar workflow with failure recovery | UI014 | Done |
| UI016 | Settings | Convert Settings to a responsive native modal | Nested modal lifecycle and target-size geometry | UI015 | Done |
| UI017 | Composer | Place validation and clear accepted prompts | Snapshot-based prompt/reference handoff | UI016 | Done |
| UI018 | Motion | Animate optimistic prompt handoff | Telegram-style 250ms motion with safe cleanup | UI017 | Done |
| UI019 | Testing | Refresh interaction and visual coverage | Focused behavior matrix and 24 affected baselines | UI012-UI018 | Done |
| UI020 | Release | Preserve knowledge and run centralized gates | Final source and Windows evidence | UI019 | Done |

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
12. THM001-THM004 add the device-local three-mode Appearance preference, pre-paint restoration, native synchronization, and regression coverage.
13. THM005 records the final theme boundaries and runs release-grade verification.
14. UI012-UI015 make session grouping directly operable without changing schema or filesystem ownership.
15. UI016-UI018 deliver the responsive Settings and Composer interaction contracts.
16. UI019-UI020 refresh deterministic baselines, preserve decisions, and run the consolidated gates once.

## Single-Process Rust Migration

Source: `docs/spec/2026-07-15-single-process-rust-desktop-backend-design.md`, `docs/adr/0001-single-process-rust-desktop-backend.md`, and `tickets.md`.

| ID | Area | Task | Status |
| --- | --- | --- | --- |
| RB001 | Contract | Establish Rust backend contracts and fixtures | Done |
| RB002 | Data | Prove SQLite schema v1/v2 in-place compatibility | Done |
| RB003 | Storage | Port workspace bootstrap and copy migration | Done |
| RB004 | Provider | Port Provider, Settings, and secret semantics | Done |
| RB005 | History | Port projects, sessions, and generation history | Done |
| RB006 | Generation | Port validation and Provider HTTP client | Done |
| RB007 | Generation | Implement staged references and durable generation | Done |
| RB008 | Desktop | Add restricted media protocol and Tauri commands | Done |
| RB009 | Frontend | Add the injectable Desktop API adapter | Done |
| RB010 | Cutover | Switch production frontend orchestration to IPC | Done |
| RB011 | Packaging | Remove the former secondary runtime from production | Done |
| RB012 | Windows | Produce MSI and single-file Portable assets | Done |
| RB013 | Release | Synchronize v0.3.0 architecture and release documentation | Done |
| RB014 | Windows gate | Verify upgrade, rollback, payload, runtime, media, and shutdown | Done |

## Blockers

- RB001-RB014 have no implementation blockers.
- Windows workflow run `29605770705` passed with `publish_release=false`; creating the public v0.3.0 Release remains a separate explicit release action.

## Verification Checklist

- Run each ticket's focused test before advancing it.
- Run the consolidated Node, Playwright, Rust, static, and desktop checks before the Windows gate.
- Keep the theme VM/static/Rust contracts and manual/system behavior, persistence failure, native retry, and stale-response checks green.
- Keep the settings WCAG token contract and all 20 light/dark, target-size visual baselines green.
- Run `scripts/verify_windows_single_process.ps1` against both v0.3.0 assets and verify schema-v2 upgrade/rollback on Windows before release.
- Verify native content/titlebar synchronization and the ID-only media protocol on Windows WebView2 at both target sizes before release.
- Keep normal per-ticket Git commits; do not squash.
