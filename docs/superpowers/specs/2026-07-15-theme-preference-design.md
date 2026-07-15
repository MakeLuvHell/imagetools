# Theme Preference Design

## Goal

Add a commercial-quality appearance setting that lets users choose `跟随系统`, `浅色`, or `深色`. The choice applies immediately to both the web content and the native desktop titlebar, survives restart on the same device, and does not change any workspace-data, backend API, or SQLite contract.

This design supersedes the earlier settings-redesign restriction that excluded an appearance category. The Provider and local-data designs remain unchanged.

## Confirmed Product Decisions

- Add an `外观` category to the dedicated settings work area.
- Use three modes: system, light, and dark.
- Keep system mode as the default.
- Apply manual light/dark choices to both the web content and native Windows titlebar.
- In system mode, restore live operating-system control for both surfaces.
- Persist the preference only on the current device. It is not part of the movable `工作区数据目录`.
- Keep current-origin localStorage as the primary preference and mirror the non-sensitive enum to a host cookie only inside the Tauri WebView so release launches survive random loopback-port changes.
- Apply changes immediately without restarting the app.

## Scope

### In Scope

- A new Appearance navigation item and panel in settings.
- A three-option segmented theme control.
- Pre-paint content-theme restoration to prevent a light/dark WebView flash during startup.
- Device-local persistence with defensive fallback.
- Native Tauri window-theme synchronization.
- Browser, Node, static-contract, Rust, and visual-regression coverage.
- Knowledge and testing-document updates that record the new behavior.

### Out Of Scope

- Additional appearance controls such as accent colors, density, fonts, or motion.
- Cloud or workspace synchronization of the theme preference.
- Backend endpoints, SQLite fields, or storage-migration changes.
- Custom color schemes beyond the existing light and dark token sets.
- A quick-theme control in the main sidebar or duplicated theme controls.

## Alternatives Considered

### Selected: Dedicated Appearance Category

Add `外观` before Provider and local data in the settings navigation. This keeps interface preferences separate from API connections and workspace storage, follows familiar desktop conventions, and leaves a coherent home for future interface-only preferences without adding them now.

### Rejected: Theme Control Under Local Data

This minimizes navigation changes, but it incorrectly couples a device-local interface preference to workspace migration and storage state.

### Rejected: Sidebar-Only Quick Toggle

A main-sidebar button is faster to reach but makes the three modes difficult to communicate, adds noise to the creation workbench, and duplicates settings behavior if a full setting is added later.

## Settings Experience

The settings navigation order is:

1. `外观`
2. `Provider`
3. `本地数据`

The workspace settings button opens Appearance by default. The existing Providers entry continues to open Provider directly. Storage remains available through settings navigation.

The Appearance panel uses the existing constrained settings measure and unframed section hierarchy. It contains a single `主题` group with a stable three-segment radio control:

- `跟随系统` with a monitor icon.
- `浅色` with a sun icon.
- `深色` with a moon icon.

The control uses native radio semantics so one option is selected, Tab enters the group, and arrow keys move between options. The visual treatment follows the existing neutral selected state and uses the bundled Lucide icons. It does not add cards, decorative backgrounds, or a permanent save button.

Changing a radio applies the mode immediately. The control and page status do not shift when the active value changes.

## Theme State And Persistence

Theme values are exactly:

- `system`
- `light`
- `dark`

The preference uses the dedicated localStorage key `image-tools-theme` rather than the Composer draft payload. localStorage remains the primary, per-origin preference and the complete persistence behavior for the ordinary web entry.

Tauri release launches use random `127.0.0.1` sidecar ports, and browser origins include the port. When the injected `window.__TAURI__` global exists, the WebView therefore also mirrors the same non-sensitive `system` / `light` / `dark` enum to a host-only cookie named `image-tools-theme` with `Path=/`, `Max-Age=31536000` (one year), and `SameSite=Strict`. No `Domain` attribute is set. The normal browser/web entry receives no theme cookie jar and never reads or writes this mirror.

The cookie is not secret storage. Its enum value is intentionally visible to loopback requests made by the app-local WebView profile so it remains available when the next release launch uses a different port.

The value is device-local browser/WebView state. It is deliberately excluded from:

- `workbench.sqlite3`
- `settings.json`
- the storage-location bootstrap
- workspace payload migration

This preserves the domain meaning of `工作区数据目录`: creative data moves together, while the local application appearance remains a property of the current installation.

## Frontend Architecture

Add a small `frontend/theme.js` IIFE with independently testable functions for:

- normalizing a candidate value;
- reading the stored value safely;
- persisting a value safely;
- detecting the injected Tauri environment and reading/writing its cookie mirror;
- applying the normalized value to the document root;
- translating the preference for the native window bridge.

The script loads synchronously in the document head before `styles.css`. Its bootstrap path reads the preference and sets `document.documentElement.dataset.theme` before the stylesheet is evaluated. This prevents a visible light-to-dark or dark-to-light content flash during startup.

`frontend/app.js` owns settings navigation, binds the radio group, exposes inline status, and requests native titlebar synchronization. It does not duplicate normalization or storage rules.

## CSS Theme Resolution

The existing light tokens remain the base. Theme resolution follows these rules:

- `data-theme="light"` always uses light tokens and `color-scheme: light`.
- `data-theme="dark"` always uses dark tokens and `color-scheme: dark`.
- `data-theme="system"` uses the existing `prefers-color-scheme` media query and `color-scheme: light dark`.

Manual modes override `prefers-color-scheme`. System mode continues to react live when the operating-system theme changes. Spacing, typography, geometry, and component structure remain identical in all modes.

## Native Window Synchronization

Add one narrow Tauri command that maps:

- `system` to no explicit window theme override;
- `light` to the Tauri light theme;
- `dark` to the Tauri dark theme.

The command applies the theme to the current main window only. Clearing the override in system mode returns the native titlebar to operating-system control. No plugin, backend route, or application restart is required.

At application startup, `app.js` synchronizes the already-restored preference to the Tauri window. In the normal web development entry, the Tauri bridge is absent; content theming still works and this absence is not treated as an error.

## Data Flow

### Startup

1. `theme.js` accesses and reads current-origin localStorage. A true access or read error resolves to `system` with the existing read error, even if a cookie exists.
2. If localStorage is readable and the Tauri cookie jar contains a valid mode, the cookie wins stale per-port localStorage. A missing or invalid cookie falls back to normalized localStorage, then `system`.
3. It writes the resolved value to the root element before CSS loads. Startup does not write localStorage or the cookie.
4. CSS resolves light or dark tokens without a WebView-content first-paint flash.
5. After application orchestration starts, the radio group reflects the resolved value.
6. If running in Tauri, the same value is sent to the native window command.

### User Change

1. The user selects one radio segment.
2. The value is normalized and applied to the root immediately.
3. The preference is written to current-origin localStorage.
4. If running in Tauri, the requested value is also written to the one-year host cookie and the native titlebar receives the same mode. A normal browser performs neither Tauri operation.
5. Any localStorage, cookie-mirror, or native-sync error is reported inline without discarding the working content theme.

### System Theme Change

- In `system`, CSS and the native titlebar follow the operating system live.
- In `light` or `dark`, an operating-system theme change does not change either application surface.

## Error Handling

- Missing or invalid Tauri cookie values fall back to localStorage, whose missing or invalid values fall back silently to system mode.
- A true localStorage access or read failure falls back to system mode with the existing read error instead of accepting the cookie.
- A localStorage write failure keeps the selected mode for the current page and shows that the preference could not be saved.
- A requested Tauri cookie-mirror write or readback failure uses the same save error after the localStorage write.
- In a browser, a missing Tauri bridge is expected and produces no error.
- In the desktop app, a rejected native synchronization keeps the web content theme and shows an inline titlebar-sync error.
- Reselecting a mode retries persistence and native synchronization.

Errors use a named inline status region in the Appearance panel. They do not use Toast as the only feedback and do not navigate away from settings.

## Accessibility And Interaction

- Appearance navigation uses the existing `aria-current` contract.
- The theme control is a named radio group with three accessible labels.
- Icons are supplementary and hidden from the accessibility tree.
- Keyboard selection uses native radio behavior.
- The selected segment has sufficient light/dark contrast and a visible focus ring.
- Changing theme does not move focus or resize the control.
- Returning from settings preserves the existing opener-focus behavior.

## Testing

### Node And Static Contracts

- Normalize all three valid values.
- Fall back to system for missing, malformed, and unsupported values.
- Handle storage read/write exceptions without throwing through application startup.
- Expose a cookie jar only for the injected Tauri global; parse only the exact key and valid modes.
- Require cookie precedence, localStorage-error precedence, read-only startup, mirror failure handling, and `Path=/; Max-Age=31536000; SameSite=Strict` writes.
- Apply the expected root data attribute and color-scheme contract.
- Require `theme.js` before `styles.css` and before application orchestration.
- Require the Appearance navigation, panel, radio group, and named status region.

### Browser

- The workspace settings button opens Appearance; Providers still opens Provider.
- Selecting light or dark immediately overrides the emulated system theme.
- Reload restores the stored manual choice before the app becomes interactive.
- Navigate between two real ephemeral `127.0.0.1` origins and prove that the second origin has null localStorage while the root and bootstrap restore the first origin's dark Tauri preference before paint.
- Selecting system resumes live `prefers-color-scheme` changes.
- The radio state always matches the persisted normalized preference.
- Appearance, Provider, and storage panels remain horizontally contained at `1280x860` and `960x640`.
- Add four Appearance visual baselines for both target sizes and themes.
- Regenerate and inspect the existing sixteen settings baselines because the new navigation item changes their sidebar.

The resulting settings matrix contains twenty baselines: Appearance, Provider list, Provider dialog, storage page, and storage dialog across two sizes and two themes.

### Tauri And Release

- Rust unit tests cover system/light/dark mapping and invalid input rejection.
- Static Tauri contracts require the theme command in the generated handler.
- `desktop-check` proves the native window API compiles.
- Linux Chromium proves the cookie-based cross-port mechanism; it does not prove Windows WebView2 persistence.
- Windows WebView2 manual verification uses two release launches with different random sidecar ports and confirms persistence plus content/titlebar synchronization in all three modes at both target sizes.

## Documentation Impact

- Add this design as the authoritative exception to the older no-Appearance scope statement.
- Update `knowledge/01-project-overview.md`, `knowledge/02-requirements.md`, `knowledge/03-tech-stack.md`, `knowledge/04-task-list.md`, `knowledge/05-review-notes.md`, `knowledge/08-testing-strategy.md`, `knowledge/09-decisions.md`, and `knowledge/10-lessons-learned.md` during implementation.
- No glossary update is required because theme preference is interface language rather than a domain concept.
- No ADR is required because the Tauri cookie mirror is a focused correction within the existing device-local browser/WebView persistence boundary, not a workspace architecture change.

## Acceptance Criteria

- Settings includes a polished Appearance category with system, light, and dark segments.
- The settings button opens Appearance and the Providers shortcut still opens Provider.
- Theme changes apply immediately to content and the native titlebar.
- System mode follows operating-system changes without restart.
- Manual modes remain stable when the operating-system theme changes.
- The preference survives release restart and random loopback-port changes on the same device but does not move with workspace data.
- Startup restores the content theme before stylesheet evaluation without a visible color flash; the native titlebar synchronizes as soon as the Tauri bridge is available.
- Preference-storage and native-sync failures degrade explicitly without breaking content theming.
- All Node, Playwright, Python, and Tauri checks pass.
- Twenty settings visual baselines are current and manually inspected.
- Windows WebView2 remains the final gate for persistence across two random-port release launches, native titlebar synchronization, and pixel fidelity.
