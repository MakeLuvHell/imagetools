# Review Notes

## Single-Process Rust Migration Review

### Product

- Closing the desktop application must terminate the entire product runtime; there is no background mode.
- The Windows release offers an MSI and a Portable ZIP whose only entry is `Image Tools.exe`.
- Existing Provider, project, session, timeline, Composer, storage, result, and three-mode theme workflows remain in scope.
- v0.3.0 is not release-ready until RB014 passes against real Windows x64 artifacts.

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

## Remaining Gate

RB014 must provide Windows x64 evidence for:

- MSI and Portable payload contents and stable asset names.
- Exactly one application process, no UI listener, and complete exit after window close.
- Installed and Portable startup, generation/media/native-save smoke behavior.
- Opening a v0.2.3 schema-v2 workspace with v0.3.0 and reopening it with v0.2.3 after backup/rollback.
- Windows WebView2 media URL mapping, native theme synchronization, and target-size visual checks.

Until that evidence exists, Linux compilation and static package inspection do not prove the Windows release gate.
