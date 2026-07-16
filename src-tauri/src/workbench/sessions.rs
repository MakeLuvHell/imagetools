use chrono::Local;

use crate::workbench::{
    database::history::{HistoryRepository, ImageRecord, ProjectRecord, RunRecord, SessionRecord},
    error::CommandError,
    models::{
        GenerationRunDto, ImageDto, Patch, ProjectDto, ProjectInput, SessionCreateInput,
        SessionDto, SessionUpdateInput,
    },
};

#[derive(Debug, Clone)]
pub struct NewRunInput {
    pub session_id: i64,
    pub status: String,
    pub prompt: String,
    pub parameters: serde_json::Value,
    pub provider_id: Option<i64>,
    pub provider_name: String,
    pub model: String,
    pub reference_image_path: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewImageInput {
    pub local_path: String,
    pub filename: String,
    pub mime_type: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

pub struct HistoryService {
    repository: HistoryRepository,
}

impl HistoryService {
    pub fn new(repository: HistoryRepository) -> Self {
        Self { repository }
    }

    pub fn create_project(&self, input: ProjectInput) -> Result<ProjectDto, CommandError> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(CommandError::new(
                "project.name_required",
                "请填写项目名称。",
            ));
        }
        self.repository.create_project(name).map(project_dto)
    }
    pub fn list_projects(&self) -> Result<Vec<ProjectDto>, CommandError> {
        self.repository
            .list_projects()
            .map(|v| v.into_iter().map(project_dto).collect())
    }
    pub fn get_project(&self, id: i64) -> Result<ProjectDto, CommandError> {
        self.repository
            .get_project(id)?
            .map(project_dto)
            .ok_or_else(|| CommandError::new("project.not_found", "项目不存在。"))
    }
    pub fn update_project(&self, id: i64, input: ProjectInput) -> Result<ProjectDto, CommandError> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(CommandError::new(
                "project.name_required",
                "请填写项目名称。",
            ));
        }
        self.repository.update_project(id, name).map(project_dto)
    }
    pub fn delete_project(&self, id: i64) -> Result<(), CommandError> {
        self.repository.delete_project(id)
    }

    pub fn create_session(&self, input: SessionCreateInput) -> Result<SessionDto, CommandError> {
        let title = clean_title(&input.title);
        self.repository.create_session(&title).map(session_dto)
    }
    pub fn get_session(&self, id: i64) -> Result<SessionDto, CommandError> {
        self.repository
            .get_session(id)?
            .map(session_dto)
            .ok_or_else(|| CommandError::new("session.not_found", "会话不存在。"))
    }
    pub fn list_sessions(&self) -> Result<Vec<SessionDto>, CommandError> {
        self.repository
            .list_sessions()
            .map(|v| v.into_iter().map(session_dto).collect())
    }
    pub fn update_session(
        &self,
        id: i64,
        input: SessionUpdateInput,
    ) -> Result<SessionDto, CommandError> {
        let title = input.title.as_deref().map(clean_title);
        let project = match input.project_id {
            Patch::Missing => None,
            Patch::Value(value) => Some(value),
        };
        self.repository
            .update_session(id, title.as_deref(), project)
            .map(session_dto)
    }
    pub fn set_pinned(&self, id: i64, pinned: bool) -> Result<SessionDto, CommandError> {
        self.repository.set_pinned(id, pinned).map(session_dto)
    }
    pub fn delete_session(&self, id: i64) -> Result<(), CommandError> {
        self.repository.delete_session(id)
    }

    pub fn create_run(&self, input: NewRunInput) -> Result<GenerationRunDto, CommandError> {
        let record = self.repository.create_run(&input)?;
        self.run_dto(record)
    }
    pub fn get_run(&self, id: i64) -> Result<GenerationRunDto, CommandError> {
        let run = self
            .repository
            .get_run(id)?
            .ok_or_else(|| CommandError::new("run.not_found", "生成轮次不存在。"))?;
        self.run_dto(run)
    }
    pub fn list_runs(&self, session_id: i64) -> Result<Vec<GenerationRunDto>, CommandError> {
        if self.repository.get_session(session_id)?.is_none() {
            return Err(CommandError::new("session.not_found", "会话不存在。"));
        }
        self.repository
            .list_runs(session_id)?
            .into_iter()
            .map(|r| self.run_dto(r))
            .collect()
    }
    pub fn complete_success(
        &self,
        id: i64,
        images: Vec<NewImageInput>,
    ) -> Result<GenerationRunDto, CommandError> {
        let run = self.repository.complete_success(id, &images)?;
        self.run_dto(run)
    }
    pub fn finish_failed(&self, id: i64, message: &str) -> Result<GenerationRunDto, CommandError> {
        let run = self.repository.finish_failed(id, message)?;
        self.run_dto(run)
    }
    pub fn recover_interrupted_runs(&self) -> Result<usize, CommandError> {
        self.repository.recover_interrupted()
    }

    fn run_dto(&self, run: RunRecord) -> Result<GenerationRunDto, CommandError> {
        let parameters = serde_json::from_str(&run.parameters_json).map_err(|_| {
            CommandError::new("database.invalid_parameters", "生成参数记录格式无效。")
        })?;
        let images = self
            .repository
            .list_images(run.id)?
            .into_iter()
            .map(image_dto)
            .collect();
        Ok(GenerationRunDto {
            id: run.id,
            session_id: run.session_id,
            status: run.status,
            prompt: run.prompt,
            parameters,
            provider_id: run.provider_id,
            provider_name: run.provider_name,
            model: run.model,
            reference_image_path: run.reference_image_path,
            error_message: run.error_message,
            created_at: run.created_at,
            completed_at: run.completed_at,
            images,
        })
    }
}

fn clean_title(value: &str) -> String {
    let clean = value.trim();
    if clean.is_empty() {
        format!("新会话 {}", Local::now().format("%Y-%m-%d %H:%M"))
    } else {
        clean.to_string()
    }
}
fn project_dto(r: ProjectRecord) -> ProjectDto {
    ProjectDto {
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }
}
fn session_dto(r: SessionRecord) -> SessionDto {
    SessionDto {
        id: r.id,
        title: r.title,
        recent_thumbnail_path: r.recent_thumbnail_path,
        project_id: r.project_id,
        is_pinned: r.is_pinned,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }
}
fn image_dto(r: ImageRecord) -> ImageDto {
    ImageDto {
        id: r.id,
        local_path: r.local_path.clone(),
        url: format!("/files/{}", r.local_path),
        filename: r.filename,
        mime_type: r.mime_type,
        width: r.width,
        height: r.height,
        created_at: r.created_at,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{HistoryService, NewImageInput, NewRunInput};
    use crate::workbench::{
        database::{history::HistoryRepository, Database},
        models::{Patch, ProjectInput, SessionCreateInput, SessionUpdateInput},
    };

    struct HistoryFixture {
        _temporary: tempfile::TempDir,
        database: Arc<Database>,
        repository: HistoryRepository,
        service: HistoryService,
    }

    impl HistoryFixture {
        fn new() -> Self {
            let temporary = tempfile::tempdir().unwrap();
            let database =
                Arc::new(Database::open(&temporary.path().join("workbench.sqlite3")).unwrap());
            let repository = HistoryRepository::new(database.clone());
            let service = HistoryService::new(repository.clone());
            Self {
                _temporary: temporary,
                database,
                repository,
                service,
            }
        }

        fn create_session(&self, title: &str) -> i64 {
            self.service
                .create_session(SessionCreateInput {
                    title: title.into(),
                })
                .unwrap()
                .id
        }

        fn create_run(&self, session_id: i64, status: &str, prompt: &str) -> i64 {
            self.service
                .create_run(NewRunInput {
                    session_id,
                    status: status.into(),
                    prompt: prompt.into(),
                    parameters: serde_json::json!({"ratio": "16:9", "count": 1}),
                    provider_id: None,
                    provider_name: "Primary".into(),
                    model: "gpt-image-2".into(),
                    reference_image_path: None,
                    error_message: None,
                })
                .unwrap()
                .id
        }
    }

    #[test]
    fn deleting_a_project_unassigns_sessions_without_deleting_or_unpinning_them() {
        let fixture = HistoryFixture::new();
        let project = fixture
            .service
            .create_project(ProjectInput {
                name: "品牌项目".into(),
            })
            .unwrap();
        let session_id = fixture.create_session("产品海报");
        fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: None,
                    project_id: Patch::Value(Some(project.id)),
                },
            )
            .unwrap();
        fixture.service.set_pinned(session_id, true).unwrap();

        fixture.service.delete_project(project.id).unwrap();

        assert!(fixture.service.list_projects().unwrap().is_empty());
        let session = fixture.service.get_session(session_id).unwrap();
        assert_eq!(session.project_id, None);
        assert!(session.is_pinned);
        assert_eq!(
            fixture
                .service
                .update_session(
                    session_id,
                    SessionUpdateInput {
                        title: None,
                        project_id: Patch::Value(Some(project.id)),
                    },
                )
                .unwrap_err()
                .code,
            "project.not_found"
        );
        fixture.service.delete_session(session_id).unwrap();
        assert_eq!(
            fixture.service.get_session(session_id).unwrap_err().code,
            "session.not_found"
        );
        assert_eq!(
            fixture
                .service
                .create_run(NewRunInput {
                    session_id,
                    status: "running".into(),
                    prompt: "late".into(),
                    parameters: serde_json::json!({}),
                    provider_id: None,
                    provider_name: "Primary".into(),
                    model: "gpt-image-2".into(),
                    reference_image_path: None,
                    error_message: None,
                })
                .unwrap_err()
                .code,
            "session.not_found"
        );
    }

    #[test]
    fn session_patch_distinguishes_missing_null_and_project_values() {
        let fixture = HistoryFixture::new();
        let first = fixture
            .service
            .create_project(ProjectInput {
                name: "First".into(),
            })
            .unwrap();
        let session_id = fixture.create_session("Original");
        fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: Some("Renamed".into()),
                    project_id: Patch::Value(Some(first.id)),
                },
            )
            .unwrap();

        let unchanged = fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: None,
                    project_id: Patch::Missing,
                },
            )
            .unwrap();
        assert_eq!(unchanged.title, "Renamed");
        assert_eq!(unchanged.project_id, Some(first.id));

        fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: Some("Newest".into()),
                    project_id: Patch::Missing,
                },
            )
            .unwrap();
        let project_only = fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: None,
                    project_id: Patch::Value(Some(first.id)),
                },
            )
            .unwrap();
        assert_eq!(project_only.title, "Newest");

        let cleared = fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: None,
                    project_id: Patch::Value(None),
                },
            )
            .unwrap();
        assert_eq!(cleared.project_id, None);
        let error = fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: None,
                    project_id: Patch::Value(Some(999)),
                },
            )
            .unwrap_err();
        assert_eq!(error.code, "project.not_found");
    }

    #[test]
    fn successful_completion_persists_ordered_images_and_updates_the_thumbnail_atomically() {
        let fixture = HistoryFixture::new();
        let session_id = fixture.create_session("产品海报");
        let first_run = fixture.create_run(session_id, "running", "First");
        let second_run = fixture.create_run(session_id, "failed", "Second");

        let completed = fixture
            .service
            .complete_success(
                first_run,
                vec![
                    NewImageInput {
                        local_path: "images/first.png".into(),
                        filename: "first.png".into(),
                        mime_type: "image/png".into(),
                        width: Some(1536),
                        height: Some(864),
                    },
                    NewImageInput {
                        local_path: "images/second.png".into(),
                        filename: "second.png".into(),
                        mime_type: "image/png".into(),
                        width: Some(1536),
                        height: Some(864),
                    },
                ],
            )
            .unwrap();

        assert_eq!(completed.status, "succeeded");
        assert!(completed.completed_at.is_some());
        assert_eq!(
            completed
                .images
                .iter()
                .map(|image| image.local_path.as_str())
                .collect::<Vec<_>>(),
            ["images/first.png", "images/second.png"]
        );
        assert_eq!(
            fixture
                .service
                .get_session(session_id)
                .unwrap()
                .recent_thumbnail_path
                .as_deref(),
            Some("images/first.png")
        );
        let runs = fixture.service.list_runs(session_id).unwrap();
        assert_eq!(
            runs.iter().map(|run| run.id).collect::<Vec<_>>(),
            [first_run, second_run]
        );
        assert_eq!(runs[0].parameters["ratio"], "16:9");

        let duplicate = fixture
            .service
            .complete_success(first_run, Vec::new())
            .unwrap_err();
        assert_eq!(duplicate.code, "run.already_finished");
        assert_eq!(fixture.repository.list_images(first_run).unwrap().len(), 2);
        assert_eq!(
            fixture
                .service
                .finish_failed(first_run, "late failure")
                .unwrap_err()
                .code,
            "run.already_finished"
        );

        let patched = fixture
            .service
            .update_session(
                session_id,
                SessionUpdateInput {
                    title: Some("Patched".into()),
                    project_id: Patch::Missing,
                },
            )
            .unwrap();
        assert!(patched.recent_thumbnail_path.is_none());
    }

    #[test]
    fn startup_recovery_finishes_only_running_rows() {
        let fixture = HistoryFixture::new();
        let session_id = fixture.create_session("Recovery");
        let running = fixture.create_run(session_id, "running", "Running");
        let succeeded = fixture.create_run(session_id, "succeeded", "Succeeded");
        let failed = fixture.create_run(session_id, "failed", "Failed");

        let recovered = fixture.service.recover_interrupted_runs().unwrap();

        assert_eq!(recovered, 1);
        let running = fixture.repository.get_run(running).unwrap().unwrap();
        let succeeded = fixture.repository.get_run(succeeded).unwrap().unwrap();
        let failed = fixture.repository.get_run(failed).unwrap().unwrap();
        assert_eq!(running.status, "failed");
        assert_eq!(
            running.error_message.as_deref(),
            Some("应用在生成完成前退出。")
        );
        assert!(running.completed_at.is_some());
        assert_eq!(succeeded.status, "succeeded");
        assert_eq!(failed.status, "failed");
    }

    #[test]
    fn malformed_stored_parameters_return_a_stable_error() {
        let fixture = HistoryFixture::new();
        let session_id = fixture.create_session("Malformed");
        fixture
            .database
            .with_connection(|connection| {
                connection
                    .execute(
                        "INSERT INTO generation_runs (
                            session_id, status, prompt, parameters_json, provider_id,
                            provider_name, model, created_at
                         ) VALUES (?1, 'failed', 'bad', '{broken', NULL, 'Primary',
                                   'gpt-image-2', '2026-07-16T00:00:00.000000+00:00')",
                        [session_id],
                    )
                    .unwrap();
                Ok(())
            })
            .unwrap();

        let error = fixture.service.list_runs(session_id).unwrap_err();

        assert_eq!(error.code, "database.invalid_parameters");
        assert_eq!(error.diagnostic, None);
    }

    #[test]
    fn successful_completion_rolls_back_every_change_when_an_image_insert_fails() {
        let fixture = HistoryFixture::new();
        let session_id = fixture.create_session("Atomic");
        let run_id = fixture.create_run(session_id, "running", "Atomic run");
        fixture
            .database
            .with_connection(|connection| {
                connection
                    .execute_batch(
                        "CREATE TRIGGER reject_bad_image BEFORE INSERT ON images
                 WHEN NEW.filename = 'bad.png'
                 BEGIN SELECT RAISE(ABORT, 'reject image'); END;",
                    )
                    .unwrap();
                Ok(())
            })
            .unwrap();

        let error = fixture
            .service
            .complete_success(
                run_id,
                vec![
                    NewImageInput {
                        local_path: "images/good.png".into(),
                        filename: "good.png".into(),
                        mime_type: "image/png".into(),
                        width: None,
                        height: None,
                    },
                    NewImageInput {
                        local_path: "images/bad.png".into(),
                        filename: "bad.png".into(),
                        mime_type: "image/png".into(),
                        width: None,
                        height: None,
                    },
                ],
            )
            .unwrap_err();

        assert_eq!(error.code, "database.query_failed");
        let run = fixture.repository.get_run(run_id).unwrap().unwrap();
        assert_eq!(run.status, "running");
        assert!(run.completed_at.is_none());
        assert!(fixture.repository.list_images(run_id).unwrap().is_empty());
        assert!(fixture
            .service
            .get_session(session_id)
            .unwrap()
            .recent_thumbnail_path
            .is_none());
    }

    #[test]
    fn shared_history_contract_matches_the_v2_fixture() {
        let temporary = tempfile::tempdir().unwrap();
        let database_path = temporary.path().join("workbench.sqlite3");
        let connection = rusqlite::Connection::open(&database_path).unwrap();
        let fixture_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/backend-contracts");
        connection
            .execute_batch(&std::fs::read_to_string(fixture_dir.join("schema-v2.sql")).unwrap())
            .unwrap();
        drop(connection);
        let database = Arc::new(Database::open(&database_path).unwrap());
        let service = HistoryService::new(HistoryRepository::new(database));
        let contract: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(fixture_dir.join("public-contract.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(
            serde_json::to_value(service.list_projects().unwrap().remove(0)).unwrap(),
            contract["project_public"]
        );
        assert_eq!(
            serde_json::to_value(service.list_sessions().unwrap().remove(0)).unwrap(),
            contract["session_public"]
        );
        assert_eq!(
            serde_json::to_value(service.list_runs(1).unwrap().remove(0)).unwrap(),
            contract["run_public"]
        );
    }
}
