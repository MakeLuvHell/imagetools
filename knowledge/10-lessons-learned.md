# Lessons Learned

Use this file to feed project experience back into the knowledge base.

## Useful Patterns

- Keep optimistic generation rows keyed by both session ID and submission ID so late responses cannot mutate another task.
- Reconcile against the server run count before clearing a submitted draft; a transport failure may still have produced a durable failed run.
- Keep anchored-layer position math pure, then verify the DOM measurement path separately in a real browser.
- Use animation completion tokens so reopening a closing layer cannot be hidden by stale asynchronous cleanup.
- Keep small bootstrap configuration outside a user-movable payload; process pending migration before opening SQLite or mounting file storage.
- For low-frequency settings, keep the default surface scan-first and move focused create/edit or confirmation work into dialogs.
- Use lifecycle or request tokens for settings reloads, mutations, and native picker results so late async work cannot overwrite a newer task.
- Parse shared CSS tokens in a static contrast contract; visual snapshots can accept a subtle color regression that falls within their per-pixel threshold.
- Load a small, dependency-free theme bootstrap before the stylesheet so a persisted manual mode reaches the root before first paint.
- Give native theme synchronization a generation token so late asynchronous failures cannot overwrite the newest selection's status.
- Browser storage origins include the port. Desktop shells using random loopback ports need a stable-origin or port-independent device mirror, and their regression test must navigate two actual origins.
- Bound Provider responses while streaming, then validate decoded image signatures before publishing files; checking only after a full response is resident does not protect the desktop process.
- Separate a successful database commit from fallible DTO projection. Post-commit read failures must never trigger cleanup of files already referenced by committed rows.
- Canonicalizing a media path and reopening it later is still a replacement race. Carry a capability-contained file handle from validation through response reading.
- Tauri's `invoke_handler` is a single handler slot. Generate one combined handler for existing shell commands and new workbench commands instead of registering helpers sequentially.

## Mistakes Or Pitfalls

- Catching only upstream API errors can strand a generation run in `running`; every exception after run creation must finish it as `failed` before propagating.
- Playwright's downloaded Chromium still needs host NSS/NSPR libraries. On sudo-restricted Linux, download `libnspr4` and `libnss3` into a user-space sysroot and launch tests with its `LD_LIBRARY_PATH`.
- Viewport formulas that mirror Composer width do not locate a specific trigger; measure the trigger and clamp the resulting layer coordinates.
- A button labeled Cancel must follow dialog-level close semantics unless the UI explicitly labels it as a form reset.
- Copying a live SQLite database should use `Connection.backup()` rather than a raw filesystem copy.
- Checking only the fixed settings overlay for horizontal overflow can miss overflow inside its main scroll container or active panel.
- Testing CommonJS exports alone can miss browser bootstrap failures; execute the real IIFE in a VM with document, storage, inaccessible-storage, and no-document variants.
- A radio's `change` event does not fire when the already-selected option is activated, so selected-mode retry needs a focused click path without duplicating ordinary changes.
- Translucent focus shadows can fail WCAG non-text contrast; use an opaque indicator and test its resolved token contrast in every manual theme.
- Prefer locator-cropped snapshots only for concise, reusable sub-surfaces. Full-region snapshots should own navigation and page-shell changes, while unchanged cropped dialogs can remain byte-identical.
- A session can be deleted while an upstream generation request is awaiting. Recheck active ownership inside the completion transaction before inserting images or updating its thumbnail.
- Initialize the Rust workbench as a lifecycle: resolve storage, open the database, import legacy Provider settings, and recover interrupted runs before exposing IPC state.

## Prompts That Worked

- TBD

## Prompts To Avoid

- TBD

## Verification Notes

- `tests/test_generation_history.py` covers successful, upstream-failed, unexpected-failed, and reference-image generation history.
- Playwright uses isolated API mocks, rejects external origins, waits for fonts, and verifies light/dark layouts at `1280x860` and `960x640`.
- Playwright verifies anchored menus at both viewport sizes, after resize, and with reduced motion enabled.
- Settings Playwright coverage includes exactly 20 theme/size baselines across five states, inner-container overflow checks, and a `960x420` dialog scrolling case.
- Theme persistence coverage starts two ephemeral loopback servers and proves the second origin has null localStorage while the Tauri cookie mirror restores dark before paint.
- The Web entry on port `7860` is sufficient for local UI inspection and hot-reload checks; Tauri is only required for native shell/platform smoke testing.
- Run Playwright through `scripts/run_playwright_linux_env.py` on Linux; direct `npx playwright test` may miss the repository-managed NSS/NSPR sysroot.

## Reusable Snippets Or Commands

```bash
# TBD
```
