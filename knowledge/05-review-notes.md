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

## Codex Desktop Settings Redesign Review

### Product And Architecture

- Provider management is scan-first; add and edit use focused dialogs, while default and named deletion live in the row menu.
- Provider, sessions, generation history, reference images, and generated images remain one `工作区数据目录` with the existing restart-only migration semantics.
- The redesign changes frontend structure and behavior only. Backend APIs, SQLite schema, storage bootstrap, and relative payload paths remain unchanged.

### Frontend And Accessibility

- The settings shell uses neutral navigation, a constrained reading width, unframed sections, and responsive geometry at `1280x860` and `960x640`.
- Dialog and menu Escape handling closes the innermost layer first and restores focus to the concrete trigger.
- Light-theme muted text uses `#656a72`, providing `5.443:1` contrast on white and `4.695:1` on the hover surface.

### Testing Review

- Provider and storage request lifecycles ignore stale reloads, submissions, and directory-picker results after a newer task or closed dialog takes ownership.
- Browser assertions cover the settings root, main scroll container, visible panel, target-size dialog containment, and actual vertical scrolling at `960x420`.
- Sixteen settings baselines cover Provider, Provider dialog, storage status, and storage dialog across both target sizes and themes. All were manually inspected after the contrast update.
- Final specification and quality reviews found no remaining implementation issue.
- Release verification passed with 101 Python tests, 58 Node tests, 40 Playwright tests, and the Tauri Rust check. A fresh worktree must run `mise run backend-bundle` before `mise run desktop-check` because the generated sidecar is intentionally ignored.

## Three-Mode Appearance Review

### Product And Data Boundary

- A dedicated first-position Appearance category was selected over embedding theme controls in Provider or local-data settings. The settings gear opens Appearance, while the sidebar Provider shortcut still opens Provider directly.
- The exact modes are `system`, `light`, and `dark`, with `system` as the default. The preference is device-local under `image-tools-theme`; no backend API, SQLite schema, `settings.json`, storage bootstrap, or workspace-data migration change is involved.

### Frontend And Native Resilience

- `frontend/theme.js` restores the root mode before stylesheet evaluation so stored manual modes do not wait for application orchestration to paint correctly. System mode retains live operating-system control; manual modes override it.
- Content theming remains active when persistence or native titlebar synchronization fails, and the Appearance panel reports the failure inline. Activating the already-selected radio retries both operations.
- A generation counter gives the newest native synchronization ownership, preventing a late failure or completion from replacing newer status. The Tauri command targets the invoking `WebviewWindow`, maps system to no override, and maps light/dark to explicit native themes.

### Accessibility And Verification

- The segmented-control focus indicator uses an opaque accent outline with `3.598:1` light-theme and `5.802:1` dark-theme non-text contrast against the subtle surface, exceeding the WCAG `3:1` threshold.
- The settings matrix now contains exactly 20 baselines across Appearance, Provider, Provider dialog, storage status, and storage dialog at two sizes and two themes. Four Appearance baselines were added, eight full-region settings baselines changed, and the eight locator-cropped dialog baselines remain byte-identical.
- Linux Chromium establishes deterministic behavior and layout, and Cargo establishes native API compilation and mapping. Windows WebView2 remains the final content/native-titlebar synchronization and pixel-fidelity gate for all three modes at `1280x860` and `960x640`.
