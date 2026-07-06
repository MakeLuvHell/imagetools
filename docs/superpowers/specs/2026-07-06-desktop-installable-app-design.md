# Desktop Installable App Design

## Goal

Turn Image Tools into a desktop installable app in the same product shape as a modern Codex-style desktop client: a native app window that starts its own local service and opens directly into the existing image generation UI.

The first desktop version must:

- Build installable desktop bundles through Tauri.
- Start without requiring the user to run `uvicorn` manually.
- Reuse the existing FastAPI backend and static frontend.
- Store runtime settings, uploads, and generated images in an app data directory.
- Keep the existing local web development flow working.

This version does not include cloud sync, multi-user accounts, auto-update, code signing, notarization, mobile apps, or rewriting the backend in Rust.

## Recommended Approach

Use Tauri as the desktop shell and package the Python backend as a sidecar process.

This follows the same high-level shape as official desktop agent tools: a native client window, a local backend process, local IPC or loopback communication, and app-owned runtime state. It is also the lowest-risk path for this repository because the current FastAPI backend already owns API proxying, API key storage, upload handling, result persistence, and static frontend serving.

Rejected alternatives:

- PWA: easier to install from a browser, but it still depends on a separately running backend and does not match the requested desktop app shape.
- Electron: viable, but heavier and less aligned with the CodexMonitor reference.
- Tauri with Rust backend rewrite: cleaner long term, but too much scope for the first installable desktop version.

## Architecture

The desktop app has three layers:

- Tauri shell: owns the app window, lifecycle, app data directory, sidecar startup, readiness checks, and packaging.
- Python sidecar: runs the existing FastAPI app with `uvicorn`.
- Existing frontend: served by FastAPI and loaded by the Tauri webview from a local loopback URL.

Runtime flow:

1. User launches Image Tools desktop app.
2. Tauri resolves the platform app data directory and creates it if needed.
3. Tauri selects an available `127.0.0.1` port.
4. Tauri starts the packaged Python sidecar with environment variables for host, port, and data directory.
5. Tauri polls the backend health endpoint until it is ready.
6. Tauri opens the main window at `http://127.0.0.1:<port>/`.
7. The frontend keeps using existing same-origin routes such as `/api/settings`, `/api/generate`, `/static/*`, and `/files/*`.

This deliberately keeps the first version on HTTP loopback rather than introducing a custom JSON-RPC bridge. The boundary can be changed later without changing the image generation UI.

## Backend Changes

The FastAPI app remains the source of truth for API proxying and file persistence.

Add desktop-aware runtime configuration:

- `IMAGE_TOOLS_HOST`: host for desktop sidecar startup, default `127.0.0.1`.
- `IMAGE_TOOLS_PORT`: port for desktop sidecar startup, default `7860`.
- `IMAGE_TOOLS_DATA_DIR`: runtime data directory. If unset, keep the current repository-local `data/` behavior.

Add a small sidecar entrypoint, for example `backend/desktop_entry.py`, that reads these variables and starts `uvicorn` programmatically. The existing command remains valid:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860
```

Add a lightweight health endpoint:

- `GET /api/health`: returns an OK payload once the backend is ready.

Existing routes and frontend behavior should remain compatible.

## Tauri Project

Add a `src-tauri/` project and a root `package.json` for desktop scripts.

Expected files:

```text
package.json
src-tauri/
  Cargo.toml
  tauri.conf.json
  src/
    main.rs
  icons/
  binaries/
```

The Tauri app should:

- Configure the app name as `Image Tools`.
- Create one main window with a sensible default size for the existing terminal-style UI.
- Start the sidecar on app setup.
- Stop the sidecar when the app exits.
- Show a clear failure page or dialog if the backend cannot start.
- Limit external navigation to the app's own loopback origin.

The sidecar binary is produced from the Python backend with PyInstaller and copied into `src-tauri/binaries/` with the target-specific filename expected by Tauri.

## Build Scripts

Add scripts that make the common flows explicit:

```json
{
  "scripts": {
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build",
    "backend:bundle": "pyinstaller ..."
  }
}
```

The production build should bundle the Python sidecar before Tauri packages the app. If this becomes too platform-specific for one inline command, add a small script under `scripts/` to keep the build steps readable.

The web development path should not require Node or Rust:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860
```

## Data Storage

Desktop runtime data should live in the platform app data directory, not inside the installed application bundle.

The backend continues to use the same layout under the resolved data directory:

```text
settings.json
images/
uploads/
```

For local web development, leaving `IMAGE_TOOLS_DATA_DIR` unset preserves the current `data/` directory.

No automatic migration from repository-local `data/` is required in the first version. If users need existing settings copied into the desktop app, document the destination path and let them move files manually.

## Error Handling

Startup failures should be visible and actionable:

- If the sidecar binary is missing, show a desktop error that says the backend bundle is missing.
- If the port cannot be selected, show a startup error.
- If the sidecar starts but health checks fail, show a startup error and terminate the sidecar.
- If the backend exits while the app is running, show an error state instead of a blank window.

Backend API errors remain handled by the existing UI.

## Testing

Keep existing tests passing:

```bash
pytest -q
node --test tests/frontend_preferences.test.js
```

Add focused backend tests for:

- `IMAGE_TOOLS_DATA_DIR` overriding the default runtime data path.
- The health endpoint returning OK.
- Existing settings and image helper behavior still working with a temporary data directory.

Add desktop verification steps:

- `cargo check` inside `src-tauri`.
- `npm run desktop:dev` opens the app and starts the backend automatically.
- `npm run desktop:build` produces a Tauri bundle on the current platform.

Full installer verification can be manual for the first version because it depends on host platform packaging tools.

## Implementation Boundaries

The first implementation should avoid unrelated UI redesign. The existing Codex-style terminal UI remains the primary surface.

The desktop branch is complete when:

- The app can be launched as a Tauri desktop app.
- The backend starts automatically as a packaged sidecar.
- The app opens directly into the existing Image Tools UI.
- Settings and generated images persist under the desktop app data directory.
- Existing automated tests pass.
- Desktop build instructions are documented in `README.md`.
