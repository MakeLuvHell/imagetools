# Review Notes

## Product Review

### Findings

- The approved workflow is draft-first: opening or clicking New Task must not persist an empty session.
- Running, success, and failure states belong to one chronological stream.
- Session menus, settings, image preview, and result actions must perform real operations.

### Required Changes

- Clear a draft only after the server confirms that its generation run was persisted.
- Preserve Image Tools branding and exclude Codex-only navigation and features.

## Frontend Review

### Findings

- Uploaded `File` references cannot be serialized and must remain memory-only.
- Composer menus and application dialogs need complete keyboard and focus behavior.
- Pending submissions must be keyed by both session ID and submission ID to prevent late-response corruption.

### Required Changes

- Keep pure state in `workbench.js`, DOM rendering in `ui.js`, and API/event orchestration in `app.js`.
- Bundle Lucide locally and preserve stable layout dimensions at both target viewports.

## Backend Review

### Findings

- Unexpected generation exceptions can currently strand a persisted run in `running` state.
- Existing APIs and SQLite schema are sufficient; no compound create-session-and-run endpoint is needed.

### Required Changes

- Persist failures after run creation to SQLite; keep network and pre-validation failures as local optimistic rows.
- Provider PATCH must send a complete payload, with an empty key meaning preserve the stored secret.

## Data Review

### Findings

- No SQLite migration is required for the redesign.
- Draft localStorage values need defensive parsing and version-tolerant defaults.

### Required Changes

- Playwright must use an isolated data directory, reject external network, avoid existing-server reuse, and wait for fonts.
- Linux Chromium screenshots validate layout behavior but cannot prove Windows WebView2 pixel parity.

## Testing Review

### Findings

- Add focused state and renderer tests before implementation, then cover themes, sizes, dialogs, menus, and task states with Playwright.

### Required Changes

- API keys remain in the existing local Provider store; the UI must never echo a stored key back unnecessarily.
- Preview/reference URLs must use application-owned local or API paths rather than arbitrary external navigation.

## Security Review

### Findings

- Keep the existing local Provider security model for this scope; system credential storage remains out of scope.
- Treat Windows WebView2 screenshots as final visual acceptance evidence after cross-platform automated checks pass.

### Required Changes

- TBD

## Accepted Risks

- TBD
