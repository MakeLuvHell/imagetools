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
