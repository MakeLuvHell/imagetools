# Single-Process Rust Desktop Backend Design

## Goal

Replace the packaged Python/FastAPI sidecar with Rust services inside the Tauri
application so the complete Windows x64 desktop runtime has one application
executable and one application process.

The migration must preserve all existing workspace data and user-visible image
creation behavior. It is an architecture migration, not a product redesign.

## Confirmed Product Decisions

- The installed application payload has one executable: `Image Tools.exe`.
- The running application has one Image Tools process and no backend child
  process.
- The release frontend calls the Rust host through Tauri IPC.
- The release application does not expose a loopback UI HTTP API.
- The current SQLite database, workspace files, storage-location bootstrap, and
  Provider secrets remain compatible in place.
- The single-process requirement applies to MSI and portable release builds.
  Development and test tooling may use helper processes.
- Windows x64 is the first release gate. The Rust implementation remains
  portable and continues to compile and test on Linux.
- Implementation starts only after the active theme-preference branch is merged.
- Rust and Python implementations are compared in parallel before one final
  frontend cutover.

## Scope

### In Scope

- Rust implementations of workspace storage, SQLite access, Providers,
  projects, sessions, generation history, image generation, and file storage.
- Tauri commands for every operation currently used through `/api/*`.
- A centralized frontend desktop API adapter that isolates UI orchestration
  from Tauri command names.
- A read-only custom media protocol that serves stored images by database ID.
- Direct compatibility with schema v1 and v2 workspaces.
- In-place compatibility with configured and pending workspace data-directory
  changes.
- Python/Rust behavioral parity fixtures before cutover.
- Removal of FastAPI, Uvicorn, PyInstaller, the sidecar binary, and sidecar
  lifecycle code after parity is complete.
- Windows x64 MSI and portable ZIP release verification.

### Out Of Scope

- UI redesign, new image-generation features, or new Provider capabilities.
- A new SQLite schema version solely for the backend-language migration.
- A release UI HTTP server or a permanent Rust REST compatibility layer.
- Accounts, cloud synchronization, or remote access to workspace operations.
- Windows ARM64, macOS, or Linux release artifacts in the first cutover.
- Code signing and automatic updates without separately supplied release
  credentials and keys.
- A strictly self-contained data directory beside the portable executable.
  Workspace data continues to use the normal or user-selected data root.

## Alternatives Considered

### Selected: Parallel Rust Implementation With One Final Cutover

Build and test Rust services beside the Python implementation. For each domain,
run both implementations against equivalent database copies and Provider
fixtures. Switch the frontend to Tauri IPC only after all domains reach parity,
then remove the Python production path.

This keeps every intermediate commit testable, avoids shipping a hybrid
runtime, and gives data compatibility an explicit proof point.

### Rejected: Temporary In-Process Axum Compatibility API

Port the REST API to Axum first, retain the current frontend, then replace REST
with Tauri IPC. This reaches one process sooner but migrates the frontend
boundary twice and creates a substantial temporary API that must later be
deleted.

### Rejected: One Large Direct Rewrite

Replace the database, generation client, frontend transport, and packaging in
one change. This minimizes temporary duplication but combines unrelated failure
modes, makes review and rollback difficult, and increases conflicts with active
frontend work.

### Rejected: Embedded CPython

Embedding Python could technically avoid a child process, but it retains the
Python runtime, GIL, packaging complexity, and cross-language lifecycle risks.
It does not deliver the same compiled desktop architecture as the selected
Rust/Tauri approach.

## Runtime Architecture

The release runtime contains one Tauri process with these internal boundaries:

- `database`: rusqlite connection ownership, schema validation, transactions,
  repositories, and migration compatibility.
- `providers`: Provider validation, secret retention, default selection, and
  public redaction.
- `sessions`: projects, sessions, pinning, generation runs, and image metadata.
- `generation`: parameter validation, Provider request construction, upstream
  HTTP calls, result decoding/downloading, and run completion.
- `storage`: bootstrap configuration, active data-root resolution, pending copy
  migration, and directory validation.
- `commands`: narrow Tauri command adapters that parse DTOs, call services, and
  serialize stable results or errors.
- `media`: a read-only custom protocol that resolves stored image IDs to
  validated workspace files.
- `app_state`: initialized service ownership shared by Tauri commands.

`main.rs` remains lifecycle composition rather than becoming a monolithic
backend. Domain logic belongs in focused modules that can be tested without a
WebView.

The Tauri window loads bundled application assets through the normal Tauri
application URL. It no longer opens an external loopback URL and no longer
starts, waits for, stores, or kills a sidecar command.

## Frontend Boundary

Add a focused `frontend/desktop-api.js` adapter. It exposes UI-oriented methods
for settings, storage location, Providers, projects, sessions, runs, and
generation. `frontend/app.js` calls this adapter instead of scattering direct
`invoke` calls throughout orchestration.

The adapter preserves the public DTO shapes currently consumed by the UI where
those shapes remain appropriate. This keeps rendering, optimistic-run state,
and accessibility behavior independent from Rust command naming.

The release adapter uses Tauri `invoke`. Browser and Playwright tests install a
mock adapter. A browser-only production backend is not retained.

All commands return structured errors with:

- a stable machine-readable code;
- a localized user-facing message;
- optional safe diagnostic context.

Diagnostics must not include Provider keys, complete upstream authorization
headers, uploaded image bytes, or arbitrary filesystem paths.

## Data Compatibility

The Rust implementation opens the current `workbench.sqlite3` in place. It
supports existing schema migrations through version 2 and preserves:

- `schema_migrations`;
- `providers` and default-Provider semantics;
- `projects`;
- `sessions`, including nullable project assignment and pinning;
- `generation_runs` and all parameter/Provider/model snapshots;
- `images` and stored relative file paths.

The migration itself does not increment the schema version. An upgraded
workspace can therefore be reopened by the previous Python release if rollback
is required.

The Rust database layer enables foreign keys and preserves current ordering,
nullability, timestamp representation, and transaction boundaries. Provider
PATCH-equivalent updates keep the existing key when the submitted key is empty.
Public Provider DTOs never return stored secrets.

Startup performs these steps in order:

1. Resolve the stable storage-location bootstrap path.
2. Read and validate active and pending location state.
3. Complete any pending copy migration before opening SQLite.
4. Validate the selected data root and database schema.
5. Initialize Rust services and command state.
6. Create the main window.

An inaccessible custom root, corrupt database, or unsupported newer schema
produces a visible native startup error and exits. The application must not
silently create an empty replacement workspace.

Storage copy migration retains the source and uses SQLite backup semantics for
the database. Existing `images/`, `uploads/`, and legacy `settings.json` files
remain part of the coherent workspace payload.

## Generation Data Flow

1. The frontend submits the prompt, selected Provider/model, parameters,
   session information, and optional reference image through the desktop API.
2. Reference data enters Rust as bounded binary data rather than base64 inside
   a normal JSON DTO. File size and accepted image type are validated before
   persistence or upstream use.
3. Rust validates the generation request and creates a durable `running` row
   with parameter, Provider, and model snapshots.
4. Rust uses `reqwest` with explicit timeouts to call the configured
   OpenAI-compatible generation or edit endpoint.
5. URL results are downloaded and base64 results are decoded by Rust. Each file
   is written to a temporary file and atomically renamed into `images/`.
6. Image metadata is inserted and the generation run becomes `succeeded` in a
   coherent completion path.
7. Every error after run creation finishes the run as `failed` before returning
   a safe structured error.

On startup, any run left in `running` by a terminated process is changed to a
failed interruption state. This prevents a forced operating-system shutdown or
crash from leaving permanent running history.

Large generated image bytes do not return through ordinary IPC. Result DTOs
contain metadata and a media URI derived from the image ID.

## Media Protocol

Use a narrow read-only URI such as `imagetools-media://image/<id>`.

For every request, the handler:

1. Parses a numeric stored image ID.
2. Looks up the image row in the active database.
3. Resolves and canonicalizes the stored file path.
4. Verifies the final target remains under the active workspace image root.
5. Rejects missing rows, traversal, symlink escape, unsupported methods, and
   non-file targets.
6. Returns the file with the correct image content type and no write behavior.

The frontend cannot request arbitrary local paths. Raw data-root paths are not
embedded in result URLs.

## Migration And Coordination

Implementation begins after `feat/theme-preference` is complete and merged.
The migration branch is created from that updated `main` in its own worktree.

Work proceeds by domain rather than by rewriting the entire application at
once:

1. Rust foundations, shared DTOs, errors, and test fixtures.
2. SQLite repositories and v1/v2 compatibility.
3. Storage-location bootstrap and copy migration.
4. Providers and legacy settings migration.
5. Projects, sessions, runs, and image metadata.
6. Generation client, file persistence, and media protocol.
7. Frontend desktop API adapter and IPC cutover.
8. Python/sidecar removal and release packaging.

During steps 1 through 6, the production frontend continues to use Python.
Rust behavior is exercised through unit, integration, and parity tests only.
The project never releases both Python and Rust backends as active choices.

Knowledge files that overlap the theme work are updated only after that branch
is merged. No theme implementation is reverted or duplicated.

## Error Handling And Lifecycle

- Startup failures use a native visible error surface and terminate without
  opening an empty workbench.
- Tauri commands return structured safe errors and keep established inline UI
  failure behavior.
- Provider transport, status, decoding, and persistence failures remain
  distinguishable for diagnostics without exposing secrets.
- Partial image files use temporary names and are removed on failure.
- Database writes use transactions where multiple records must change
  coherently.
- Closing the main window follows normal Tauri exit. There is no child process
  cleanup path.
- Interrupted `running` rows are recovered on the next startup.
- Storage changes remain restart-only; the active connection and media root
  never switch while the process is running.

## Security

- Tauri capabilities grant only required commands to the main window.
- No release UI API listens on TCP.
- External navigation remains restricted.
- Provider keys are write-only from the frontend perspective and redacted from
  logs, DTOs, and errors.
- Reference uploads have explicit size and type limits.
- The media protocol is read-only, ID-based, and workspace-contained.
- Upstream URLs remain limited to configured Provider behavior; authentication
  headers are sent only by the Rust generation client.

## Release Packaging

The first single-process release targets Windows x64 and publishes:

- `Image-Tools-vX.Y.Z-Windows-x64.msi`;
- `Image-Tools-vX.Y.Z-Windows-x64-Portable.zip` containing only
  `Image Tools.exe`.

The release no longer publishes NSIS. A typical NSIS install writes a separate
uninstaller executable, while MSI uses Windows Installer metadata and better
matches the single-executable installed payload requirement.

The application executable embeds Rust logic, bundled SQLite, frontend assets,
icons, and IPC handlers. The application payload does not contain Python,
FastAPI, Uvicorn, PyInstaller, a backend executable, or `externalBin`.

Windows WebView2 is an operating-system runtime prerequisite rather than an
Image Tools companion executable. Durable database, image, upload, and
configuration files remain outside the installed program directory.

## Testing

### Rust Unit Tests

- Request validation and option normalization.
- Provider URL joining and endpoint selection.
- Secret preservation and public redaction.
- Structured error mapping.
- DTO serialization contracts.
- Media ID parsing and workspace path containment.

### Database And Storage Tests

- Fresh schema initialization and existing v1/v2 fixtures.
- Provider, project, session, pin, run, and image behavior.
- Foreign keys, ordering, nullability, snapshots, and transactions.
- Storage bootstrap parsing and pending copy activation.
- SQLite backup and source preservation.
- Corrupt, inaccessible, and unsupported-newer database handling.

### Python/Rust Parity Tests

Run equivalent operations against independent copies of the same fixture and
compare normalized public data and durable state. Cover:

- legacy settings to default-Provider migration;
- Provider CRUD and empty-key preservation;
- project and session organization;
- successful, upstream-failed, and unexpected-failed generation history;
- reference generation and stored image metadata;
- configurable data-directory migration.

### Frontend Tests

- Desktop API method-to-command mappings and error normalization.
- Existing draft, optimistic-run, session, settings, and accessibility tests.
- Playwright mocks at the desktop API boundary.
- Existing light/dark, viewport, dialog, menu, and task-state visual coverage.

### Desktop And Release Tests

- `cargo test` and `cargo check` on Linux during development.
- Windows x64 Tauri build and WebView2 smoke tests.
- MSI install, launch, upgrade, uninstall, and previous-version rollback.
- Portable ZIP inventory and launch.
- Process inspection proving one Image Tools process and no backend process.
- Port inspection proving no UI loopback listener.
- Close verification proving the process exits completely.
- Installed-payload inspection proving there is one application executable.
- Upgrade verification against a real previous-release workspace copy.

## Documentation Impact

- Add this design and the corresponding ADR.
- After the theme branch merges, update project overview, requirements, tech
  stack, task list, review notes, testing strategy, decisions, and lessons.
- Update README development, build, release, runtime, and data documentation at
  the final cutover.
- Remove Python sidecar build and troubleshooting instructions only when the
  Python production path is removed.
- No `CONTEXT.md` glossary change is required because this is an implementation
  architecture decision, not new domain language.

## Acceptance Criteria

- Existing Provider, project, session, run, image, upload, and storage-location
  data opens in place with no manual import.
- Current user-visible workflows and failure states remain behaviorally
  equivalent.
- The release frontend uses Tauri IPC and exposes no UI loopback HTTP API.
- The installed payload contains one application executable and no Python or
  backend executable.
- The portable ZIP contains only `Image Tools.exe`.
- The running application has exactly one Image Tools process.
- Closing the application leaves no Image Tools process running.
- API keys are absent from public DTOs, logs, and errors.
- Media access rejects arbitrary paths and workspace escape.
- All Node, Playwright, Rust, packaging, parity, and Windows smoke checks pass.
- Windows x64 is the release gate; portable Rust checks remain green on Linux.

## Residual Risks

- Python and Rust can differ in exact upstream error classification. Fixed
  Provider response fixtures and normalized error contracts reduce this risk.
- Binary reference IPC can cause high memory usage. Bounded raw transfer and an
  explicit upload limit reduce the risk.
- Custom protocol behavior can vary under Windows WebView2. Windows integration
  and packaged-app tests are required before release.
- A large migration can hide behavioral regressions. Domain-by-domain parity
  gates and one final cutover keep failures attributable.
