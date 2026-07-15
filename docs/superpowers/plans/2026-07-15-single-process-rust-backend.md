# Single-Process Rust Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the packaged Python/FastAPI sidecar with an in-process Rust backend exposed through Tauri IPC while preserving existing schema v1/v2 workspaces and shipping one `Image Tools.exe` application payload.

**Architecture:** Implement focused Rust services beside the active Python backend and prove both against shared fixtures. Keep the production frontend on Python until database, storage, Provider, workbench, generation, and media parity gates pass; then switch the frontend once to a centralized Tauri IPC adapter and remove the Python sidecar. The release window loads bundled Tauri assets and exposes no UI loopback server.

**Tech Stack:** Rust 1.96.1, Tauri 2.11.5, rusqlite bundled SQLite, reqwest/rustls, Tokio, vanilla JavaScript IIFEs, Node test runner, pytest parity fixtures, Playwright 1.61.1, WiX/MSI, Windows WebView2.

---

## Execution Preconditions

- Do not start Task 1 until `feat/theme-preference` is merged into `main`.
- At execution time, use `superpowers:using-git-worktrees` to create a fresh
  worktree from the updated `main`.
- Preserve the merged `set_app_theme` command and all theme tests while changing
  Tauri composition.
- Keep Python as the active production backend through Task 8. Tasks 1-8 add
  parallel Rust behavior and tests only.
- Do not update the knowledge files listed by the theme plan until its merge is
  present in the migration worktree.
- Commit after every task only when its focused checks pass.

## File Map

### Rust Backend

- Create `src-tauri/src/workbench/mod.rs`: initialized application state and
  module exports.
- Create `src-tauri/src/workbench/error.rs`: serializable command-safe errors.
- Create `src-tauri/src/workbench/models.rs`: internal records, input payloads,
  and public DTOs.
- Create `src-tauri/src/workbench/database/mod.rs`: connection ownership,
  initialization, transactions, and repository composition.
- Create `src-tauri/src/workbench/database/schema.rs`: exact schema v1/v2 SQL,
  version checks, and v1-to-v2 migration.
- Create `src-tauri/src/workbench/database/providers.rs`: Provider repository.
- Create `src-tauri/src/workbench/database/history.rs`: projects, sessions,
  generation runs, and image repository.
- Create `src-tauri/src/workbench/storage.rs`: bootstrap state, validation,
  pending data-root activation, SQLite backup, and payload copy.
- Create `src-tauri/src/workbench/providers.rs`: Provider validation, legacy
  settings migration, secret retention, and public redaction.
- Create `src-tauri/src/workbench/sessions.rs`: project/session/run services and
  interrupted-run recovery.
- Create `src-tauri/src/workbench/generation/mod.rs`: generation orchestration.
- Create `src-tauri/src/workbench/generation/client.rs`: OpenAI-compatible
  Provider requests and response parsing.
- Create `src-tauri/src/workbench/generation/files.rs`: bounded reference
  staging, atomic result writes, URL downloads, and base64 decoding.
- Create `src-tauri/src/workbench/media.rs`: ID-based read-only media resolver
  and Tauri custom protocol response.
- Create `src-tauri/src/workbench/commands.rs`: thin Tauri command adapters.
- Modify `src-tauri/src/main.rs`: include parallel Rust modules first; perform
  the application cutover only in Task 10.
- Modify `src-tauri/Cargo.toml`: add focused Rust dependencies and remove the
  shell plugin only during the final cutover.

### Shared Contract Fixtures

- Create `tests/fixtures/backend-contracts/schema-v1.sql`: deterministic v1
  database fixture.
- Create `tests/fixtures/backend-contracts/schema-v2.sql`: deterministic v2
  database fixture with Provider, project, session, run, and image rows.
- Create `tests/fixtures/backend-contracts/image-success.json`: upstream base64
  response fixture.
- Create `tests/fixtures/backend-contracts/image-url-success.json`: upstream URL
  response fixture.
- Create `tests/fixtures/backend-contracts/public-contract.json`: normalized
  DTO expectations shared by Python and Rust tests.
- Create `tests/test_backend_contract_fixtures.py`: prove the current Python
  implementation satisfies the shared fixtures.

### Frontend And Desktop Tests

- Create `frontend/desktop-api.js`: one UI-facing transport adapter.
- Create `tests/frontend_desktop_api.test.js`: adapter mapping, raw reference
  upload, and structured error tests.
- Modify `frontend/index.html`: load the adapter before `app.js`.
- Modify `frontend/app.js`: replace REST calls with adapter methods in one
  cutover task.
- Modify `tests/frontend_ui_contract.test.js`: require the adapter and forbid
  release REST usage after cutover.
- Modify `tests/ui/helpers.js`: install a desktop API mock instead of route-level
  API mocks.
- Modify `tests/ui/codex_windows.spec.js`: preserve all interaction and visual
  assertions against the adapter mock.
- Create `scripts/serve_frontend_tests.js`: Node-only static server used by
  Playwright after the Python web app is removed.
- Modify `playwright.config.js`: serve bundled frontend assets from the static
  test server rather than Uvicorn.
- Modify `tests/test_tauri_config.py`: verify bundled assets, IPC commands, and
  absence of sidecar configuration.
- Modify `tests/test_windows_release_workflow.py`: verify MSI and portable ZIP
  release assets.

### Build And Release

- Create `scripts/package_windows_portable.ps1`: create a ZIP containing only
  `Image Tools.exe`.
- Create `scripts/verify_windows_single_process.ps1`: inspect the portable ZIP,
  installed payload, running process names, listening ports, and shutdown.
- Modify `src-tauri/tauri.conf.json`: remove `externalBin`, use bundled assets,
  keep MSI, and remove NSIS.
- Delete `src-tauri/tauri.dev.conf.json` after the IPC cutover.
- Modify `package.json`: remove backend bundling from desktop scripts.
- Modify `.mise.toml`: make Rust/Node the release verification path.
- Modify `.github/workflows/windows-release.yml`: upload MSI and portable ZIP.
- Delete `scripts/bundle_backend.py`, `scripts/run_desktop_dev_backend.py`, and
  `scripts/run_desktop_dev.js` only after the final cutover passes.
- Delete `backend/`, Python backend tests, and Python runtime dependencies only
  after Rust parity and desktop cutover pass.

## Task 1: Establish Rust Backend Types And Error Contracts

**Files:**
- Create: `src-tauri/src/workbench/mod.rs`
- Create: `src-tauri/src/workbench/error.rs`
- Create: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add a failing structured-error unit test**

Create `src-tauri/src/workbench/error.rs` with the test first:

```rust
#[cfg(test)]
mod tests {
    use super::CommandError;

    #[test]
    fn serializes_a_stable_safe_error_contract() {
        let error = CommandError::new("provider.invalid", "请检查 Provider 配置。");
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "provider.invalid",
                "message": "请检查 Provider 配置。",
                "diagnostic": null
            })
        );
    }
}
```

- [ ] **Step 2: Register the empty module and verify RED**

Create `src-tauri/src/workbench/mod.rs`:

```rust
pub mod error;
pub mod models;
```

Add `mod workbench;` near the top of `src-tauri/src/main.rs`, create an empty
`src-tauri/src/workbench/models.rs`, then run:

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::error::tests::serializes_a_stable_safe_error_contract
```

Expected: FAIL because `CommandError` does not exist.

- [ ] **Step 3: Add the minimal error and DTO types**

Implement `CommandError` exactly as:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CommandError {
    pub code: String,
    pub message: String,
    pub diagnostic: Option<String>,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            diagnostic: None,
        }
    }

    pub fn with_diagnostic(mut self, diagnostic: impl Into<String>) -> Self {
        self.diagnostic = Some(diagnostic.into());
        self
    }
}
```

In `models.rs`, define serde-enabled input/public types with the current public
field names:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderInput {
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub default_model: String,
    #[serde(default)]
    pub is_default: bool,
}

fn default_model() -> String {
    "gpt-image-2".to_string()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProviderDto {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub api_key_set: bool,
    pub default_model: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SettingsInput {
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SettingsDto {
    pub base_url: String,
    pub api_key: String,
    pub api_key_set: bool,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionCreateInput {
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectInput {
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionUpdateInput {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_patch")]
    pub project_id: Patch<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Patch<T> {
    #[default]
    Missing,
    Value(Option<T>),
}

fn deserialize_patch<'de, D, T>(deserializer: D) -> Result<Patch<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Patch::Value)
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageLocationInput {
    pub data_dir: String,
    #[serde(default)]
    pub migrate_existing: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StorageLocationDto {
    pub active_data_dir: String,
    pub default_data_dir: String,
    pub pending_data_dir: Option<String>,
    pub is_custom: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restart_required: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectDto {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SessionDto {
    pub id: i64,
    pub title: String,
    pub recent_thumbnail_path: Option<String>,
    pub project_id: Option<i64>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ImageDto {
    pub id: i64,
    pub local_path: String,
    pub url: String,
    pub filename: String,
    pub mime_type: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GenerationRunDto {
    pub id: i64,
    pub session_id: i64,
    pub status: String,
    pub prompt: String,
    pub parameters: serde_json::Value,
    pub provider_id: Option<i64>,
    pub provider_name: String,
    pub model: String,
    pub reference_image_path: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub images: Vec<ImageDto>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateInput {
    pub session_id: i64,
    pub provider_id: Option<i64>,
    pub prompt: String,
    pub model: String,
    pub width: i64,
    pub height: i64,
    pub ratio: String,
    pub resolution: String,
    pub count: i64,
    pub quality: String,
    pub output_format: String,
    pub output_compression: i64,
    pub background: String,
    pub moderation: String,
    pub reference_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GenerateResultDto {
    pub kind: String,
    pub model: String,
    pub size: String,
    pub images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StagedReferenceDto {
    pub token: String,
}
```

Keep secret-bearing `ProviderRecord` internal to the database/provider modules;
only `ProviderDto`, whose `api_key` value is always the empty string, crosses
IPC. Repository record structs mirror the columns in `backend/workbench_db.py`
and never derive `Serialize`. Generate timestamps with
`Utc::now().to_rfc3339_opts(SecondsFormat::Micros, false)` so new Rust rows keep
Python's `+00:00` microsecond representation. Add tests for the missing/null
`project_id` distinction and timestamp format.

- [ ] **Step 4: Add dependencies without changing the active runtime**

Add these dependencies to `src-tauri/Cargo.toml`:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
rusqlite = { version = "0.32", features = ["bundled", "backup"] }
reqwest = { version = "0.12", default-features = false, features = ["json", "multipart", "rustls-tls", "stream"] }
tokio = { version = "1", features = ["fs", "io-util", "macros", "rt-multi-thread", "sync", "time"] }
uuid = { version = "1", features = ["v4"] }
base64 = "0.22"
mime_guess = "2"
futures-util = "0.3"
atomic-write-file = "0.3"
percent-encoding = "2"
```

Add `tempfile = "3"` and
`tauri = { version = "2", features = ["test"] }` under
`[dev-dependencies]`; the latter exposes `tauri::test::mock_builder` only for
tests. Do not remove `tauri-plugin-shell` yet.

- [ ] **Step 5: Run focused and existing desktop checks**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
```

Expected: all commands exit 0; the desktop still uses the Python backend.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/src/workbench
git commit -m "feat(rust-backend): establish backend contracts"
```

## Task 2: Implement Schema V1/V2 Compatibility

**Files:**
- Create: `src-tauri/src/workbench/database/mod.rs`
- Create: `src-tauri/src/workbench/database/schema.rs`
- Create: `tests/fixtures/backend-contracts/schema-v1.sql`
- Create: `tests/fixtures/backend-contracts/schema-v2.sql`
- Modify: `src-tauri/src/workbench/mod.rs`

- [ ] **Step 1: Add failing schema fixture tests**

In `database/schema.rs`, add tests that load the shared SQL fixtures:

```rust
#[cfg(test)]
mod tests {
    use super::{initialize_schema, schema_version};
    use rusqlite::Connection;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../tests/fixtures/backend-contracts")
                .join(name),
        )
        .unwrap()
    }

    #[test]
    fn upgrades_v1_without_losing_the_existing_session() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(&fixture("schema-v1.sql")).unwrap();
        initialize_schema(&mut connection).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 2);
        let row: (String, Option<i64>, i64) = connection
            .query_row(
                "SELECT title, project_id, is_pinned FROM sessions WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, ("旧会话".to_string(), None, 0));
    }

    #[test]
    fn rejects_a_schema_newer_than_version_two() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);\
                 INSERT INTO schema_migrations VALUES (3, '2026-07-15T00:00:00+00:00');",
            )
            .unwrap();
        let error = initialize_schema(&mut connection).unwrap_err();
        assert_eq!(error.code, "database.version_too_new");
    }

    #[test]
    fn enables_foreign_keys_and_rejects_a_corrupt_database() {
        let temporary = tempfile::tempdir().unwrap();
        let database_path = temporary.path().join("workbench.sqlite3");
        std::fs::write(&database_path, b"not sqlite").unwrap();

        let error = crate::workbench::database::Database::open(&database_path)
            .err()
            .unwrap();
        assert_eq!(error.code, "database.invalid");
    }
}
```

Create `schema-v1.sql` with the exact v1 tables from
`WorkbenchStore.initialize`, one session row with ID 1, and migration version 1.
Create `schema-v2.sql` with the exact current tables and deterministic rows for
one Provider, project, pinned session, successful run, and image. Add a fresh
database test that asserts version 2 and `PRAGMA foreign_keys = 1`; do not create
an empty replacement after the corrupt-file test fails.

- [ ] **Step 2: Run the schema tests to verify RED**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::database::schema::tests
```

Expected: FAIL because schema initialization functions do not exist.

- [ ] **Step 3: Implement connection ownership and schema initialization**

In `database/mod.rs`, implement:

```rust
use std::{path::Path, sync::Mutex};

use rusqlite::Connection;

use crate::workbench::error::CommandError;

pub mod history;
pub mod providers;
pub mod schema;

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, CommandError> {
        let mut connection = Connection::open(path).map_err(|error| {
            CommandError::new("database.open_failed", "无法打开工作区数据库。")
                .with_diagnostic(error.to_string())
        })?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(schema::database_error)?;
        schema::initialize_schema(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub(crate) fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let mut connection = self.connection.lock().map_err(|_| {
            CommandError::new("database.lock_failed", "工作区数据库暂时不可用。")
        })?;
        operation(&mut connection)
    }
}
```

In `schema.rs`, copy the v1 table definitions and v2 migration SQL exactly from
`backend/workbench_db.py`. Before any migration, read `MAX(version)` when the
migration table exists and return `database.version_too_new` for values above 2.
Create new databases at v2, and perform v1 migration inside one transaction.
Map SQLite `NotADatabase`/`DatabaseCorrupt` failures to `database.invalid` and
all other query failures to `database.query_failed`; diagnostics may include
the SQLite error text but never the database path.

- [ ] **Step 4: Verify schema parity from both languages**

Add a pytest in `tests/test_backend_contract_fixtures.py` that executes both SQL
fixtures with Python `sqlite3`, runs `WorkbenchStore.initialize()`, and asserts
the same title, project assignment, and pin state as the Rust test.

Run:

```bash
pytest -q tests/test_backend_contract_fixtures.py tests/test_workbench_db.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::database::schema::tests
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workbench/database src-tauri/src/workbench/mod.rs tests/fixtures/backend-contracts tests/test_backend_contract_fixtures.py
git commit -m "feat(rust-backend): preserve workspace schema"
```

## Task 3: Port Storage-Location Bootstrap And Copy Migration

**Files:**
- Create: `src-tauri/src/workbench/storage.rs`
- Modify: `src-tauri/src/workbench/mod.rs`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `tests/test_backend_contract_fixtures.py`

- [ ] **Step 1: Add failing Rust storage tests**

Add tests for default resolution, scheduled no-copy activation, copy migration,
nested-directory rejection, config-directory rejection, nonempty migration
destinations, an active path occupied by a file, and malformed bootstrap JSON.
The core copy test must assert all payload classes:

```rust
#[test]
fn pending_copy_migrates_database_images_uploads_and_settings() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    let target = temporary.path().join("target");
    let config = temporary.path().join("config");
    create_source_payload(&source);

    schedule_storage_location(&source, &config, &target, true).unwrap();
    let location = resolve_storage_location(&source, &config).unwrap();

    assert_eq!(location.active_data_dir, target.canonicalize().unwrap());
    assert_eq!(std::fs::read(target.join("images/result.png")).unwrap(), b"image");
    assert_eq!(std::fs::read(target.join("uploads/reference.png")).unwrap(), b"upload");
    assert!(source.join("workbench.sqlite3").exists());
}
```

- [ ] **Step 2: Run storage tests to verify RED**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::storage::tests
```

Expected: FAIL because storage functions do not exist.

- [ ] **Step 3: Implement the bootstrap contract**

Implement the exact JSON shape already used by Python:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
struct BootstrapState {
    #[serde(default)]
    active_data_dir: Option<std::path::PathBuf>,
    #[serde(default)]
    pending: Option<PendingLocation>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct PendingLocation {
    data_dir: std::path::PathBuf,
    source_data_dir: std::path::PathBuf,
    migrate_existing: bool,
}
```

Implement bootstrap replacement with `atomic_write_file::AtomicWriteFile` and
call `commit()` only after the complete JSON payload is written and flushed;
this preserves replace-existing atomicity on Windows as well as Linux.
Validate absolute paths, mutual containment, config containment, writability,
and empty targets for copy migrations. Use `rusqlite::backup::Backup` for
`workbench.sqlite3`, recursive copies for `images/` and `uploads/`, and
`std::fs::copy` for `settings.json` contents and permissions. Never remove the
source.

- [ ] **Step 4: Run Rust and Python storage parity checks**

```bash
pytest -q tests/test_storage_location.py tests/test_storage_location_api.py tests/test_backend_contract_fixtures.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::storage::tests
```

Expected: all tests pass with the same bootstrap keys and failure classes.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workbench/storage.rs src-tauri/src/workbench/mod.rs src-tauri/src/workbench/models.rs tests/test_backend_contract_fixtures.py
git commit -m "feat(rust-backend): port storage location bootstrap"
```

## Task 4: Port Provider And Legacy Settings Behavior

**Files:**
- Create: `src-tauri/src/workbench/database/providers.rs`
- Create: `src-tauri/src/workbench/providers.rs`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/workbench/mod.rs`
- Create: `tests/fixtures/backend-contracts/public-contract.json`
- Modify: `tests/test_backend_contract_fixtures.py`

- [ ] **Step 1: Add failing Provider repository and service tests**

Cover normalization, the CHSHAPI migration, secret redaction, blank-key update,
single-default behavior, delete behavior, and one-time `settings.json` import:

```rust
#[test]
fn blank_key_update_preserves_the_stored_secret() {
    let fixture = ProviderFixture::new();
    let created = fixture.service.create(ProviderInput {
        name: "Primary".into(),
        base_url: "https://api.example.com/v1/".into(),
        api_key: "sk-primary".into(),
        default_model: "gpt-image-2".into(),
        is_default: true,
    }).unwrap();

    let public = fixture.service.update(created.id, ProviderInput {
        name: "Primary Updated".into(),
        base_url: "https://api.updated.example/v1".into(),
        api_key: String::new(),
        default_model: "gpt-image-2-preview".into(),
        is_default: true,
    }).unwrap();

    assert!(public.api_key.is_empty());
    assert!(public.api_key_set);
    assert_eq!(fixture.repository.secret(created.id).unwrap(), "sk-primary");
}
```

- [ ] **Step 2: Verify RED**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::providers::tests
```

Expected: FAIL because Provider repositories and services do not exist.

- [ ] **Step 3: Implement Provider repository transactions**

Implement the same SQL ordering and default updates as
`WorkbenchStore.create_provider`, `update_provider`, `list_providers`, and
`delete_provider`. When setting a default, clear all other default flags in the
same transaction. Return `provider.not_found` when the requested row is absent.

Implement these validation functions with current behavior:

```rust
pub fn normalize_base_url(value: &str) -> String {
    let mut clean = value.trim().to_string();
    if clean.is_empty() {
        return clean;
    }
    if !clean.starts_with("http://") && !clean.starts_with("https://") {
        clean = format!("http://{clean}");
    }
    while clean.ends_with('/') {
        clean.pop();
    }
    if clean == "https://img-api.chshapi.org" {
        "https://img-api.chshapi.org/v1".to_string()
    } else {
        clean
    }
}
```

Require nonempty name, normalized base URL, effective API key, and default model.
Map records to `ProviderDto` with `api_key: ""` and `api_key_set` only.

- [ ] **Step 4: Add shared public-contract assertions**

Put deterministic Provider input and expected redacted JSON into
`public-contract.json`. Assert it from both
`tests/test_backend_contract_fixtures.py` and Rust service tests.

Run:

```bash
pytest -q tests/test_provider_api.py tests/test_backend_contract_fixtures.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::providers::tests
```

Expected: both implementations match the same public contract.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workbench tests/fixtures/backend-contracts/public-contract.json tests/test_backend_contract_fixtures.py
git commit -m "feat(rust-backend): port Provider behavior"
```

## Task 5: Port Projects, Sessions, Runs, And Images

**Files:**
- Create: `src-tauri/src/workbench/database/history.rs`
- Create: `src-tauri/src/workbench/sessions.rs`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/workbench/mod.rs`
- Modify: `tests/fixtures/backend-contracts/public-contract.json`
- Modify: `tests/test_backend_contract_fixtures.py`

- [ ] **Step 1: Add failing history service tests**

Cover project soft deletion and session unassignment, session soft deletion,
pinning, recent thumbnail updates, run ordering, image ordering, parameter JSON,
and missing IDs. Include interrupted-run recovery:

```rust
#[test]
fn startup_recovery_finishes_only_running_rows() {
    let fixture = HistoryFixture::new();
    let running = fixture.create_run("running");
    let succeeded = fixture.create_run("succeeded");

    let recovered = fixture.service.recover_interrupted_runs().unwrap();

    assert_eq!(recovered, 1);
    let running = fixture.repository.get_run(running.id).unwrap();
    let succeeded = fixture.repository.get_run(succeeded.id).unwrap();
    assert_eq!(running.status, "failed");
    assert_eq!(running.error_message.as_deref(), Some("应用在生成完成前退出。"));
    assert!(running.completed_at.is_some());
    assert_eq!(succeeded.status, "succeeded");
}
```

- [ ] **Step 2: Verify RED**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::sessions::tests
```

Expected: FAIL because history repositories and services do not exist.

- [ ] **Step 3: Implement exact repository behavior**

Port SQL from `backend/workbench_db.py` without changing column names or order:

- list Providers by `id ASC`;
- list projects and sessions by `updated_at DESC, id DESC`;
- list generation runs by `created_at ASC, id ASC`;
- list images by ascending ID;
- exclude `deleted_at IS NOT NULL` projects and sessions;
- delete projects by setting `deleted_at` and unassigning their sessions;
- delete sessions by setting `deleted_at` and relying on current query behavior;
- preserve nullable `project_id` and boolean `is_pinned` integer storage;
- serialize `parameters_json` with `serde_json` and reject malformed stored JSON
  as `database.invalid_parameters`.

Use one transaction when finishing a successful run, inserting its images, and
updating the session thumbnail. Use one update for interrupted-run recovery:

```sql
UPDATE generation_runs
SET status = 'failed',
    error_message = '应用在生成完成前退出。',
    completed_at = ?
WHERE status = 'running'
```

- [ ] **Step 4: Run history parity suites**

```bash
pytest -q tests/test_workbench_db.py tests/test_session_api.py tests/test_generation_history.py tests/test_backend_contract_fixtures.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::sessions::tests
```

Expected: all tests pass and normalized DTO fixtures match.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workbench tests/fixtures/backend-contracts/public-contract.json tests/test_backend_contract_fixtures.py
git commit -m "feat(rust-backend): port workbench history"
```

## Task 6: Port Generation Validation And Provider HTTP Client

**Files:**
- Create: `src-tauri/src/workbench/generation/mod.rs`
- Create: `src-tauri/src/workbench/generation/client.rs`
- Create: `tests/fixtures/backend-contracts/image-success.json`
- Create: `tests/fixtures/backend-contracts/image-url-success.json`
- Modify: `src-tauri/src/workbench/mod.rs`
- Modify: `src-tauri/src/workbench/models.rs`

- [ ] **Step 1: Add failing pure validation tests**

Cover valid dimensions, multiples of 16, pixel bounds, 3:1 ratio, 3840 edge,
count clamping, supported options, gpt-image-2 transparency, URL joining, and
payload omission for `auto` values:

```rust
#[test]
fn validates_the_existing_1536_by_864_contract() {
    assert_eq!(validate_image_size(1536, 864).unwrap(), "1536x864");
    assert_eq!(normalize_count(0), 1);
    assert_eq!(normalize_count(9), 4);
}

#[test]
fn avoids_a_duplicate_v1_segment() {
    assert_eq!(
        join_api_url("https://api.example.com/v1", "/v1/images/generations"),
        "https://api.example.com/v1/images/generations"
    );
}
```

- [ ] **Step 2: Verify validation tests fail**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::generation::tests
```

Expected: FAIL because validation functions do not exist.

- [ ] **Step 3: Implement pure request normalization**

Use the exact constants from Python:

```rust
const MIN_IMAGE_PIXELS: u64 = 655_360;
const MAX_IMAGE_PIXELS: u64 = 8_294_400;
const MAX_IMAGE_EDGE: u32 = 3840;
```

Return the same Chinese validation messages. Build generation JSON with
`prompt`, `model`, `size`, and `n`; omit quality/background/moderation only when
`auto`; include compression only for JPEG/WebP. Build edit multipart with one
`image` part and the same conditional fields.

- [ ] **Step 4: Add failing HTTP fixture tests**

Use a local test server bound to `127.0.0.1:0` inside Rust tests. Assert Bearer
authorization, request paths, JSON/multipart fields, 10-second connect timeout,
300-second read timeout, redirect following, non-JSON rejection, HTML error-page
classification, timeout mapping, and secret-free errors.

The success fixtures must contain one deterministic 1x1 PNG as base64 and one
URL result. No test may contact the public internet.

- [ ] **Step 5: Implement `ProviderClient` and verify**

Implement `ProviderClient::generate` and `ProviderClient::edit` with
`reqwest::Client`. Map errors to these codes:

```text
provider.missing_url
provider.missing_key
provider.timeout
provider.connect_failed
provider.http_error
provider.non_json
provider.invalid_json
provider.invalid_response
```

Run:

```bash
pytest -q tests/test_backend_helpers.py tests/test_generation_history.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::generation
```

Expected: Python and Rust validation/transport fixtures pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/workbench/generation src-tauri/src/workbench/models.rs src-tauri/src/workbench/mod.rs tests/fixtures/backend-contracts
git commit -m "feat(rust-backend): port image Provider client"
```

## Task 7: Implement Reference Staging And Durable Generation

**Files:**
- Create: `src-tauri/src/workbench/generation/files.rs`
- Modify: `src-tauri/src/workbench/generation/mod.rs`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/workbench/sessions.rs`

- [ ] **Step 1: Add failing raw-reference staging tests**

Define a 25 MiB limit and accept PNG, JPEG, and WebP signatures. Tests must
cover valid staging, oversized input, MIME/signature mismatch, unique names,
token lookup, single consumption, and stale staging cleanup:

```rust
#[test]
fn stages_and_consumes_raw_png_bytes_once() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ReferenceStore::new(temporary.path().join("uploads"));
    let staged = store.stage("reference.png", "image/png", PNG_1X1).unwrap();

    let consumed = store.consume(&staged.token).unwrap();
    assert_eq!(std::fs::read(&consumed.path).unwrap(), PNG_1X1);
    assert_eq!(store.consume(&staged.token).unwrap_err().code, "reference.not_found");
}
```

- [ ] **Step 2: Verify RED**

```bash
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::generation::files::tests
```

Expected: FAIL because `ReferenceStore` does not exist.

- [ ] **Step 3: Implement staging and atomic result files**

Store staged files under `uploads/.staging/<uuid>`. Keep metadata in memory as
`token -> { path, original_name, mime_type, created_at }`. Write with
`create_new`, flush, and rename. Consumption removes the token and moves the file
to `uploads/ref_<timestamp>_<uuid>.<ext>`. Startup removes stale `.staging`
contents older than 24 hours.

For results, write decoded/downloaded bytes to `images/.<uuid>.tmp`, call
`sync_all`, and rename to `images/image_<timestamp>_<index>.<ext>`. Delete
temporary files on every error. If the database completion transaction fails,
also delete the newly renamed result files so no unreferenced final files are
left behind.

- [ ] **Step 4: Add failing orchestration tests**

Use a fake Provider client and temporary database. Cover text generation,
reference edit, Provider snapshot, parameter snapshot, result rows, thumbnail,
upstream failure, unexpected disk failure, and no stranded `running` rows.
No `MutexGuard<Connection>` may live across an `.await`; create/finish database
operations must each acquire and release their own short lock around the
upstream request.

- [ ] **Step 5: Implement `GenerationService::generate`**

The method signature is:

```rust
pub async fn generate(
    &self,
    input: GenerateInput,
) -> Result<GenerateResultDto, CommandError>
```

Resolve the requested or default Provider, validate the session and parameters,
consume an optional staged-reference token, create the `running` row before the
upstream call, then finish it on every post-creation path. Commit images and the
session thumbnail coherently only after all result files are durable.

- [ ] **Step 6: Run generation parity suites**

```bash
pytest -q tests/test_generation_history.py tests/test_backend_contract_fixtures.py
python scripts/run_tauri_linux_env.py cargo test \
  --manifest-path src-tauri/Cargo.toml \
  workbench::generation
```

Expected: all success, reference, upstream failure, and unexpected failure cases
pass with no `running` rows left.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/workbench/generation src-tauri/src/workbench/models.rs src-tauri/src/workbench/sessions.rs
git commit -m "feat(rust-backend): persist image generation"
```

## Task 8: Add Media Resolution And Tauri Commands

**Files:**
- Create: `src-tauri/src/workbench/media.rs`
- Create: `src-tauri/src/workbench/commands.rs`
- Modify: `src-tauri/src/workbench/mod.rs`

- [ ] **Step 1: Add failing media security tests**

Cover numeric IDs, missing image rows, non-GET methods, traversal, symlink escape,
files outside the active image root, missing files, MIME response headers, and
the CORS header required when an existing result is fetched back as a reference:

```rust
#[test]
fn rejects_a_database_path_that_escapes_the_image_root() {
    let fixture = MediaFixture::new();
    let image_id = fixture.insert_image("../settings.json");
    let error = fixture.resolver.resolve(image_id).unwrap_err();
    assert_eq!(error.code, "media.path_outside_workspace");
}

#[test]
fn resolves_the_existing_data_root_relative_image_path() {
    let fixture = MediaFixture::new();
    let image_id = fixture.insert_image("images/result.png");
    assert_eq!(
        fixture.resolver.resolve(image_id).unwrap().path,
        fixture.data_root.join("images/result.png").canonicalize().unwrap(),
    );
}
```

- [ ] **Step 2: Verify RED and implement the resolver**

Run the failing test, then implement canonical path validation. The resolver
returns a `ResolvedMedia { path, mime_type }`; it never accepts a path from the
URI. The protocol accepts only `/image/<numeric-id>` and `GET`. Successful
responses include `Access-Control-Allow-Origin: *`; all other methods return
405 without reading a file.

Stored `local_path` values are relative to the active data root and already
start with `images/`. Resolve with `data_root.join(local_path)`, then canonicalize
both that target and `data_root/images` and prove the target is contained by the
latter. Never join a stored `images/...` value directly onto the image root.

Construct DTO URLs with one tested helper: Windows uses
`http://imagetools-media.localhost/image/<id>`, while Linux/macOS use
`imagetools-media://localhost/image/<id>`. This matches Tauri 2's documented
custom-protocol origin mapping.

- [ ] **Step 3: Add failing command contract tests**

Use `tauri::test::mock_builder` and `tauri::test::assert_ipc_response` for both
JSON and raw command requests; `tauri::ipc::Request` cannot be constructed
directly because its fields are private. Assert `stage_reference_image` reads
`tauri::ipc::InvokeBody::Raw`, filename/MIME headers, and rejects JSON bodies.

Use this command shape:

```rust
#[tauri::command]
pub fn stage_reference_image(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<StagedReferenceDto, CommandError> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(CommandError::new(
            "reference.raw_body_required",
            "参考图必须使用二进制传输。",
        ));
    };
    let encoded_name = required_header(request.headers(), "x-image-name")?;
    let name = percent_decode_str(encoded_name).decode_utf8().map_err(|_| {
        CommandError::new("reference.invalid_name", "参考图文件名无效。")
    })?;
    let mime = required_header(request.headers(), "content-type")?;
    state.references.stage(&name, mime, bytes)
}
```

- [ ] **Step 4: Implement all thin command adapters**

Implement commands for settings/storage, Providers, projects, sessions,
pinning, runs, raw reference staging, and generation. Use these stable command
names in the adapter tests: `get_settings`, `update_settings`,
`get_storage_location`, `update_storage_location`, `list_providers`,
`create_provider`, `get_provider`, `update_provider`, `delete_provider`,
`set_default_provider`, `list_projects`, `create_project`, `update_project`,
`delete_project`, `list_sessions`, `create_session`, `get_session`,
`update_session`, `delete_session`, `set_session_pinned`, `list_session_runs`,
`stage_reference_image`, and `generate_image`. Command functions may parse
Tauri arguments and delegate, but must not contain SQL or upstream HTTP logic.

Test them with `tauri::test::mock_builder`, but do not register them on the real
application builder in this task. The existing Python-backed window and sidecar
remain the only active runtime until Task 10.

- [ ] **Step 5: Test the media protocol builder without switching the window**

Expose a builder helper for `imagetools-media` and test it with Tauri's mock
runtime. It calls the tested resolver and returns 404 for missing IDs, 403 for
containment failures, 405 for non-GET methods, and the stored image MIME type
for success. Task 10 is the only task that installs this helper on the real
application builder.

- [ ] **Step 6: Run focused checks**

```bash
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
pytest -q tests/test_backend_contract_fixtures.py
mise run desktop-check
```

Expected: all checks pass; the production window still uses Python.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/workbench
git commit -m "feat(rust-backend): expose tested desktop commands"
```

## Task 9: Build The Frontend Desktop API Adapter

**Files:**
- Create: `frontend/desktop-api.js`
- Create: `tests/frontend_desktop_api.test.js`
- Modify: `frontend/index.html`
- Modify: `tests/frontend_ui_contract.test.js`

- [ ] **Step 1: Write failing adapter tests**

Test command names, camelCase arguments, structured errors, browser test
injection, and raw reference upload options:

```javascript
test("stageReference sends raw bytes and encoded metadata headers", async () => {
  const calls = [];
  const api = desktopApi.createDesktopApi(async (...args) => {
    calls.push(args);
    return { token: "ref-token" };
  });
  const bytes = new Uint8Array([137, 80, 78, 71]);

  await api.stageReference({ name: "参考图.png", type: "image/png", bytes });

  assert.deepEqual(calls, [[
    "stage_reference_image",
    bytes,
    { headers: { "x-image-name": "%E5%8F%82%E8%80%83%E5%9B%BE.png", "content-type": "image/png" } },
  ]]);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/frontend_desktop_api.test.js
```

Expected: FAIL because `frontend/desktop-api.js` does not exist.

- [ ] **Step 3: Implement the adapter IIFE**

Expose `window.ImageToolsDesktopApi` and CommonJS exports. Use a factory that
accepts an invoke function so tests never need a real Tauri global. Normalize
rejections into `DesktopApiError` while preserving `code`, `message`, and safe
`diagnostic` fields.

Implement one method for every active UI operation. `stageReference` must call
the three-argument Tauri invoke form shown in the test and percent-encode the
UTF-8 filename before putting it in an HTTP-compatible header. Top-level Tauri
arguments use camelCase (`providerId`, `sessionId`, `isPinned`); nested input
objects retain the existing snake_case DTO fields consumed and produced by the
frontend. `generate` sends only JSON metadata plus the returned reference
token.

- [ ] **Step 4: Load the adapter before orchestration**

Add `/static/desktop-api.js` before `/static/app.js` in the current Python-served
HTML. Update the static source-order test. The adapter must support an injected
browser mock and must not make startup fail when `window.__TAURI__` is absent in
Playwright.

- [ ] **Step 5: Verify the additive adapter**

```bash
node --test tests/frontend_desktop_api.test.js tests/frontend_ui_contract.test.js
pytest -q
```

Expected: all tests pass; `app.js` still uses REST at this point.

- [ ] **Step 6: Commit**

```bash
git add frontend/desktop-api.js frontend/index.html tests/frontend_desktop_api.test.js tests/frontend_ui_contract.test.js
git commit -m "feat(frontend): add desktop backend adapter"
```

## Task 10: Perform The One-Time IPC Cutover

**Files:**
- Modify: `frontend/app.js`
- Modify: `frontend/index.html`
- Modify: `tests/frontend_ui_contract.test.js`
- Modify: `tests/ui/helpers.js`
- Modify: `tests/ui/codex_windows.spec.js`
- Create: `scripts/serve_frontend_tests.js`
- Modify: `playwright.config.js`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`
- Delete: `src-tauri/tauri.dev.conf.json`

- [ ] **Step 1: Convert Playwright mocks before production orchestration**

Replace route interception helpers with an injected
`window.__IMAGE_TOOLS_DESKTOP_API_MOCK__` implementing the desktop adapter
methods. Keep all current Provider, storage, session, running, success, and
failure fixtures. Run Playwright and verify RED because `app.js` still calls
`fetch`.

Create `scripts/serve_frontend_tests.js` with Node's `http`, `fs`, and `path`
modules. It serves only files under `frontend/`, maps `/` to `index.html`,
rejects decoded paths outside that root, and binds to `127.0.0.1:8765`. Point
Playwright's `webServer.command` to this script and readiness URL to `/`; replace
the old `/api/health` UI assertion with assertions for the document title and
locally served Lucide asset. This server is test-only and is never bundled.

- [ ] **Step 2: Replace every `/api/*` call in `app.js`**

Use `window.ImageToolsDesktopApi.current()` once and replace operations method by
method. Preserve pending submission keys, stale-response guards, focus behavior,
and exact UI error messages. For references, call `file.arrayBuffer()`, stage a
`Uint8Array`, then submit the returned token.

After conversion, this command must print no matches:

```bash
rg -n 'fetch\(|/api/|/files/' frontend/app.js
```

- [ ] **Step 3: Add a static no-REST regression contract**

In `tests/frontend_ui_contract.test.js`, assert `frontend/app.js` contains no
`fetch(`, `/api/`, or `/files/`, requires `ImageToolsDesktopApi`, and all result
URLs use the media DTO returned by Rust. Also assert `frontend/index.html`
contains no `/static/` paths after the bundled-asset cutover.

- [ ] **Step 4: Switch Tauri to bundled application assets**

In `tauri.conf.json`, remove `devUrl`, leave `frontendDist: "../frontend"`, and
remove `externalBin`. Define the main window in config or build it with
`WebviewUrl::App("index.html".into())`; do not use `WebviewUrl::External`.
Change `/static/styles.css`, `/static/*.js`, and `/static/assets/*` references in
`frontend/index.html` to root-bundled `/styles.css`, `/*.js`, and `/assets/*`
paths. The Python static mount no longer exists after this task.

Add a pure `is_allowed_navigation` helper and attach it with
`WebviewWindowBuilder::on_navigation`. Allow only the bundled Tauri application
origin (`tauri://localhost` on Linux/macOS and `http://tauri.localhost` on
Windows); reject `http`, `https`, and file navigation to all other hosts. Unit
tests must prove an external Provider URL cannot become a top-level navigation.

In `main.rs`, initialize storage and the database before window creation, call
interrupted-run recovery, manage `WorkbenchState`, register the production
commands and media protocol, and preserve the merged theme command. Remove
sidecar startup/wait/kill only after the new state initializes successfully.

Resolve the default data and configuration directories from
`app.path().app_data_dir()` and `app.path().app_local_data_dir()`. Preserve
`IMAGE_TOOLS_DATA_DIR` and `IMAGE_TOOLS_CONFIG_DIR` as explicit absolute-path
overrides for tests and diagnostics; add Rust tests proving invalid relative
overrides fail before any workspace is opened. The Windows smoke script relies
on these overrides to avoid touching a developer's real workspace.

- [ ] **Step 5: Preserve visible startup failure behavior**

If storage/database initialization fails, use the dialog plugin to show the
safe `CommandError.message`, then return the setup error and exit. Add a Rust
test for mapping an initialization error to the displayed safe message.

- [ ] **Step 6: Run the complete behavior cutover gate**

```bash
node --test tests/*.test.js
python scripts/run_playwright_linux_env.py npx playwright test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
pytest -q
```

Expected: all suites pass; Python tests remain as parity coverage, but the Tauri
window and frontend no longer call Python.

- [ ] **Step 7: Commit**

```bash
git add frontend src-tauri tests scripts/serve_frontend_tests.js playwright.config.js
git commit -m "feat(desktop): switch workbench to Rust IPC"
```

## Task 11: Remove Python Sidecar And Produce Single-Executable Artifacts

**Files:**
- Delete: `backend/`
- Delete: `scripts/bundle_backend.py`
- Delete: `scripts/run_desktop_dev_backend.py`
- Delete: `scripts/run_desktop_dev.js`
- Delete: Python backend/API tests superseded by Rust tests
- Modify: `requirements.txt`
- Modify: `requirements-dev.txt`
- Modify: `package.json`
- Modify: `.mise.toml`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `tests/test_tauri_config.py`
- Modify: `tests/test_windows_release_workflow.py`
- Create: `scripts/package_windows_portable.ps1`
- Create: `scripts/verify_windows_single_process.ps1`
- Modify: `.github/workflows/windows-release.yml`

- [ ] **Step 1: Write failing packaging contracts**

Update static tests to require:

```python
assert "externalBin" not in tauri_config()["bundle"]
assert tauri_config()["bundle"]["targets"] == ["deb", "rpm"]
assert "nsis" not in tauri_config()["bundle"]["windows"]
assert "tauri-plugin-shell" not in Path("src-tauri/Cargo.toml").read_text()
assert "backend:bundle" not in json.loads(Path("package.json").read_text())["scripts"]
assert "--bundles msi" in json.loads(Path("package.json").read_text())["scripts"]["desktop:build:windows"]
assert not Path("scripts/bundle_backend.py").exists()
```

Update workflow tests to require MSI and portable ZIP paths and reject NSIS
paths. Keep the generic config's existing `deb`/`rpm` targets so Linux builds
remain possible; the Windows script's `--bundles msi` is the platform-specific
override. Run the focused tests and verify RED.

- [ ] **Step 2: Remove production Python and shell dependencies**

Delete sidecar sources/scripts and their superseded tests. Remove FastAPI,
Uvicorn, HTTPX, multipart, and PyInstaller dependencies when no remaining tool
uses them. Keep Python only for repository tooling that still requires it, such
as the Linux Tauri/Playwright environment wrappers.

Remove `tauri-plugin-shell` from Cargo and builder composition. Update scripts:

```json
{
  "desktop:dev": "tauri dev",
  "desktop:build": "tauri build",
  "desktop:build:windows": "tauri build --target x86_64-pc-windows-msvc --bundles msi"
}
```

- [ ] **Step 3: Add deterministic portable packaging**

Implement `package_windows_portable.ps1` to accept `-Executable` and `-Output`,
fail unless the input filename is `Image Tools.exe`, create a temporary empty
directory, copy only that executable, compress it, and verify the ZIP entry list
equals `@('Image Tools.exe')` before moving it to the requested output.

- [ ] **Step 4: Update the Windows workflow**

Build only MSI, run the portable packaging script against the release
executable, upload both artifacts, and remove all NSIS collection logic. Give
assets stable names:

```text
Image-Tools-<tag>-Windows-x64.msi
Image-Tools-<tag>-Windows-x64-Portable.zip
```

- [ ] **Step 5: Add Windows single-process verification**

Implement `verify_windows_single_process.ps1` with required `-Msi` and
`-PortableZip` parameters to:

1. Assert the portable ZIP contains exactly `Image Tools.exe`.
2. Administratively extract the MSI to a temporary directory and assert its
   Image Tools application payload contains exactly one `.exe`, named
   `Image Tools.exe`.
3. Install the MSI silently with `msiexec /i ... /qn /norestart`, fail on any
   exit code other than 0 or 3010, and locate the installed executable from the
   uninstall registry entry rather than assuming a Program Files path.
4. For both the installed MSI executable and portable executable, set distinct
   temporary `IMAGE_TOOLS_DATA_DIR` and `IMAGE_TOOLS_CONFIG_DIR` values before
   launch.
5. Wait for the main window and assert exactly one process whose executable
   path ends in `Image Tools.exe` (PowerShell's `ProcessName` omits `.exe`).
6. Assert no `imagetools-backend` process exists and that the Image Tools PID
   owns no listening TCP socket.
7. Close the main window, assert the PID exits within 10 seconds, and fail if
   any process still has the same executable path.
8. Uninstall with `msiexec /x ... /qn /norestart`, assert the installed
   executable is gone, and clean extracted payloads and both isolated workspace
   roots in `finally`.

WebView2 system processes are allowed; they are not Image Tools payloads.

- [ ] **Step 6: Run removal and packaging checks**

```bash
pytest -q
node --test tests/*.test.js
python scripts/run_playwright_linux_env.py npx playwright test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
git diff --check
```

Expected: all commands pass, `backend/` is absent, and
`rg -n 'FastAPI|Uvicorn|PyInstaller|externalBin|imagetools-backend' src-tauri package.json .mise.toml .github/workflows`
finds no active production references. Test scripts may still contain the
literal `imagetools-backend` only to assert that such a process is absent.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build(desktop): remove Python sidecar runtime"
```

## Task 12: Update Knowledge And Run Release-Grade Verification

**Files:**
- Modify: `README.md`
- Modify: `knowledge/01-project-overview.md`
- Modify: `knowledge/02-requirements.md`
- Modify: `knowledge/03-tech-stack.md`
- Modify: `knowledge/04-task-list.md`
- Modify: `knowledge/05-review-notes.md`
- Modify: `knowledge/08-testing-strategy.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`
- Modify: `docs/releases/github-release.md`
- Create: next version file under `docs/releases/`

- [ ] **Step 1: Update the authoritative documentation**

Document Rust/Tauri IPC, rusqlite, reqwest, custom media URIs, the absence of a
release UI port, MSI plus portable ZIP, Python removal, and the Windows x64
single-process gate. Preserve the final theme-preference knowledge already on
`main`.

Do not change `CONTEXT.md`; no domain term changed. Link
`docs/adr/0001-single-process-rust-desktop-backend.md` from the decisions record.

- [ ] **Step 2: Run repository verification**

```bash
node --test tests/*.test.js
python scripts/run_playwright_linux_env.py npx playwright test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
git diff --check
```

Expected: every command exits 0. Python may remain only as a tooling launcher;
there is no Python application test suite after cutover.

- [ ] **Step 3: Run Windows x64 release verification**

On the Windows release runner:

```powershell
npm run desktop:build:windows
pwsh -File scripts/package_windows_portable.ps1 `
  -Executable "src-tauri/target/x86_64-pc-windows-msvc/release/Image Tools.exe" `
  -Output "release-assets/Image-Tools-Windows-x64-Portable.zip"
pwsh -File scripts/verify_windows_single_process.ps1 `
  -Msi "release-assets/Image-Tools-Windows-x64.msi" `
  -PortableZip "release-assets/Image-Tools-Windows-x64-Portable.zip"
```

Expected: the MSI payload and portable ZIP each contain one Image Tools
executable, each launch has one Image Tools process, no UI port listens, and
close leaves no Image Tools process.

- [ ] **Step 4: Perform old-workspace upgrade and rollback smoke tests**

On a disposable Windows runner, install the v0.2.3 MSI and open a copied v0.2.3
workspace. Close it, install the new MSI as an upgrade, and verify
Provider/session/run/image access. Uninstall the new MSI, reinstall v0.2.3, and
open a second copy of the upgraded workspace to verify data rollback. Expected:
MSI install, upgrade, launch, uninstall, and reinstall succeed, and
both application versions read the data because the migration did not change
schema version 2. Never point either build at a developer's real workspace.

- [ ] **Step 5: Commit**

```bash
git add README.md knowledge docs/releases
git commit -m "docs(desktop): record single-process Rust release"
```

## Final Completion Gate

Before declaring the migration complete:

- [ ] Confirm all Task 1-12 focused verification commands passed in their own
  commits.
- [ ] Confirm the Python sidecar files and production dependencies are absent.
- [ ] Confirm the theme-preference behavior and screenshots remain green.
- [ ] Confirm the MSI installed payload has one Image Tools executable.
- [ ] Confirm the portable ZIP has exactly one entry: `Image Tools.exe`.
- [ ] Confirm the app has one Image Tools PID and no listening UI socket.
- [ ] Confirm closing the app terminates that PID.
- [ ] Confirm a copied v0.2.3 workspace upgrades and rolls back without data
  loss.
- [ ] Confirm API keys are absent from IPC responses, logs, diagnostics, and test
  artifacts.
- [ ] Confirm the Windows x64 release notes state that signing/auto-update remain
  outside this migration unless credentials were separately supplied.
