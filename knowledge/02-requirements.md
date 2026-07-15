# Requirements

## Confirmed Requirements

- Keep Tauri 2, FastAPI, SQLite, and vanilla HTML/CSS/JavaScript.
- Use the native Windows titlebar and provide `system`, `light`, and `dark` appearance modes that synchronize web content and the titlebar immediately.
- Default to `system`, keep following live operating-system theme changes in that mode, and let manual light/dark modes override operating-system changes.
- Persist the selected mode primarily under `image-tools-theme` in current-origin localStorage. In Tauri only, mirror the non-sensitive enum under the same key in a host-only `Path=/`, `Max-Age=31536000`, `SameSite=Strict` cookie so random `127.0.0.1` sidecar ports share the device preference.
- Enable the cookie mirror only when the injected Tauri global exists; the normal browser/web entry uses localStorage alone. Keep both layers outside workspace migration, backend APIs, SQLite, storage bootstrap, and `settings.json`.
- Keep Image Tools branding and image-creation language.
- Use a restrained sidebar, unframed task canvas, chronological task stream, and bottom layered Composer.
- Keep Lucide and brand assets local with no runtime CDN dependency.
- Start on an unpersisted new-task draft; derive the session title from the first valid prompt.
- Isolate drafts and optimistic runs by session and submission ID.
- Manage Providers and sessions with accessible in-app dialogs.
- Keep reference uploads memory-only; persist result-reference URLs and serializable fields in localStorage.
- Persist every run created by the backend as succeeded or failed, including unexpected exceptions.

## Open Questions

- No implementation blocker. Final color and font-rendering calibration is performed against Windows WebView2 screenshots.

## User Flows

### New Task And Generation

1. Open the app on an empty new-task canvas.
2. Enter a prompt and optionally choose a Provider, model, reference, and parameters.
3. Submit with Enter; the app creates one session, inserts an optimistic run, and calls generation.
4. Reconcile the optimistic row with persisted success/failure history, or keep a local failure if no server run exists.

### Continue From History

1. Select a session from the sidebar.
2. Inspect its chronological prompts, parameters, errors, and images.
3. Preview/download/copy an image, set it as a reference, or copy parameters.
4. Refine and submit from the same Composer.

### Provider Management

1. Open Providers from the sidebar or settings action.
2. Create, edit, delete, or select the default Provider.
3. Leave API Key empty during edit to preserve the stored secret.

### Appearance

1. Open the settings gear to the first Appearance category; keep the sidebar Provider shortcut opening Provider directly.
2. Select follow-system, light, or dark and see the content and native titlebar update immediately.
3. In system mode, continue following live operating-system changes; in a manual mode, keep the chosen appearance across operating-system changes and app reloads on the same device.

## Data Requirements

- SQLite stores Providers, sessions, generation runs, and image metadata.
- Image and uploaded reference bytes remain on local disk.
- Provider API keys are never returned to or persisted by frontend drafts.
- Generation parameter, Provider, and model snapshots remain historical.
- The appearance preference is device-local browser/WebView state, not movable workspace data; current-origin localStorage is primary and Tauri adds only the one-year host cookie mirror. The cookie enum is non-sensitive and intentionally visible to loopback requests in the app-local WebView profile.

## Edge Cases

- Malformed localStorage drafts fall back to defaults.
- Rapid double submit creates one session and one generation.
- A retry after a pre-server network failure reuses the already-created session.
- Late responses cannot remove pending runs belonging to another session.
- Reference mode forces one result and disables incompatible transparent background options.
- Empty Provider state opens setup without persisting a session.
- At Tauri startup, a valid cookie wins stale per-port localStorage before paint; a missing or invalid cookie falls back to localStorage, then `system`. A true localStorage access/read error still falls back to `system` with the existing error, and startup writes neither layer.
- User changes write localStorage and, when requested by Tauri, the cookie mirror. A localStorage or mirror failure keeps the selected content theme active and reports the existing save error.
- Native titlebar synchronization failure does not roll back content theming; reselecting the active mode retries failed persistence/native work, and stale native completions cannot replace newer status.

## Non-Functional Requirements

- Performance: stable dimensions prevent layout shifts during loading and image decode.
- Security: secrets remain backend-only; external network is rejected in UI tests.
- Accessibility: named icon controls, focus rings, trapped dialogs, keyboard menus, Escape restoration, and Enter/Shift+Enter semantics.
- Internationalization: Chinese product copy with Segoe UI and CJK system fallbacks.
- Offline behavior: shell, icons, history, and settings work locally; generation requires the configured Provider endpoint.

## Priority

- Must have: Windows shell, drafts, Provider CRUD, Composer, task stream, persistence, themes, accessibility, and verification.
- Should have: final Windows screenshot calibration and release artifact smoke testing.
- Could have: masks, multiple references, streaming partial images, and system credential storage.
- Not now: cloud accounts, sync, Codex-only features, standalone library, and browser productization.
