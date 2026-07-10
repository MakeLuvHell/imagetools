# Desktop Source Hot Reload Design

## Context

The desktop development command currently bundles the Python backend before every run. Tauri then waits for `http://127.0.0.1:7860`, but the bundled sidecar is only started after the Rust application launches and uses a different random port. This creates a startup dependency cycle and prevents source-level backend reloads.

The no-sudo Linux sysroot bootstrap also needs to recover from two partial-state cases discovered during local startup: `apt-get --print-uris` can fail when a non-root user cannot update APT state, and an interrupted bootstrap can leave valid pkg-config metadata alongside broken library symlinks.

## Decision

Use separate development and release backend paths.

- `tauri dev` merges a development-only config overlay.
- The overlay starts a repository-owned development launcher. The launcher reserves `127.0.0.1:7860` before it starts Uvicorn with `--reload`, and records a launch token that the debug application checks before opening its window.
- The overlay removes `bundle.externalBin`, so development does not require or copy a PyInstaller sidecar.
- Debug Rust builds connect to port 7860, verify the matching launch token through `/api/health`, and wait before creating the window.
- Release Rust builds keep the existing behavior: choose a random loopback port, start the bundled sidecar with an application-data directory, wait for health, and stop it when the window closes.
- The normal build commands continue bundling the sidecar before `tauri build`.

This provides Python source reloads inside the native Tauri window. The frontend remains plain static HTML, CSS, and JavaScript, so frontend files are served immediately but require refreshing the application window. Rust changes continue to use Tauri's development watcher and restart the native process.

## Alternatives

1. Rebundle the sidecar on every development run. This most closely matches the installer, but startup is slow and backend changes cannot reload.
2. Run Uvicorn manually in a second terminal. This works but preserves the circular default command and makes process cleanup the developer's responsibility.
3. Use a development config overlay and debug/release Rust split. This is the selected approach because one command owns both processes while release behavior stays unchanged.

## Data And Failure Handling

Development Uvicorn uses the repository's existing `data/` directory, matching current Web development. Release builds continue setting `IMAGE_TOOLS_DATA_DIR` to the platform application-data directory.

The launcher fails immediately if port 7860 is unavailable, rather than allowing the desktop process to attach to an unrelated healthy server. The debug Rust setup rejects a server whose launch token does not match the active launcher. When Python reloads, the existing WebView remains open; requests may briefly fail until Uvicorn is ready again.

`desktop:dev` is explicitly a debug-profile workflow. The package command rejects forwarded `--release` arguments because release builds require the bundled sidecar removed by the development overlay.

The sysroot bootstrap falls back to `apt download` when URI discovery either returns no URIs or exits unsuccessfully. A sysroot with broken development-library symlinks is considered incomplete and is bootstrapped again automatically. The runner validates the result after bootstrapping and reports the unresolved target paths instead of deferring a linker failure.

## Verification

- Python tests cover the development config, package command, APT fallback, and partial sysroot detection.
- Rust unit tests continue covering backend health-response parsing.
- `cargo check` validates both Tauri configuration and Rust integration.
- An actual `mise run desktop-dev` launch must show Uvicorn reload mode, compile without a bundled development sidecar, create the native process, and return a healthy API response.
- The full Python and frontend test suites must pass.
