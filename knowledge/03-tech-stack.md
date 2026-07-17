# Tech Stack

## Frontend

- Vanilla HTML, CSS, and JavaScript served from Tauri's bundled `frontendDist`.
- `frontend/desktop-api.js` is a browser/CommonJS IIFE and the sole frontend desktop transport adapter.
- `frontend/theme.js` applies `system`, `light`, or `dark` before first paint.
- `frontend/workbench.js` owns pure state, `frontend/ui.js` owns DOM rendering, and `frontend/app.js` owns orchestration.
- Lucide 1.24.0 and application artwork are committed local assets.

## Desktop Backend

- Tauri 2 and Rust 2021 in the same `Image Tools.exe` process as the WebView host.
- Tauri IPC commands for settings, storage, Providers, projects, sessions, generation, theme, picking, and saving.
- `rusqlite` 0.32 with bundled SQLite and backup support.
- `reqwest` 0.12 with Rustls, JSON, multipart, and streaming for Provider calls.
- Tokio for bounded asynchronous file and network work.
- `cap-std` directory capabilities for persisted media resolution.
- `tauri-plugin-dialog` for native directory and save-file dialogs.

## Data And Media

- SQLite schema v2 in `workbench.sqlite3`.
- Generated files under `images/`; staged references under `uploads/`.
- `imagetools-media` is an ID-only read protocol with platform-specific Tauri URL mapping.
- Current-origin localStorage stores serializable Composer drafts and primary theme state. The Tauri cookie mirror for the theme enum remains as a compatibility layer.

## Testing

- Node test runner and jsdom for state, adapters, renderers, and static contracts.
- Rust unit and mock-runtime IPC tests for schema, services, generation, media, and commands.
- Playwright 1.61.1 for desktop-sized behavior and visual regression using injected desktop API mocks.
- Python test files cover repository/static contracts and release configuration; Python is tooling only.
- PowerShell packages the Portable ZIP and performs the real Windows MSI/Portable lifecycle gate.

## Tooling

- npm manages exact frontend test and asset dependencies.
- mise pins Node 24.16.0, Python 3.12.13, and Rust 1.96.1.
- `mise run desktop-dev` and `mise run desktop-build` invoke Tauri directly through Linux environment wrappers where required.
- `npm run desktop:build:windows` builds the x86_64-pc-windows-msvc MSI.
- `.github/workflows/windows-release.yml` stages stable MSI/Portable names, verifies them, and uploads them to the matching GitHub Release.

## Constraints

- No frontend bundler or framework.
- No runtime CDN and no network dependency beyond the configured image Provider.
- No production web server or externally callable desktop API.
- Default/minimum Windows client sizes are `1280x860` and `960x640`.
- Windows release assets are currently unsigned and do not self-update.
