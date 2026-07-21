# Review Notes

## Single-Process Rust Migration Review

### Product

- Closing the desktop application must terminate the entire product runtime; there is no background mode.
- The Windows release offers an MSI and a Portable ZIP whose only entry is `Image Tools.exe`.
- Existing Provider, project, session, timeline, Composer, storage, result, and three-mode theme workflows remain in scope.
- v0.3.0 passed RB014 against real Windows x64 artifacts in workflow run `29605770705`.

### Architecture

- The production window loads bundled frontend assets and communicates only through Tauri IPC.
- Rust owns startup, SQLite, storage selection/migration, Provider configuration, generation, reference staging, media, native picking, saving, and theme synchronization.
- The command adapter is injectable for browser and Node tests; production orchestration obtains it from `ImageToolsDesktopApi.current()`.
- Persisted media is returned through an ID-only custom protocol. The resolver carries a capability-contained file handle from validation through bounded reading.
- The release UI exposes no network listener and accepts no arbitrary local filesystem URL.

### Frontend And Theme

- Top-level Tauri arguments use camelCase, while nested Rust DTO fields retain snake_case.
- Uploaded reference bytes use the raw invoke body and metadata headers; generation receives only metadata and `reference_token` or `reference_image_id`.
- Current-origin localStorage remains the primary theme store under `image-tools-theme` on the bundled application origin.
- The current Tauri-only cookie mirror is still present for compatibility with existing profiles. It stores only the non-sensitive theme enum and is not required for the stable bundled origin.
- Theme persistence and native titlebar errors remain non-destructive; generation tokens prevent stale native completions from replacing newer status.

### Backend And Data

- `CommandError` exposes only `code`, `message`, and optional `diagnostic`; the frontend rebuilds exact shapes and replaces all other rejections with a generic error.
- Provider responses redact the secret by returning `api_key: ""` and the boolean `api_key_set`.
- Schema version remains 2. No v0.3.0 database migration was added.
- v1 initialization upgrades transactionally to v2; a database newer than v2 is rejected.
- Projects soft-delete; sessions soft-delete; project deletion unassigns sessions; Provider deletion preserves run snapshots and nulls `provider_id`; session deletion cascades generation runs and images.
- Startup imports legacy settings when needed and converts interrupted runs to a durable failed state before exposing commands.

### Generation And Media Security

- Reference files are limited to 25 MiB and staged tokens are single-use with 24-hour cleanup.
- Provider JSON responses are limited to 192 MiB and each result image to 64 MiB.
- PNG, JPEG, and WebP are accepted by byte signature; stored extension and served MIME derive from bytes.
- Media paths must be flat `images/<filename>` entries and remain inside the capability directory; traversal, nested paths, links, replacements, unsupported bytes, and oversized files fail closed.
- Media responses include signature-derived `Content-Type`, `X-Content-Type-Options: nosniff`, and CORS.

### Packaging And Release

- `npm run desktop:build:windows` targets `x86_64-pc-windows-msvc` and builds MSI only.
- The workflow renames the MSI to a stable asset name and creates the Portable ZIP directly from the release `Image Tools.exe`.
- `scripts/verify_windows_single_process.ps1` inspects both payloads, installs/uninstalls the MSI, launches installed and Portable copies, checks process count and listeners, closes the window, and rejects leftover processes.
- Windows assets are unsigned and no automatic updater is configured.

## Resolved Review Findings

- Generation never holds the database guard across an asynchronous Provider call.
- Post-commit DTO failures do not delete files already referenced by committed rows.
- Session deletion during generation completion is rechecked inside the completion transaction.
- The Desktop API adapter does not pass arbitrary rejection objects or raw reference data through generation metadata.
- Tauri uses one combined invoke handler so shell and workbench commands cannot overwrite one another.
- Production configuration contains no external binary and invokes Tauri directly in development and build scripts.

## Completed Windows Gate

RB014 Windows x64 evidence records:

- MSI and Portable payload contents and stable asset names.
- Exactly one application process, no UI listener, and complete exit after window close.
- Installed and Portable startup, generation/media/native-save smoke behavior.
- Opening a v0.2.3 schema-v2 workspace with v0.3.0 and reopening it with v0.2.3 after backup/rollback.
- Windows WebView2 media URL mapping, native theme synchronization, and target-size visual checks.

Workflow run `29605770705` passed the MSI/Portable single-process verifier, v0.2.3 to v0.3.0 upgrade and v0.2.3 rollback verifier, and artifact upload. It ran with `publish_release=false`, so no tag or public Release was created.

## Responsive Workbench Interaction Review

### Product And Frontend

- Settings is a centered native modal at approximately `75vw x 78vh`, capped at `1040x760`; Appearance, Provider, and Local Data scroll within the modal and child dialogs close before Settings.
- Accepted prompts clear immediately after optimistic acceptance. Pre-submit validation stays above the Composer, while staging and generation failures remain in their generation round.
- The transient prompt clone moves into the real optimistic bubble over 250ms. Reduced motion, resize, session switch, rerender, and animation rejection reveal the real prompt and remove the clone.
- Sidebar row menus target the clicked session and contain pin, move, rename, and delete. The task-header menu has been removed.
- Projects default expanded, persist collapsed IDs in localStorage, expand for selection/drop, and accept Pointer Event moves after a 6px threshold and 500ms collapsed-target hover.

### Backend And Data

- `SessionUpdateInput` now accepts an optional `is_pinned` patch. Title, project, and pin changes share one immediate SQLite transaction; invalid projects roll back all changes.
- Schema remains version 2. Project movement changes metadata only and never moves workspace files.
- The standalone pin command remains for existing menu compatibility; drag uses one `update_session` payload and never chains two mutations.

### Focused Verification

- Rust model, service, rollback, missing-patch, IPC lifecycle, and Desktop API adapter tests passed.
- Node workbench/UI/static suites passed during each RED/GREEN cycle.
- Playwright covered row targeting, collapse persistence, ordinary and pinned drops, hover expansion, cancel/failure cleanup, modal geometry/focus, validation, prompt/reference handoff, Telegram motion, reduced motion, resize/session switch, and animation failure.
- Twenty-four affected shell/settings light/dark baselines at `1280x860` and `960x640` were regenerated, visually inspected, and reproduced without update mode.

### Consolidated Non-Windows Gate

The final clean-worktree gate passed after UI012-UI019 were complete:

- pytest: 54 passed.
- Node: 97 passed.
- Playwright: 65 passed.
- Rust: 135 passed.
- `cargo fmt --check`, `mise run desktop-check`, and `git diff --check`: exit 0.

### Responsive Interaction Windows Gate

Workflow run [`29651658576`](https://github.com/MakeLuvHell/imagetools/actions/runs/29651658576) built commit `7a91a47b59257601be400b988362a8155dd46560` with `publish_release=false` and completed successfully:

- Windows x64 MSI build and single-executable Portable staging: success.
- MSI/Portable payload, process, listener, window-close, and exit verification: success.
- v0.2.3 baseline download and schema-v2 upgrade/rollback verification: success.
- Artifact upload: `8431714800`, `image-tools-v0.3.0-windows-x64`, 10,805,716 bytes.
- GitHub Release creation and asset publication: skipped.
- The immutable `v0.3.0` tag still resolves to `cc56df12b2ab85dffcb10a3e4887978bc21ec2b1`.

## v0.4.0 Multi-Protocol Review

### Product And Frontend

- Provider protocol selection is explicit; probe and model discovery are independent actions with inline state.
- Composer and history preserve up to three ordered references, with protocol-specific limits and no raw image bytes in drafts or generation metadata.
- OpenAI-only advanced controls are hidden or normalized for xAI and Gemini; Gemini result count remains one and sizing is model-aware.

### Backend, Data, And Security

- Built-in Rust adapters implement OpenAI Compatible, xAI Imagine, and Gemini Native Image inside `Image Tools.exe`; no sidecar, listener, hostname inference, or runtime plugin loading was added.
- Schema v3 transactionally adds Provider protocol/model cache and ordered run references, backfilling legacy single references at position 0.
- Discovery and generation responses are bounded. Secrets, raw bodies, base64 reference Data URLs, and local media URLs do not enter errors or history.
- Rollback to v0.3.0 requires restoring the pre-upgrade schema-v2 backup; the migrated schema-v3 workspace is intentionally rejected by the older app.

### Verification Status

- MP001-MP006 focused Rust, Node, and Playwright checks passed during implementation.
- Version/documentation and Windows upgrade-gate integration are complete locally.
- Consolidated source gates and the one final Windows MSI/Portable gate remain pending until MP007 finishes.

## Latest-Run Follow Review

### Product And Frontend

- Entering an existing session aligns its timeline directly to the latest generation run after history loads.
- Accepted prompt handoff includes the pending timeline scroll distance in the optimistic bubble's final viewport coordinates. The scroll and clone share one 250ms cycle and one cleanup path.
- Reduced motion, missing geometry, animation rejection, resize, and session switching settle to the latest record without leaving hidden prompt or transient clone state.
- Backend history reconciliation does not initiate a second follow movement.
- Result actions retain preview, download, copy link, set reference, and the separate run-level parameter copy; the duplicate “基于结果继续” command and its dead styles were removed.

### Focused Verification

- Node UI suite: 19 passed.
- Playwright interaction selection: 7 passed, covering long-session entry, prompt follow, optimistic handoff, result actions, reduced motion, resize/session cleanup, animation failure, and historical result references.
- `git diff --check`: exit 0.

### Latest-Run Windows Gate

Workflow run [`29655474254`](https://github.com/MakeLuvHell/imagetools/actions/runs/29655474254) built commit `77ae4cee7b4ff2e46cdd7a3971c955769f901ece` with `publish_release=false` and completed successfully:

- Windows x64 MSI build and single-executable Portable staging: success.
- MSI/Portable payload, process, listener, window-close, and exit verification: success.
- v0.2.3 baseline download and schema-v2 upgrade/rollback verification: success.
- Artifact upload: `8432801140`, `image-tools-v0.3.0-windows-x64`, 10,807,323 bytes.
- GitHub Release creation and asset publication: skipped.
- The immutable `v0.3.0` tag still resolves to `cc56df12b2ab85dffcb10a3e4887978bc21ec2b1`.
