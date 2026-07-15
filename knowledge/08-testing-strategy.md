# Testing Strategy

## Layers

### Python API And Persistence

Run `pytest -q` or `mise run test`. Tests cover Provider/session CRUD, generation history, unexpected failure finalization, sidecar packaging, Tauri configuration, release workflows, and configurable data-directory resolution. Storage tests cover bootstrap parsing, pending activation, SQLite backup, recursive payload copying, unsafe path rejection, and restart-only API scheduling.

### Frontend State And DOM

Run `node --test tests/*.test.js`. Pure state tests cover drafts, pending-run isolation, reconciliation, payloads, and Composer rules. Theme tests exercise normalization, persistence failures, pre-paint bootstrap, and the real browser IIFE in a VM. jsdom tests cover renderers and focus behavior; static contracts cover shell structure, pre-style script order, explicit manual-theme selectors, local assets, WCAG AA muted text, and WCAG non-text focus contrast.

### Browser Interaction And Visual Regression

Run `mise run ui-test` or `npm run test:ui`. Playwright starts a non-reused server on port `8765`, uses `test-results/playwright-data`, mocks all mutable APIs and image bytes, rejects external origins, and waits for fonts.

Baselines cover:

- `1280x860` and `960x640` in light and dark themes.
- Parameter menu, Provider dialog, running, success, and failure states.
- Enter/Shift+Enter, focus restoration, menu arrows, rapid submit, retry, long CJK text, and overflow.
- Popover-to-trigger geometry before and after viewport resize at both supported viewport sizes.
- Provider Cancel close/focus behavior, storage-location loading/submission/errors/restart feedback, and the system reduced-motion preference.
- Scan-first Provider management, storage current/pending state, stale async response guards, and innermost-layer Escape ordering.
- Manual modes overriding operating-system changes, live system-mode changes, reload persistence, storage/native failures, selected-mode retry, and stale native-response ordering.
- Exactly 20 settings baselines across five states (Appearance, Provider list, Provider dialog, storage status, and storage dialog), two target sizes, and two themes. Four Appearance baselines were added, eight full-region baselines changed, and eight locator-cropped dialogs remain byte-identical.
- Horizontal containment of the settings root, main scroll area, and visible panel, plus viewport-contained dialog scrolling at `960x420`.

Regenerate intentional baselines with `npm run test:ui:update`, then inspect the PNG files before committing. Use Playwright's `--update-snapshots=all` mode when a small token change falls within the default screenshot color threshold but the stored baseline must still reflect the new value.

### Desktop And Release

On a clean worktree, run the bundle before the desktop check because the generated sidecar is intentionally ignored:

```bash
mise run desktop-prereqs
mise run backend-bundle
mise run desktop-check
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-dev
```

Verify the native titlebar, minimum size, system/light/dark changes, manual override behavior, live system restoration, menus, references, session switching, and Python/frontend hot reload. Rust tests verify system-to-`None` and light/dark mapping for `set_app_theme`. On Windows, build with `npm run desktop:build:windows` and capture all three content/titlebar modes at both target sizes.

For local visual review without launching Tauri, run the reload-enabled web entry and open `http://127.0.0.1:7860`:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860 --reload
```

## Acceptance Boundary

Linux Chromium screenshots are deterministic layout and theme-behavior regression evidence. Cargo verifies native theme API compilation and pure mode mapping, while Linux WebKitGTK is a desktop behavior smoke test. Only Windows WebView2 can provide final content/native-titlebar synchronization and pixel-fidelity evidence for system/light/dark at `1280x860` and `960x640`.
