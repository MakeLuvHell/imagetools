# Database Schema

## Authority

The authoritative implementation is `src-tauri/src/workbench/database/schema.rs`; compatibility fixtures live under `tests/fixtures/backend-contracts/`. The database file is `<工作区数据目录>/workbench.sqlite3`, SQLite foreign keys are enabled for every opened connection, and the current schema version is **3**.

v0.4.0 transactionally migrates the schema-v2 format used by v0.3.0. Rollback requires restoring the pre-upgrade schema-v2 workspace backup because v0.3.0 rejects newer schemas.

## Tables

### `schema_migrations`

| Field | Constraint |
| --- | --- |
| `version` | integer primary key |
| `applied_at` | required timestamp text |

The maximum recorded version is authoritative. A database newer than version 3 is rejected.

### `providers`

| Field | Constraint or meaning |
| --- | --- |
| `id` | integer primary key, autoincrement |
| `name` | required display name |
| `base_url` | required Provider base URL |
| `api_key` | required stored secret |
| `default_model` | required model name |
| `is_default` | required integer boolean, default `0` |
| `protocol` | required explicit protocol ID, default `openai_compatible` during migration |
| `models_refreshed_at` | nullable timestamp of the last successful model discovery |
| `created_at`, `updated_at` | required timestamp text |

Repository operations keep at most one selected default when creating, updating, or selecting a default. API responses redact `api_key`.

### `projects`

| Field | Constraint or meaning |
| --- | --- |
| `id` | integer primary key, autoincrement |
| `name` | required project name |
| `created_at`, `updated_at` | required timestamp text |
| `deleted_at` | nullable soft-delete timestamp |

Deleting a project is a transaction that clears matching `sessions.project_id` and soft-deletes the project.

### `sessions`

| Field | Constraint or meaning |
| --- | --- |
| `id` | integer primary key, autoincrement |
| `title` | required title |
| `recent_thumbnail_path` | nullable relative result path |
| `created_at`, `updated_at` | required timestamp text |
| `deleted_at` | nullable soft-delete timestamp |
| `project_id` | nullable foreign key to `projects(id)`, `ON DELETE SET NULL` |
| `is_pinned` | required integer boolean, default `0` |

Normal session deletion is a soft delete, so its historical runs remain in the database but are no longer reachable through active-session commands. If a session row is physically deleted, its generation runs cascade.

### `generation_runs`

| Field | Constraint or meaning |
| --- | --- |
| `id` | integer primary key, autoincrement |
| `session_id` | required foreign key to `sessions(id)`, `ON DELETE CASCADE` |
| `status` | required lifecycle value such as `running`, `succeeded`, or `failed` |
| `prompt` | required submitted prompt |
| `parameters_json` | required serialized generation snapshot |
| `provider_id` | nullable foreign key to `providers(id)`, `ON DELETE SET NULL` |
| `provider_name` | required historical Provider name snapshot |
| `model` | required historical model snapshot |
| `reference_image_path` | nullable staged-reference path snapshot |
| `error_message` | nullable safe failure text |
| `created_at` | required timestamp text |
| `completed_at` | nullable completion timestamp |

Provider deletion clears only `provider_id`; the Provider name, model, prompt, parameters, status, and error snapshots remain. Startup converts interrupted `running` rows to `failed`.

`reference_image_path` remains as a legacy compatibility column. New runs store ordered reference snapshots in `generation_run_references`.

### `provider_models`

| Field | Constraint or meaning |
| --- | --- |
| `provider_id` | required Provider foreign key, `ON DELETE CASCADE` |
| `model_id` | required discovered model ID |
| `discovered_at` | required discovery timestamp |

The `(provider_id, model_id)` pair is the primary key. A successful discovery transaction replaces the Provider's cache and refresh timestamp; failures preserve the previous cache.

### `generation_run_references`

| Field | Constraint or meaning |
| --- | --- |
| `generation_run_id` | required run foreign key, `ON DELETE CASCADE` |
| `position` | required zero-based order within the run |
| `local_path` | required workspace-relative reference snapshot path |
| `filename` | nullable original filename metadata |
| `mime_type` | nullable MIME metadata |

The `(generation_run_id, position)` pair is the primary key. History reads references by ascending position.

### `images`

| Field | Constraint or meaning |
| --- | --- |
| `id` | integer primary key, autoincrement |
| `generation_run_id` | required foreign key to `generation_runs(id)`, `ON DELETE CASCADE` |
| `local_path` | required workspace-relative path, currently flat `images/<filename>` |
| `filename` | required stored filename |
| `mime_type` | required stored MIME metadata |
| `width`, `height` | nullable integer dimensions |
| `created_at` | required timestamp text |

The media boundary does not trust `local_path` or `mime_type` by itself. It revalidates the path through a directory capability and derives the response MIME from file bytes.

## Migration History

### Version 1

Creates `schema_migrations`, `providers`, `sessions`, `generation_runs`, and `images`, then records migration 1.

### Version 2

Runs transactionally:

1. Create `projects` if absent.
2. Add nullable `sessions.project_id` with `ON DELETE SET NULL` when absent.
3. Add required `sessions.is_pinned` with default `0` when absent.
4. Record migration 2.

If any v2 step fails, all v2 changes roll back. Existing v1 sessions keep their IDs, receive `project_id = NULL`, and receive `is_pinned = 0`. Opening an existing v2 database is idempotent and preserves its rows.

### Version 3

Runs transactionally:

1. Add `providers.protocol` with the `openai_compatible` migration default.
2. Add nullable `providers.models_refreshed_at`.
3. Create `provider_models` and `generation_run_references`.
4. Backfill every non-null legacy `generation_runs.reference_image_path` as reference position 0.
5. Record migration 3.

Any failed step rolls back the complete v3 migration, including the version marker.

## Workspace Compatibility Boundary

- v0.4.0 opens v0.3.0 schema-v2 workspaces and migrates them to schema v3.
- Image paths remain relative `images/<filename>` entries and movable with the workspace.
- `settings.json`, `images/`, and `uploads/` remain in the same movable payload.
- `storage-location.json` remains outside the payload in the fixed configuration directory.
- Source-level fixtures prove v1-to-v2, v2-to-v3, legacy-reference backfill, and transactional rollback. The v0.4.0 Windows gate separately verifies v0.3.0 upgrade and v0.3.0 rollback using a restored pre-upgrade backup.
