use rusqlite::{Connection, Error, ErrorCode, OptionalExtension, Transaction};

use crate::workbench::{error::CommandError, models::utc_now};

const SCHEMA_VERSION: i64 = 2;

const V1_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    default_model TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    recent_thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS generation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    provider_id INTEGER,
    provider_name TEXT NOT NULL,
    model TEXT NOT NULL,
    reference_image_path TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_run_id INTEGER NOT NULL,
    local_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id) ON DELETE CASCADE
);
"#;

const PROJECTS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
"#;

pub fn initialize_schema(connection: &mut Connection) -> Result<(), CommandError> {
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(database_error)?;

    let current_version = schema_version(connection)?;
    if current_version > SCHEMA_VERSION {
        return Err(CommandError::new(
            "database.version_too_new",
            "工作区数据库来自较新的 Image Tools 版本。",
        ));
    }

    let transaction = connection.transaction().map_err(database_error)?;
    transaction
        .execute_batch(V1_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            [&utc_now()],
        )
        .map_err(database_error)?;

    if current_version < SCHEMA_VERSION {
        migrate_to_v2(&transaction)?;
    }

    transaction.commit().map_err(database_error)
}

pub fn schema_version(connection: &Connection) -> Result<i64, CommandError> {
    let migration_table_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !migration_table_exists {
        return Ok(0);
    }

    connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get::<_, Option<i64>>(0)
        })
        .optional()
        .map(|version| version.flatten().unwrap_or(0))
        .map_err(database_error)
}

fn migrate_to_v2(transaction: &Transaction<'_>) -> Result<(), CommandError> {
    transaction
        .execute_batch(PROJECTS_SCHEMA)
        .map_err(database_error)?;

    let session_columns = {
        let mut statement = transaction
            .prepare("PRAGMA table_info(sessions)")
            .map_err(database_error)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(database_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?
    };

    if !session_columns.iter().any(|column| column == "project_id") {
        transaction
            .execute(
                "ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL",
                [],
            )
            .map_err(database_error)?;
    }
    if !session_columns.iter().any(|column| column == "is_pinned") {
        transaction
            .execute(
                "ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(database_error)?;
    }

    transaction
        .execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            [&utc_now()],
        )
        .map_err(database_error)?;
    Ok(())
}

pub(crate) fn database_error(error: Error) -> CommandError {
    let code = match &error {
        Error::SqliteFailure(details, _)
            if matches!(
                details.code,
                ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase
            ) =>
        {
            "database.invalid"
        }
        _ => "database.query_failed",
    };
    let message = if code == "database.invalid" {
        "工作区数据库已损坏或格式无效。"
    } else {
        "无法读取或更新工作区数据库。"
    };
    CommandError::new(code, message).with_diagnostic(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{initialize_schema, schema_version};
    use crate::workbench::database::Database;
    use rusqlite::Connection;
    use std::path::PathBuf;

    #[cfg(unix)]
    fn invalid_unicode_path() -> PathBuf {
        use std::{ffi::OsString, os::unix::ffi::OsStringExt};

        PathBuf::from(OsString::from_vec(b"private\0database".to_vec()))
    }

    #[cfg(windows)]
    fn invalid_unicode_path() -> PathBuf {
        use std::{ffi::OsString, os::windows::ffi::OsStringExt};

        PathBuf::from(OsString::from_wide(&[0xd800]))
    }

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
    fn preserves_existing_v2_workspace_rows() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(&fixture("schema-v2.sql")).unwrap();

        initialize_schema(&mut connection).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 2);
        let migrations = connection
            .prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            migrations,
            vec![
                (1, "2026-07-12T00:00:00.000000+00:00".to_string()),
                (2, "2026-07-15T00:00:00.000000+00:00".to_string()),
            ]
        );

        let provider: (i64, String, String, String, String, i64, String, String) = connection
            .query_row(
                "SELECT id, name, base_url, api_key, default_model, is_default, created_at, updated_at FROM providers WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            provider,
            (
                1,
                "Primary".to_string(),
                "https://api.example.com/v1".to_string(),
                "sk-fixture-secret".to_string(),
                "gpt-image-2".to_string(),
                1,
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                "2026-07-15T00:00:00.000000+00:00".to_string(),
            )
        );

        let project: (i64, String, String, String, Option<String>) = connection
            .query_row(
                "SELECT id, name, created_at, updated_at, deleted_at FROM projects WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            project,
            (
                1,
                "品牌项目".to_string(),
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                None,
            )
        );

        let session: (
            i64,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<i64>,
            i64,
        ) = connection
            .query_row(
                "SELECT id, title, recent_thumbnail_path, created_at, updated_at, deleted_at, project_id, is_pinned FROM sessions WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                        row.get(5)?, row.get(6)?, row.get(7)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            session,
            (
                1,
                "已固定会话".to_string(),
                Some("images/result.png".to_string()),
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                None,
                Some(1),
                1,
            )
        );

        let run: (
            i64,
            i64,
            String,
            String,
            String,
            Option<i64>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
        ) = connection
            .query_row(
                "SELECT id, session_id, status, prompt, parameters_json, provider_id, provider_name, model, reference_image_path, error_message, created_at, completed_at FROM generation_runs WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                        row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
                        row.get(10)?, row.get(11)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            run,
            (
                1,
                1,
                "succeeded".to_string(),
                "生成一张海报".to_string(),
                "{\"count\":1,\"quality\":\"high\",\"ratio\":\"16:9\"}".to_string(),
                Some(1),
                "Primary".to_string(),
                "gpt-image-2".to_string(),
                None,
                None,
                "2026-07-15T00:00:00.000000+00:00".to_string(),
                Some("2026-07-15T00:00:01.000000+00:00".to_string()),
            )
        );

        let image: (i64, i64, String, String, String, Option<i64>, Option<i64>, String) = connection
            .query_row(
                "SELECT id, generation_run_id, local_path, filename, mime_type, width, height, created_at FROM images WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                        row.get(5)?, row.get(6)?, row.get(7)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            image,
            (
                1,
                1,
                "images/result.png".to_string(),
                "result.png".to_string(),
                "image/png".to_string(),
                Some(1536),
                Some(864),
                "2026-07-15T00:00:01.000000+00:00".to_string(),
            )
        );
    }

    #[test]
    fn creates_a_fresh_v2_database_with_foreign_keys_enabled() {
        let temporary = tempfile::tempdir().unwrap();
        let database_path = temporary.path().join("workbench.sqlite3");

        let database = Database::open(&database_path).unwrap();

        database
            .with_connection(|connection| {
                assert_eq!(schema_version(connection)?, 2);
                let foreign_keys: i64 = connection
                    .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
                    .map_err(super::database_error)?;
                assert_eq!(foreign_keys, 1);
                Ok(())
            })
            .unwrap();

        drop(database);
        let reopened = Database::open(&database_path).unwrap();
        reopened
            .with_connection(|connection| {
                assert_eq!(schema_version(connection)?, 2);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn rejects_a_schema_newer_than_version_two() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);\
                 INSERT INTO schema_migrations VALUES (3, '2026-07-15T00:00:00.000000+00:00');",
            )
            .unwrap();

        let error = initialize_schema(&mut connection).unwrap_err();

        assert_eq!(error.code, "database.version_too_new");
    }

    #[test]
    fn rolls_back_every_v2_change_when_migration_fails() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(&fixture("schema-v1.sql")).unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_v2 BEFORE INSERT ON schema_migrations
                 WHEN NEW.version = 2
                 BEGIN
                     SELECT RAISE(ABORT, 'reject v2 for rollback test');
                 END;",
            )
            .unwrap();

        let error = initialize_schema(&mut connection).unwrap_err();

        assert_eq!(error.code, "database.query_failed");
        assert_eq!(schema_version(&connection).unwrap(), 1);
        let projects_exist: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!projects_exist);
        let columns = connection
            .prepare("PRAGMA table_info(sessions)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(!columns.iter().any(|column| column == "project_id"));
        assert!(!columns.iter().any(|column| column == "is_pinned"));
    }

    #[test]
    fn rejects_a_corrupt_database_without_replacing_it() {
        let temporary = tempfile::tempdir().unwrap();
        let database_path = temporary.path().join("workbench.sqlite3");
        let original = b"not sqlite";
        std::fs::write(&database_path, original).unwrap();

        let error = Database::open(&database_path).err().unwrap();

        assert_eq!(error.code, "database.invalid");
        assert_eq!(std::fs::read(&database_path).unwrap(), original);
        assert!(!error
            .diagnostic
            .as_deref()
            .unwrap_or_default()
            .contains(database_path.to_string_lossy().as_ref()));
    }

    #[test]
    fn open_error_does_not_disclose_an_invalid_path() {
        let error = Database::open(&invalid_unicode_path()).err().unwrap();

        assert_eq!(error.code, "database.open_failed");
        assert_eq!(error.diagnostic, None);
    }
}
