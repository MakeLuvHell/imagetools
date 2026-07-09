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
