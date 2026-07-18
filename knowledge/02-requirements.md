# Requirements

## Confirmed Requirements

- Ship Tauri 2, Rust, SQLite, and bundled vanilla HTML/CSS/JavaScript as one application process.
- The installed application payload and Portable ZIP contain one application executable named `Image Tools.exe`.
- Do not expose a local REST or UI listener in development or release runtime.
- Route frontend operations through `window.ImageToolsDesktopApi` and Tauri commands.
- Use ID-only, read-only media URLs for persisted images and the native save dialog for downloads.
- Preserve the schema-v2 workbench layout and existing v0.2.3 data.
- Keep Provider API keys backend-only; desktop responses return an empty `api_key` plus `api_key_set`.
- Use the native Windows titlebar and provide `system`, `light`, and `dark` appearance modes.
- Persist theme primarily under `image-tools-theme` in the bundled app origin's localStorage. The existing Tauri-only host cookie mirror remains a compatibility layer for the non-sensitive enum; neither layer belongs to workspace data.
- Start on an unpersisted new-task draft; derive the session title from the first valid prompt.
- Isolate drafts and optimistic runs by session and submission ID.
- Persist every run created by the Rust backend as succeeded or failed, including unexpected errors after creation.
- Keep references bounded and one-use; generation accepts either a staged `reference_token` or a persisted `reference_image_id`, never both.
- Open Settings as a centered native modal sized approximately `75vw` by `78vh`, capped at `1040x760`, with internal content scrolling and nested-dialog focus restoration.
- Clear an accepted Composer prompt immediately while retaining common parameters, place pre-submit validation directly above the Composer, and animate the prompt into its optimistic timeline bubble unless reduced motion is requested.
- Expose pin, move, rename, and delete on each sidebar session row; projects expand/collapse with device-local persistence and accept pointer-driven session moves.
- Move and unpin a pinned session in one `update_session` command and one SQLite transaction.

## User Flows

### New Task And Generation

1. Open the bundled desktop workbench on an empty draft.
2. Enter a prompt and optionally choose a Provider, model, reference, and parameters.
3. Submit; the frontend creates one session when needed, stages uploaded bytes, then invokes `generate_image` with metadata and an optional token or image ID.
4. Reconcile the optimistic row with the durable success/failure history.

### Continue From History

1. Select a session from the sidebar.
2. Inspect chronological prompts, parameters, errors, and ID-only image URLs.
3. Preview, save, or use a result as a reference.
4. Refine and submit from the same Composer.

### Provider Management

1. Open Provider settings.
2. Create, edit, delete, or select the default Provider.
3. Leave API Key empty during edit to preserve the stored secret.

### Organize Sessions

1. Expand or collapse project groups in the sidebar; the collapsed set remains local to the device.
2. Use a session row menu for pin, move, rename, or delete without changing the current selection.
3. Drag a session row onto a project after the 6px movement threshold; hovering over a collapsed project expands it after about 500ms.
4. Reload authoritative sessions after the move; a pinned session is moved and unpinned atomically.

### Workspace Location

1. Select an absolute destination with the native picker or enter it manually.
2. Choose whether to copy the existing payload.
3. Restart to activate the pending location; retain the old root as recovery data.

## Data Requirements

- `workbench.sqlite3` stores Providers, projects, sessions, generation runs, and image metadata.
- `images/` stores generated image bytes and `uploads/` stores short-lived staged references.
- Provider/model and generation parameter snapshots remain historical.
- `storage-location.json` stays in the fixed app-local configuration directory.
- `settings.json` remains a compatibility input for the old single-Provider settings shape.
- Theme state is installation-local and does not move with the workbench payload.

## Edge Cases

- Malformed localStorage drafts and theme values fall back safely.
- Malformed or stale collapsed-project IDs normalize to known positive project IDs.
- Rapid double submit creates one session and one generation.
- A retry after an IPC failure reuses an already-created session when appropriate.
- Late responses cannot mutate another session's optimistic state.
- Reference mode forces one result and disables incompatible transparent-background options.
- A deleted session cannot receive a late generation completion.
- Interrupted `running` rows are recovered as failed during startup.
- Oversized, malformed, unsupported, escaped, nested, linked, or replaced media files are rejected.
- An invalid custom workspace root fails visibly instead of silently opening a different history.
- Startup failure is shown in a native dialog and terminates the application.
- Resize, session switch, reduced motion, animation failure, pointer cancel, and an outside drop leave no transient prompt or drag layer behind.

## Non-Functional Requirements

- Security: no arbitrary filesystem paths in media URLs; secrets remain Rust-only; external UI navigation is rejected.
- Reliability: database migrations and generation completion are transactional; file publication is atomic.
- Performance: Provider responses, references, and result images have explicit byte limits.
- Accessibility: named icon controls, focus rings, trapped dialogs, keyboard menus, Escape restoration, and Enter/Shift+Enter semantics.
- Offline behavior: bundled shell, icons, history, settings, and media work locally; generation alone requires the configured Provider endpoint.

## Release Requirements

- Version metadata is `0.3.0` and the immutable release tag is `v0.3.0`.
- Windows x64 release assets are one MSI and one Portable ZIP.
- Assets are unsigned and have no automatic update mechanism.
- The Windows verifier must pass before release; Linux checks cannot substitute for this gate.
