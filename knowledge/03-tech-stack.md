# Tech Stack

## Frontend

- Framework: vanilla HTML and JavaScript modules exposed through browser/CommonJS IIFEs.
- Styling: one static CSS token system with `prefers-color-scheme` light/dark themes.
- State management: pure helpers in `frontend/workbench.js`; orchestration in `frontend/app.js`.
- Rendering: DOM-only functions in `frontend/ui.js`.
- Icons: pinned Lucide 1.24.0 UMD bundle copied into `frontend/vendor/`.
- Routing: one desktop workbench surface; no client router.

## Backend

- Runtime: Python 3.12 and FastAPI/Uvicorn.
- API style: local JSON and multipart REST endpoints under `/api/`.
- Desktop integration: PyInstaller sidecar launched and health-checked by Tauri.
- Authentication: Provider bearer keys stored locally; no user authentication.

## Data

- Database: SQLite through `WorkbenchStore`.
- Cache: browser localStorage for serializable Composer drafts only.
- File storage: local application data directories for generated images and references.

## Testing

- Unit tests: Node test runner for preferences, pure state, renderer, and static contracts.
- DOM tests: jsdom 29.1.1.
- API/integration tests: pytest and FastAPI TestClient.
- End-to-end/visual tests: Playwright 1.61.1 with Chromium, isolated data, mocked APIs, and screenshot baselines.
- Desktop tests: Cargo check, Tauri development smoke test, and Windows build/screenshots.

## Tooling

- Package manager: npm with exact frontend test/icon dependency versions.
- Tool versions: mise pins Node 24.16.0, Python 3.12.13, and Rust 1.96.1.
- Formatting/checks: `git diff --check`, Node syntax checks, pytest, and Cargo check.
- Build command: `mise run desktop-build` or `npm run desktop:build:windows`.
- Dev command: `mise run desktop-dev`.

## Constraints

- No frontend bundler or framework.
- No icon CDN or required runtime internet beyond the configured image Provider.
- Default/minimum Windows client sizes are `1280x860` and `960x640`.
- Linux Chromium/WebKitGTK verifies behavior but cannot establish Windows pixel parity.
