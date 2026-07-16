# Decisions

Use this file to record decisions that future agents should not reopen without a clear reason.

## Decision Log

### 2026-07-09: SQLite Workbench Metadata Store

**Decision:** Store desktop workbench metadata in `data/workbench.sqlite3` (or the desktop app data directory equivalent) through `backend.workbench_db.WorkbenchStore`.

**Context:** The desktop image workbench needs durable provider, session, generation run, and image metadata while keeping image bytes in the existing local file storage.

**Options Considered:**

- Continue JSON-only runtime state.
- Store metadata in SQLite while keeping image files on disk.

**Reasoning:** SQLite gives transactional local metadata, queryable session history, and a migration point without introducing a server database. Keeping image files on disk preserves the existing storage shape and avoids large blobs in the database.

**Consequences:** Future tickets should use `WorkbenchStore` for provider/session/history persistence and should evolve schema through migrations instead of ad hoc file writes.

### 2026-07-09: Provider Store Replaces Single Settings Source

**Decision:** Use the SQLite provider table as the active source for image API Base URL, API Key, and default model once providers exist, while keeping `/api/settings` compatible by syncing updates into the default provider.

**Context:** The existing app stored one `settings.json`; the desktop workbench needs multiple providers and fast provider/model switching without breaking the existing generation path.

**Options Considered:**

- Keep `settings.json` as the active source and add providers later.
- Make providers the active source now and migrate old `settings.json` into a default provider.

**Reasoning:** Moving the active source to providers now avoids a split-brain configuration model when T004 wires generation history to provider snapshots. Syncing `/api/settings` preserves compatibility for existing callers during the frontend transition.

**Consequences:** Future generation code should read the selected/default provider through the provider store rather than treating `settings.json` as authoritative.

### 2026-07-09: Generation Requests Are Historical Runs

**Decision:** `/api/generate` now requires a session context and writes every successful or upstream-failed generation as a `generation_runs` record with provider/model and parameter snapshots.

**Context:** The desktop workbench needs a timeline where users can inspect prior prompts, parameters, results, and failures for a creative session.

**Options Considered:**

- Keep generation stateless and add history later in the frontend.
- Write run records in the backend generation path as the source of truth.

**Reasoning:** Backend-owned history preserves failures and provider snapshots even if the frontend reloads or a request fails after dispatch. It also gives the later timeline UI one authoritative API.

**Consequences:** Future Composer and timeline work should use `session_id`, selected provider/model, and `GET /api/sessions/{id}/runs` instead of treating `/api/generate` as a stateless image-only endpoint.

### 2026-07-09: Replace Terminal Shell With Desktop Workbench Shell

**Decision:** The frontend shell is a two-column desktop workbench with a session sidebar and a current-session workspace, not a terminal-style interface.

**Context:** The product direction was clarified as Codex Desktop-style workbench feel without command-line or slash-command UI.

**Options Considered:**

- Keep the old terminal-like shell and add session history inside it.
- Replace the shell with a desktop workbench and keep Composer/generation details for later tickets.

**Reasoning:** The two-column shell matches the approved product direction and creates the UI structure needed for session list, timeline, and Composer tickets without carrying terminal metaphors forward.

**Consequences:** Future frontend work should extend `frontend/workbench.js` and the two-column shell instead of restoring command-like panels or slash-command labels.

### 2026-07-09: Composer Builds Explicit Generation Payloads

**Decision:** The desktop Composer builds `/api/generate` form fields explicitly from selected session, selected provider, model, common parameters, advanced parameters, and optional reference file.

**Context:** Generation is now session-bound and provider-aware; the frontend needs a single place to map UI controls to backend form fields.

**Options Considered:**

- Let submit handlers assemble fields ad hoc.
- Add a tested `buildGenerationFields` helper and use it from the Composer.

**Reasoning:** A tested payload helper keeps provider/model switching and parameter mapping stable while later tickets expand timeline actions and parameter reuse.

**Consequences:** Future Composer actions such as copying parameters from a run should populate the same control state consumed by `buildGenerationFields`.

### 2026-07-09: Timeline Actions Rehydrate Composer State

**Decision:** Timeline run actions use stored run snapshots to restore Composer controls and use result image URLs as reference inputs for continued generation.

**Context:** Users need to continue creative work from previous results without manually reconstructing provider, model, prompt, and parameter choices.

**Options Considered:**

- Show timeline results as passive history only.
- Make timeline cards active controls that can copy parameters and set reference images.

**Reasoning:** Active timeline cards match the desktop workbench model: history is part of the current creative workflow, not just an audit log.

**Consequences:** Backend run snapshots must keep enough UI-facing parameter data, such as ratio and resolution, for future Composer restore actions to remain reliable.

### 2026-07-10: Use Codex Desktop Windows As The UI Fidelity Baseline

**Decision:** Redesign the desktop shell to closely match the user-provided Codex Desktop Windows reference while retaining the Image Tools brand, image-creation domain language, and existing feature scope. The app follows the Windows system light/dark theme; Codex-specific features such as Scheduled, Plugins, Sites, pinning, and a standalone library are not copied.

**Context:** The existing two-column workbench satisfied the structural spec but still felt like a generic form application because of its card-heavy empty state, permanent six-column parameter row, text-button density, and browser-native dialogs.

**Options Considered:**

- Restyle the existing layout without changing its interaction model.
- Adapt Codex visual language while keeping the current form layout.
- Closely reproduce the Windows Codex shell and map image generation into its task stream and Composer model.

**Reasoning:** High fidelity requires more than palette changes. The Windows shell proportions, restrained sidebar, unframed task canvas, task lifecycle, and layered Composer must operate together. Keeping Image Tools branding and excluding unavailable Codex features avoids impersonation and fake navigation.

**Consequences:** Frontend work should follow `docs/spec/2026-07-10-codex-windows-ui.md`, remove permanent parameter forms and browser-native dialogs, preserve the existing backend/data contracts, and verify both Windows themes at desktop viewport sizes.

### 2026-07-11: Commit Generated Icons And Use Native Chinese Installer Locales

**Decision:** Treat `frontend/assets/icon.svg` as the canonical application artwork, generate and commit the complete Tauri icon set, configure NSIS with `SimpChinese`, and configure WiX/MSI with `zh-CN`.

**Context:** Windows release assets need consistent Image Tools branding and Simplified Chinese installation prompts in both supported installer formats.

**Options Considered:**

- Generate icons during every CI build.
- Commit Tauri-generated platform icons from one canonical SVG.
- Replace only the existing ICO and PNG files manually.

**Reasoning:** Committed generated assets keep local and GitHub Actions builds deterministic while preserving the SVG as the editable source. NSIS and WiX use different native locale identifiers, so each bundler must be configured explicitly.

**Consequences:** Artwork changes must start from `frontend/assets/icon.svg` and rerun `npx tauri icon`. Windows release verification must check both NSIS and MSI because one localized installer does not prove the other is localized.

### 2026-07-11: Calculate Temporary-Layer Geometry In JavaScript

**Decision:** Position Composer popovers from live trigger and layer rectangles, use a shared open/close lifecycle for temporary layers and dialogs, and express motion through CSS states with a reduced-motion fallback.

**Context:** The parameter menu used a viewport formula unrelated to its trigger, so it appeared hundreds of pixels away at common desktop widths. Direct `hidden` mutations also made interaction changes abrupt and allowed event bindings such as Provider Cancel to diverge from dialog semantics.

**Options Considered:**

- Use CSS Anchor Positioning.
- Nest popovers inside Composer and use absolute positioning.
- Calculate fixed coordinates from live DOM rectangles and clamp them to the viewport.

**Reasoning:** Live rectangle calculation works across the supported Windows WebView2 range without relying on newer CSS anchor support. A shared lifecycle keeps visibility, `aria-expanded`, animation completion, re-entry, and focus restoration synchronized.

**Consequences:** New temporary layers should use `ImageToolsUi.openLayer`, `openAnchoredLayer`, and `closeLayer` instead of mutating `hidden` directly. Browser tests must assert trigger proximity and viewport containment rather than only comparing isolated layer screenshots.

### 2026-07-12: Keep Storage Selection Outside The Movable Workbench Payload

**Decision:** Keep the movable payload (`workbench.sqlite3`, `images/`, `uploads/`, and `settings.json`) under the selected data root, while storing the active and pending data-root selection in `%LOCALAPPDATA%\com.imagetools.desktop\storage-location.json` on Windows.

**Context:** Users need control over the local location of creative history without losing sessions or allowing a running process to point SQLite and static files at different roots.

**Options Considered:**

- Store the selection inside the movable data root.
- Switch the backend root while the process is running.
- Keep a stable bootstrap file and activate a requested change on restart.

**Reasoning:** A stable bootstrap file remains discoverable after payload migration. Restart-only activation preserves the existing import-time SQLite/static-file bindings. SQLite backup plus recursive copies preserves a coherent copy of the payload while retaining the original directory for recovery.

**Consequences:** The settings API schedules a pending change only. Pending copy migrations require an empty destination, never delete their source, and custom roots that cannot be used on startup must fail explicitly instead of silently falling back to a new history store.

### 2026-07-12: Use A Dedicated Settings Work Area

**Decision:** Open settings as a dedicated work-area view with vertical navigation for Provider and local-data configuration, rather than combining both workflows in a modal dialog.

**Context:** Provider management and storage migration have different depth, risks, and confirmation paths. Combining them in one dialog made the interaction visually fragmented and constrained the storage workflow.

**Reasoning:** A persistent settings frame gives each category a stable location, leaves room for future settings categories, and follows familiar desktop software conventions without adding unrelated product features.

**Consequences:** The sidebar Provider action opens the Provider navigation item. The workspace settings action originally opened local data; as of the 2026-07-15 Appearance decision it opens Appearance instead. Returning restores focus to the original opener, while Provider Cancel resets only the current editor.

### 2026-07-12: Classify Sessions With Local Projects And Pinning

**Decision:** Add a SQLite schema v2 migration with local `projects`, nullable `sessions.project_id`, and `sessions.is_pinned`; render the sidebar as independent pinned, project, and ordinary-session groups.

**Context:** A flat chronological sidebar does not let creators keep important sessions visible or gather related work without adding unrelated Codex navigation.

**Options Considered:**

- Keep a flat list and rely only on search.
- Add frontend-only group metadata.
- Persist projects and pinning locally with a backward-compatible SQLite migration.

**Reasoning:** Durable metadata survives restart and local data-directory migration. A database migration preserves existing workbench history, while project deletion can safely unassign sessions rather than deleting creative records.

**Consequences:** Session JSON now includes `project_id` and `is_pinned`; project CRUD and pin endpoints are local API contracts. Search filters sessions before rendering but preserves their category rules. Future session organization must use these durable fields instead of browser-only state.

### 2026-07-15: Keep Theme Preference Device-Local

**Decision:** Offer exactly `system`, `light`, and `dark` appearance modes, default to `system`, and store the primary per-origin value in localStorage under `image-tools-theme`. Because Tauri release launches use random `127.0.0.1` sidecar ports, mirror the same non-sensitive enum under the same key in a host-only `Path=/`, `Max-Age=31536000`, `SameSite=Strict` cookie only when the injected Tauri global exists. Exclude both layers from workspace migration, SQLite, `settings.json`, storage bootstrap, and backend APIs. Apply the root theme before first paint and synchronize the invoking Tauri window through `set_app_theme`.

**Context:** Creative workspace data may move between local directories as one coherent set, but an installation's appearance is a device preference. Browser origins include the port, so localStorage alone cannot survive a Tauri release restart on a different random loopback port. System mode must keep following live operating-system changes, while manual light/dark modes must override them for both content and the native titlebar.

**Options Considered:**

- Add theme to `settings.json` and move it with the workspace payload.
- Store theme in SQLite or expose a backend settings endpoint.
- Keep localStorage as the ordinary web behavior and add a Tauri-only, port-independent host cookie mirror.

**Reasoning:** Provider configuration, sessions, generation history, and image files are creative workspace data that should move together. Installation appearance should stay local so moving a workspace does not unexpectedly restyle another device. A host cookie crosses loopback ports and remains available before CSS paint without introducing a backend setting; it contains only the non-sensitive enum and is intentionally visible to loopback requests in the app-local WebView profile.

**Consequences:** `frontend/theme.js` owns normalization, guarded localStorage/cookie access, and pre-paint root application. A valid Tauri cookie wins stale per-port localStorage; a missing/invalid cookie falls back to localStorage/system, while a true localStorage error still returns system with the existing error. Startup is read-only. User saves write localStorage and the requested Tauri mirror, whose failure uses the existing save error; ordinary web use never receives the cookie jar. `system` maps to no Tauri override, while `light` and `dark` map to explicit themes on the current `WebviewWindow`. Linux Chromium proves the cross-port mechanism, but Windows WebView2 must still verify two random-port release launches and all three content/titlebar modes. This focused correction stays within the existing device-local browser/WebView boundary and requires no ADR; future workspace migration and schema work must not absorb `image-tools-theme` without revisiting this decision.

### 2026-07-16: Bound And Validate Provider Image Results

**Decision:** Limit one Provider JSON response to 192 MiB and each decoded or downloaded image to 64 MiB. Accept generated files only when their bytes match PNG, JPEG, or WebP signatures; the detected bytes determine the stored extension and MIME type.

**Context:** The in-process Rust backend must not let a malformed or compromised Provider exhaust desktop memory or persist HTML and other non-image bodies as generated results.

**Reasoning:** The aggregate limit bounds JSON and base64 residency, while the per-image limit remains above the maximum normal encoded output for the supported 8.3-megapixel generation contract. Checking both declared lengths and streamed bytes prevents chunked responses from bypassing the limits. Signature-based typing avoids trusting redirect URLs or misleading response headers.

**Consequences:** Oversized Provider responses and images fail with structured safe errors. A four-image base64 response can reach the aggregate limit before every image reaches the per-image limit; this is intentional process-memory protection. URL downloads remain unauthenticated and use the final response only after the existing redirect and timeout checks.
