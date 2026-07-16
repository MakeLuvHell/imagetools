use std::sync::Arc;

use rusqlite::{params, OptionalExtension, Row, TransactionBehavior};

use crate::workbench::{
    database::{schema::database_error, Database},
    error::CommandError,
    models::utc_now,
    sessions::{NewImageInput, NewRunInput},
};

#[derive(Debug, Clone)]
pub(crate) struct ProjectRecord {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct SessionRecord {
    pub id: i64,
    pub title: String,
    pub recent_thumbnail_path: Option<String>,
    pub project_id: Option<i64>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct RunRecord {
    pub id: i64,
    pub session_id: i64,
    pub status: String,
    pub prompt: String,
    pub parameters_json: String,
    pub provider_id: Option<i64>,
    pub provider_name: String,
    pub model: String,
    pub reference_image_path: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ImageRecord {
    pub id: i64,
    pub local_path: String,
    pub filename: String,
    pub mime_type: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub created_at: String,
}

#[derive(Clone)]
pub struct HistoryRepository {
    database: Arc<Database>,
}

impl HistoryRepository {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub(crate) fn create_project(&self, name: &str) -> Result<ProjectRecord, CommandError> {
        self.database.with_connection(|connection| {
            let now = utc_now();
            connection
                .execute(
                    "INSERT INTO projects (name, created_at, updated_at, deleted_at)
                     VALUES (?1, ?2, ?2, NULL)",
                    params![name, now],
                )
                .map_err(database_error)?;
            query_project(connection, connection.last_insert_rowid())?.ok_or_else(project_not_found)
        })
    }

    pub(crate) fn get_project(&self, id: i64) -> Result<Option<ProjectRecord>, CommandError> {
        self.database.with_connection(|c| query_project(c, id))
    }

    pub(crate) fn list_projects(&self) -> Result<Vec<ProjectRecord>, CommandError> {
        self.database.with_connection(|connection| {
            collect_rows(
                connection,
                "SELECT id, name, created_at, updated_at FROM projects
                 WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC",
                [],
                project_from_row,
            )
        })
    }

    pub(crate) fn update_project(
        &self,
        id: i64,
        name: &str,
    ) -> Result<ProjectRecord, CommandError> {
        self.database.with_connection(|connection| {
            let changed = connection
                .execute(
                    "UPDATE projects SET name = ?1, updated_at = ?2
                     WHERE id = ?3 AND deleted_at IS NULL",
                    params![name, utc_now(), id],
                )
                .map_err(database_error)?;
            if changed == 0 {
                return Err(project_not_found());
            }
            query_project(connection, id)?.ok_or_else(project_not_found)
        })
    }

    pub(crate) fn delete_project(&self, id: i64) -> Result<(), CommandError> {
        self.database.with_connection(|connection| {
            let tx = connection.transaction().map_err(database_error)?;
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1 AND deleted_at IS NULL)",
                [id], |row| row.get(0)).map_err(database_error)?;
            if !exists { return Err(project_not_found()); }
            let now = utc_now();
            tx.execute("UPDATE sessions SET project_id = NULL, updated_at = ?1 WHERE project_id = ?2", params![now, id]).map_err(database_error)?;
            tx.execute("UPDATE projects SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL", params![now, id]).map_err(database_error)?;
            tx.commit().map_err(database_error)
        })
    }

    pub(crate) fn create_session(&self, title: &str) -> Result<SessionRecord, CommandError> {
        self.database.with_connection(|connection| {
            let now = utc_now();
            connection.execute(
                "INSERT INTO sessions (title, recent_thumbnail_path, project_id, is_pinned, created_at, updated_at, deleted_at)
                 VALUES (?1, NULL, NULL, 0, ?2, ?2, NULL)", params![title, now]).map_err(database_error)?;
            query_session(connection, connection.last_insert_rowid())?.ok_or_else(session_not_found)
        })
    }

    pub(crate) fn get_session(&self, id: i64) -> Result<Option<SessionRecord>, CommandError> {
        self.database.with_connection(|c| query_session(c, id))
    }

    pub(crate) fn list_sessions(&self) -> Result<Vec<SessionRecord>, CommandError> {
        self.database.with_connection(|connection| {
            collect_rows(
            connection,
            "SELECT id, title, recent_thumbnail_path, project_id, is_pinned, created_at, updated_at
             FROM sessions WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC",
            [], session_from_row)
        })
    }

    pub(crate) fn update_session(
        &self,
        id: i64,
        title: Option<&str>,
        project_id: Option<Option<i64>>,
    ) -> Result<SessionRecord, CommandError> {
        self.database.with_connection(|connection| {
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            if let Some(Some(project_id)) = project_id {
                let active: bool = tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1 AND deleted_at IS NULL)",
                        [project_id],
                        |row| row.get(0),
                    )
                    .map_err(database_error)?;
                if !active {
                    return Err(project_not_found());
                }
            }
            let changed = match (title, project_id) {
                (Some(title), Some(project_id)) => tx.execute(
                    "UPDATE sessions SET title = ?1, recent_thumbnail_path = NULL, project_id = ?2, updated_at = ?3 WHERE id = ?4 AND deleted_at IS NULL",
                    params![title, project_id, utc_now(), id]),
                (Some(title), None) => tx.execute(
                    "UPDATE sessions SET title = ?1, recent_thumbnail_path = NULL, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                    params![title, utc_now(), id]),
                (None, Some(project_id)) => tx.execute(
                    "UPDATE sessions SET recent_thumbnail_path = NULL, project_id = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                    params![project_id, utc_now(), id]),
                (None, None) => tx.execute(
                    "UPDATE sessions SET recent_thumbnail_path = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
                    params![utc_now(), id]),
            }.map_err(database_error)?;
            if changed == 0 { return Err(session_not_found()); }
            let session = query_session(&tx, id)?.ok_or_else(session_not_found)?;
            tx.commit().map_err(database_error)?;
            Ok(session)
        })
    }

    pub(crate) fn set_pinned(&self, id: i64, pinned: bool) -> Result<SessionRecord, CommandError> {
        self.database.with_connection(|connection| {
            let changed = connection.execute(
                "UPDATE sessions SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                params![pinned, utc_now(), id]).map_err(database_error)?;
            if changed == 0 { return Err(session_not_found()); }
            query_session(connection, id)?.ok_or_else(session_not_found)
        })
    }

    pub(crate) fn delete_session(&self, id: i64) -> Result<(), CommandError> {
        self.database.with_connection(|connection| {
            let now = utc_now();
            let changed = connection.execute(
                "UPDATE sessions SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
                params![now, id]).map_err(database_error)?;
            if changed == 0 { return Err(session_not_found()); }
            Ok(())
        })
    }

    pub(crate) fn create_run(&self, input: &NewRunInput) -> Result<RunRecord, CommandError> {
        self.database.with_connection(|connection| {
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let active: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1 AND deleted_at IS NULL)",
                    [input.session_id],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if !active {
                return Err(session_not_found());
            }
            let now = utc_now();
            let parameters =
                serde_json::to_string(&input.parameters).map_err(|_| invalid_parameters())?;
            tx.execute(
                "INSERT INTO generation_runs (
                    session_id, status, prompt, parameters_json, provider_id, provider_name,
                    model, reference_image_path, error_message, created_at, completed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)",
                params![
                    input.session_id,
                    input.status,
                    input.prompt,
                    parameters,
                    input.provider_id,
                    input.provider_name,
                    input.model,
                    input.reference_image_path,
                    input.error_message,
                    now
                ],
            )
            .map_err(database_error)?;
            let id = tx.last_insert_rowid();
            tx.execute(
                "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
                params![now, input.session_id],
            )
            .map_err(database_error)?;
            let run = query_run(&tx, id)?.ok_or_else(run_not_found)?;
            tx.commit().map_err(database_error)?;
            Ok(run)
        })
    }

    pub(crate) fn get_run(&self, id: i64) -> Result<Option<RunRecord>, CommandError> {
        self.database.with_connection(|c| query_run(c, id))
    }

    pub(crate) fn list_runs(&self, session_id: i64) -> Result<Vec<RunRecord>, CommandError> {
        self.database.with_connection(|connection| {
            collect_rows(
            connection,
            "SELECT id, session_id, status, prompt, parameters_json, provider_id, provider_name,
                    model, reference_image_path, error_message, created_at, completed_at
             FROM generation_runs WHERE session_id = ?1 ORDER BY created_at ASC, id ASC",
            [session_id], run_from_row)
        })
    }

    pub(crate) fn list_images(&self, run_id: i64) -> Result<Vec<ImageRecord>, CommandError> {
        self.database.with_connection(|connection| collect_rows(
            connection,
            "SELECT id, generation_run_id, local_path, filename, mime_type, width, height, created_at
             FROM images WHERE generation_run_id = ?1 ORDER BY id ASC",
            [run_id], image_from_row))
    }

    pub(crate) fn complete_success(
        &self,
        run_id: i64,
        images: &[NewImageInput],
    ) -> Result<(RunRecord, Vec<i64>), CommandError> {
        self.database.with_connection(|connection| {
            let tx = connection.transaction().map_err(database_error)?;
            let run = query_run(&tx, run_id)?.ok_or_else(run_not_found)?;
            if run.status != "running" {
                return Err(run_already_finished());
            }
            let session_active: bool = tx
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM sessions WHERE id = ?1 AND deleted_at IS NULL
                     )",
                    [run.session_id],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if !session_active {
                return Err(session_not_found());
            }
            let completed = utc_now();
            let mut image_ids = Vec::with_capacity(images.len());
            for image in images {
                tx.execute(
                    "INSERT INTO images (generation_run_id, local_path, filename, mime_type, width, height, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![run_id, image.local_path, image.filename, image.mime_type, image.width, image.height, completed])
                    .map_err(database_error)?;
                image_ids.push(tx.last_insert_rowid());
            }
            tx.execute("UPDATE generation_runs SET status = 'succeeded', error_message = NULL, completed_at = ?1 WHERE id = ?2", params![completed, run_id]).map_err(database_error)?;
            if let Some(image) = images.first() {
                tx.execute("UPDATE sessions SET recent_thumbnail_path = ?1, updated_at = ?2 WHERE id = ?3", params![image.local_path, completed, run.session_id]).map_err(database_error)?;
            }
            let completed_run = query_run(&tx, run_id)?.ok_or_else(run_not_found)?;
            tx.commit().map_err(database_error)?;
            Ok((completed_run, image_ids))
        })
    }

    pub(crate) fn finish_failed(
        &self,
        run_id: i64,
        message: &str,
    ) -> Result<RunRecord, CommandError> {
        self.database.with_connection(|connection| {
            let changed = connection.execute(
                "UPDATE generation_runs SET status = 'failed', error_message = ?1, completed_at = ?2 WHERE id = ?3 AND status = 'running'",
                params![message, utc_now(), run_id]).map_err(database_error)?;
            if changed == 0 {
                return if query_run(connection, run_id)?.is_some() {
                    Err(run_already_finished())
                } else {
                    Err(run_not_found())
                };
            }
            query_run(connection, run_id)?.ok_or_else(run_not_found)
        })
    }

    pub(crate) fn recover_interrupted(&self) -> Result<usize, CommandError> {
        self.database.with_connection(|connection| connection.execute(
            "UPDATE generation_runs SET status = 'failed', error_message = '应用在生成完成前退出。', completed_at = ?1 WHERE status = 'running'",
            [utc_now()]).map_err(database_error))
    }
}

fn query_project(c: &rusqlite::Connection, id: i64) -> Result<Option<ProjectRecord>, CommandError> {
    c.query_row("SELECT id, name, created_at, updated_at FROM projects WHERE id = ?1 AND deleted_at IS NULL", [id], project_from_row).optional().map_err(database_error)
}
fn query_session(c: &rusqlite::Connection, id: i64) -> Result<Option<SessionRecord>, CommandError> {
    c.query_row("SELECT id, title, recent_thumbnail_path, project_id, is_pinned, created_at, updated_at FROM sessions WHERE id = ?1 AND deleted_at IS NULL", [id], session_from_row).optional().map_err(database_error)
}
fn query_run(c: &rusqlite::Connection, id: i64) -> Result<Option<RunRecord>, CommandError> {
    c.query_row("SELECT id, session_id, status, prompt, parameters_json, provider_id, provider_name, model, reference_image_path, error_message, created_at, completed_at FROM generation_runs WHERE id = ?1", [id], run_from_row).optional().map_err(database_error)
}

fn collect_rows<P: rusqlite::Params, T>(
    c: &rusqlite::Connection,
    sql: &str,
    params: P,
    mapper: fn(&Row<'_>) -> rusqlite::Result<T>,
) -> Result<Vec<T>, CommandError> {
    let mut statement = c.prepare(sql).map_err(database_error)?;
    let result = statement
        .query_map(params, mapper)
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error);
    result
}

fn project_from_row(r: &Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: r.get(0)?,
        name: r.get(1)?,
        created_at: r.get(2)?,
        updated_at: r.get(3)?,
    })
}
fn session_from_row(r: &Row<'_>) -> rusqlite::Result<SessionRecord> {
    Ok(SessionRecord {
        id: r.get(0)?,
        title: r.get(1)?,
        recent_thumbnail_path: r.get(2)?,
        project_id: r.get(3)?,
        is_pinned: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}
fn run_from_row(r: &Row<'_>) -> rusqlite::Result<RunRecord> {
    Ok(RunRecord {
        id: r.get(0)?,
        session_id: r.get(1)?,
        status: r.get(2)?,
        prompt: r.get(3)?,
        parameters_json: r.get(4)?,
        provider_id: r.get(5)?,
        provider_name: r.get(6)?,
        model: r.get(7)?,
        reference_image_path: r.get(8)?,
        error_message: r.get(9)?,
        created_at: r.get(10)?,
        completed_at: r.get(11)?,
    })
}
fn image_from_row(r: &Row<'_>) -> rusqlite::Result<ImageRecord> {
    Ok(ImageRecord {
        id: r.get(0)?,
        local_path: r.get(2)?,
        filename: r.get(3)?,
        mime_type: r.get(4)?,
        width: r.get(5)?,
        height: r.get(6)?,
        created_at: r.get(7)?,
    })
}

fn project_not_found() -> CommandError {
    CommandError::new("project.not_found", "项目不存在。")
}
fn session_not_found() -> CommandError {
    CommandError::new("session.not_found", "会话不存在。")
}
fn run_not_found() -> CommandError {
    CommandError::new("run.not_found", "生成轮次不存在。")
}
fn run_already_finished() -> CommandError {
    CommandError::new("run.already_finished", "生成轮次已经结束。")
}
fn invalid_parameters() -> CommandError {
    CommandError::new("database.invalid_parameters", "生成参数记录格式无效。")
}
