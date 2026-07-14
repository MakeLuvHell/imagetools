# Testing Strategy

## Layers

### Python API And Persistence

Run `pytest -q` or `mise run test`. Tests cover Provider/session CRUD, generation history, unexpected failure finalization, sidecar packaging, Tauri configuration, release workflows, and configurable data-directory resolution. Storage tests cover bootstrap parsing, pending activation, SQLite backup, recursive payload copying, unsafe path rejection, and restart-only API scheduling.

### Frontend State And DOM

Run `node --test tests/*.test.js`. Pure state tests cover drafts, pending-run isolation, reconciliation, payloads, and Composer rules. jsdom tests cover renderers and focus behavior; static contracts cover shell structure, local assets, and WCAG AA contrast for light-theme muted text on settings surfaces.

### Browser Interaction And Visual Regression

Run `mise run ui-test` or `npm run test:ui`. Playwright starts a non-reused server on port `8765`, uses `test-results/playwright-data`, mocks all mutable APIs and image bytes, rejects external origins, and waits for fonts.

Baselines cover:

- `1280x860` and `960x640` in light and dark themes.
- Parameter menu, Provider dialog, running, success, and failure states.
- Enter/Shift+Enter, focus restoration, menu arrows, rapid submit, retry, long CJK text, and overflow.
- Popover-to-trigger geometry before and after viewport resize at both supported viewport sizes.
- Provider Cancel close/focus behavior, storage-location loading/submission/errors/restart feedback, and the system reduced-motion preference.
- Scan-first Provider management, storage current/pending state, stale async response guards, and innermost-layer Escape ordering.
- Sixteen settings baselines: Provider list, Provider dialog, storage status, and storage dialog at both target sizes and themes.
- Horizontal containment of the settings root, main scroll area, and visible panel, plus viewport-contained dialog scrolling at `960x420`.

Regenerate intentional baselines with `npm run test:ui:update`, then inspect the PNG files before committing. Use Playwright's `--update-snapshots=all` mode when a small token change falls within the default screenshot color threshold but the stored baseline must still reflect the new value.

### Desktop And Release

Run:

```bash
mise run desktop-prereqs
mise run desktop-check
mise run desktop-dev
```

Verify the native titlebar, minimum size, system theme changes, menus, references, session switching, and Python/frontend hot reload. On Windows, build with `npm run desktop:build:windows` and capture light/dark screenshots at both target sizes.

For local visual review without launching Tauri, run the reload-enabled web entry and open `http://127.0.0.1:7860`:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860 --reload
```

## Acceptance Boundary

Linux Chromium screenshots are deterministic layout regression evidence. Linux WebKitGTK is a desktop behavior smoke test. Only Windows WebView2 screenshots are final pixel-fidelity evidence for the approved Codex Desktop Windows reference.
