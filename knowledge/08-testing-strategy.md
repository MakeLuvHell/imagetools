# Testing Strategy

## Principles

- Use focused checks while implementing one ticket, then run the complete repository gate once the related tickets are finished.
- Run the expensive Windows release gate only after all focused implementation work is complete. If that final gate exposes a defect, make and verify the focused fix before rerunning the failed final gate.
- Keep browser mocks at the `ImageToolsDesktopApi` boundary so Playwright exercises production orchestration without introducing another transport.
- Treat Linux compilation, mock runtime, and static package checks as supporting evidence, not as proof of Windows behavior.
- The real Windows MSI and Portable assets passed RB014 in workflow run `29605770705`; public release publication remains an explicit separate action.

## Layers

### Frontend State, Adapter, And DOM

Run `node --test tests/*.test.js`. Coverage includes:

- Desktop command names, camelCase top-level arguments, nested snake_case DTOs, raw reference bodies, generation metadata allowlisting, and error normalization.
- Drafts, optimistic run isolation, reconciliation, Composer rules, project/session state, and result-reference handling.
- Collapsed-project parsing/normalization, 6px drag activation, pinned drop payloads, optimistic failure messages, and prompt handoff cleanup.
- DOM renderers, dialogs, menus, focus restoration, native save, and injected desktop API orchestration.
- Theme normalization, pre-paint bootstrap, localStorage, the retained Tauri cookie compatibility mirror, native retry, and stale completion ownership.
- Static HTML/CSS/Tauri/release contracts and v0.4.0 version consistency.

### Rust Backend And Desktop Boundary

Run:

```bash
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
```

Coverage includes:

- Schema v1-to-v2 and v2-to-v3 migration, v2 preservation, legacy-reference backfill, newer-schema rejection, rollback, and foreign keys.
- Workspace bootstrap, pending migration, SQLite backup, relative paths, and startup failures.
- Provider redaction/key preservation, explicit protocols, model-cache replacement, projects, sessions, runs, recovery, and deletion races.
- OpenAI/xAI/Gemini request mapping, discovery/probe limits, safe errors, ordered staged-reference lifecycle, durable file publication, and failure convergence.
- ID-only media routing, path containment, same-handle reading, signatures, MIME, limits, CORS, and `nosniff`.
- Real mock-runtime IPC dispatch for workbench commands and combined-handler registration.
- Native theme mapping, directory picking, save-result behavior, and application startup wiring.

### Browser Interaction And Visual Regression

Run `mise run ui-test` or `npm run test:ui`. Playwright loads the bundled frontend through its test harness, injects the Desktop API mock, rejects unexpected external network, and waits for fonts.

Coverage includes:

- `1280x860` and `960x640` in light and dark themes.
- Composer menus, Provider and storage settings, generation running/success/failure states, and image actions.
- Native Settings modal geometry/focus/backdrop/nested Escape, row-targeted session commands, project persistence, Pointer Event move/cancel/failure behavior, and 500ms hover expansion.
- Immediate accepted-prompt clearing, validation placement, reference handoff, 250ms Telegram motion, reduced motion, resize/session-switch cleanup, and animation rejection fallback.
- Enter/Shift+Enter, focus restoration, rapid submit, long CJK text, resize, reduced motion, stale asynchronous responses, and overflow.
- Exactly 20 settings baselines across Appearance, Provider list, Provider dialog, storage status, and storage dialog.

The bundled Tauri application origin is stable, so localStorage is the primary persistence mechanism. Existing cookie-mirror tests remain as compatibility regression coverage; they are no longer the release architecture or a substitute for a real application restart.

### Static And Release Configuration

Python repository tests and direct parse checks cover documentation, JSON/TOML configuration, workflow structure, stable asset names, icon assets, and PowerShell verifier contracts. Python remains tooling and does not ship in the application.

Before the Windows job, run the consolidated non-Windows gate from a clean worktree:

```bash
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
mise run desktop-check
git diff --check
```

### Windows MSI And Portable Gate

Build on a Windows x64 runner:

```powershell
npm run desktop:build:windows
pwsh -NoProfile -File scripts/package_windows_portable.ps1 `
  -Executable "src-tauri\target\x86_64-pc-windows-msvc\release\Image Tools.exe" `
  -Output "release-assets\Image-Tools-v0.4.0-Windows-x64-Portable.zip"
pwsh -NoProfile -File scripts/verify_windows_single_process.ps1 `
  -Msi "release-assets\Image-Tools-v0.4.0-Windows-x64.msi" `
  -PortableZip "release-assets\Image-Tools-v0.4.0-Windows-x64-Portable.zip"
```

The verifier must prove:

- Portable contains exactly `Image Tools.exe` and the MSI administrative payload contains exactly one application executable with that name.
- MSI install and uninstall succeed and leave the expected registry state.
- Installed and Portable copies each start exactly one application process and open a native window.
- Neither copy creates an unexpected application listener.
- Closing the main window terminates the process within the gate timeout.
- Cleanup does not leave processes, installations, or test data behind.

The v0.4.0 gate also requires a manual or scripted Windows WebView2 smoke test for protocol-aware Provider settings, generation, ordered references, ID-only result display, native save, all three theme modes, and both target sizes. A copied v0.3.0 schema-v2 workspace must migrate under v0.4.0; rollback v0.3.0 must open a restored pre-upgrade backup, never the migrated schema-v3 workspace.

## Acceptance Boundary

Node, Rust, Playwright, parsers, and Linux desktop checks establish source-level behavior and regression coverage. Only the Windows x64 workflow against the final MSI and Portable bytes establishes release payload, install/uninstall, process lifecycle, listener, WebView2 protocol, and upgrade/rollback acceptance.
