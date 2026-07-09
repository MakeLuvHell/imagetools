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
