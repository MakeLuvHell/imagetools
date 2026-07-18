# Lessons Learned

## Useful Patterns

- Keep optimistic generation rows keyed by both session ID and submission ID so late responses cannot mutate another task.
- Reconcile against durable run history before clearing a submitted draft; an IPC failure may still have produced a failed run.
- Keep anchored-layer position math pure, then verify the DOM measurement path separately in a real browser.
- Use lifecycle tokens for settings reloads, mutations, native picker results, animation cleanup, and theme synchronization.
- Keep small bootstrap configuration outside a user-movable payload; process pending migration before opening SQLite or file storage.
- Copy live SQLite data with `Connection.backup()` and retain the source workspace for recovery.
- Load a small dependency-free theme bootstrap before the stylesheet. On the current bundled origin, localStorage is the primary stable store; the Tauri cookie mirror remains compatibility behavior, not architecture.
- Initialize the Rust workbench as one lifecycle: resolve storage, open schema v2, import legacy Provider settings, recover interrupted runs, then expose IPC state.
- Put all Tauri commands in one combined generated handler because the builder has one invoke-handler slot.
- Route frontend data operations through one injectable adapter and allowlist generation fields.
- Treat `CommandError` as a serialized trust contract: copy only `code`, `message`, and optional `diagnostic`, and replace every other rejection shape.
- Bound Provider responses while streaming, validate decoded image signatures, and derive stored type from bytes.
- Separate a committed database transaction from fallible DTO projection; never remove files referenced by committed rows.
- Recheck session ownership inside the completion transaction after asynchronous Provider work.
- Carry a capability-contained media file handle from path validation through bounded reading to avoid reopen races.
- Build the Portable ZIP from the exact release executable and inspect the archive after creation; stable names alone do not prove payload contents.
- Test application shutdown by closing the native main window and waiting for process exit. Killing a launcher does not prove lifecycle correctness.
- In automated Windows lifecycle checks, wait until the native main-window handle is stable before sending the close request; the first nonzero handle can race Tauri/WebView initialization.
- A PyInstaller one-file sidecar can replace its launcher PID with workers in a temporary extraction directory. Legacy cleanup must re-enumerate all test-owned backend processes instead of trusting the initially observed PID or install path.
- Capture the full Composer submission before clearing visible input; reference UI should clear at backend handoff, not at generation completion.
- Delay pointer capture until movement exceeds the drag threshold. Capturing on `pointerdown` retargets the normal click away from the session button.
- Treat transient UI as disposable: one cleanup path should handle completion, rejection, resize, session switch, rerender, Escape, pointer cancel, and outside drop.
- Reload authoritative sessions after a drag mutation fails instead of preserving speculative grouping.

## Mistakes Or Pitfalls

- Catching only Provider errors can strand a run in `running`; every failure after run creation must converge to `failed`.
- A button labeled Cancel must follow dialog-level close semantics unless explicitly described as a form reset.
- Translucent focus shadows can fail WCAG non-text contrast; use an opaque indicator and test resolved colors.
- Testing CommonJS exports alone can miss browser bootstrap failures; execute the real IIFE in a VM and in the bundled page contract.
- A radio `change` event does not fire when the selected option is activated, so retry needs a focused click path.
- Static package inspection cannot prove Windows install/uninstall, WebView2 protocol dispatch, listener state, or shutdown.
- A schema fixture proving v2 preservation cannot by itself prove user upgrade and rollback; exercise a copied real workspace with both release versions.
- Soft-deleting sessions preserves rows; command services must still reject operations against inactive sessions and late generation completion.
- Stored media metadata is untrusted input. Validate the relative path, opened file, size, signature, and response headers at the read boundary.
- A local optimistic failure must populate the same `error_message` field consumed by the timeline renderer; a private `error` field alone degrades to a generic message.
- Native dialog element screenshots are cropped to dialog bounds, so visual review must pair them with viewport geometry assertions to prove centering and backdrop behavior.

## Verification Notes

- Frontend tests should inject `ImageToolsDesktopApi` rather than emulate a network API.
- Rust mock-runtime tests prove command serialization and dispatch but not Windows custom-protocol URL mapping.
- Playwright proves layout and orchestration at `1280x860` and `960x640`; Windows WebView2 remains the platform visual and native integration gate.
- `scripts/verify_windows_single_process.ps1` is the release authority for MSI/Portable payload, installation, runtime process count, listener checks, window close, exit, uninstall, and cleanup.
- RB014 recorded v0.2.3 to v0.3.0 upgrade and v0.3.0 to v0.2.3 rollback evidence in workflow run `29605770705`.
- Responsive Settings, Composer, and session-tree changes passed the same non-publishing Windows payload, lifecycle, upgrade, and rollback gate in workflow run `29651658576`; artifact `8431714800` contains the validated MSI and single-executable Portable assets.

## Reusable Commands

```bash
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
git diff --check
```
