# Review Notes

## Product Review

### Findings

- New Task must remain unpersisted until the first valid generation submission.
- Running, successful, and failed generations belong to one chronological stream.
- Session menus, settings, image preview, and result actions must perform real operations.

### Required Changes

- Clear a draft only after the server confirms its run was persisted.
- Preserve Image Tools branding and exclude Codex-only navigation and features.

## Frontend Review

### Findings

- Uploaded `File` references remain memory-only; only serializable draft fields use localStorage.
- Menus and dialogs require complete keyboard and focus behavior.
- Pending submissions must be keyed by session ID and submission ID.

### Required Changes

- Keep pure state in `workbench.js`, rendering in `ui.js`, and orchestration in `app.js`.
- Bundle Lucide locally and preserve stable dimensions at both target viewports.

## Backend Review

### Findings

- Unexpected generation exceptions can strand persisted runs in `running` state.
- Existing APIs and SQLite schema are sufficient for this redesign.

### Required Changes

- Persist failures after run creation; keep network and pre-validation failures local.
- Provider PATCH sends a complete payload; an empty key preserves the stored secret.

## Data Review

### Findings

- No SQLite migration is required.
- Parse localStorage drafts defensively with version-tolerant defaults.

### Required Changes

- Playwright must isolate data, reject external network, avoid server reuse, and await fonts.
- Linux Chromium screenshots cannot prove Windows WebView2 pixel parity.

## Testing Review

### Findings

- Add focused state and renderer tests first, then cover themes, sizes, dialogs, menus, and task states with Playwright.

### Required Changes

- API keys stay in the existing local Provider store and are not echoed unnecessarily.
- Preview and reference URLs stay within application-owned local or API paths.

## Security Review

### Findings

- Keep the current local Provider security model; system credential storage is out of scope.
- Windows WebView2 screenshots remain the final visual acceptance evidence.

### Required Changes

- Keep Windows WebView2 screenshot comparison as a release-time platform calibration step.

## Accepted Risks

- Local Web/Chromium screenshots validate the implemented UI; Windows font and WebView rendering differences may still require release-time calibration.
