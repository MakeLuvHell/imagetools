use std::{path::Path, sync::Arc};

use percent_encoding::percent_decode_str;
use tauri::{http::HeaderMap, ipc::InvokeBody};

use crate::workbench::{
    database::{history::HistoryRepository, providers::ProviderRepository, Database},
    error::CommandError,
    generation::{files::ReferenceStore, GenerationService},
    media::MediaResolver,
    models::{
        GenerateInput, GenerateResultDto, GenerationRunDto, ProjectDto, ProjectInput, ProviderDto,
        ProviderInput, SessionCreateInput, SessionDto, SessionUpdateInput, SettingsDto,
        SettingsInput, StagedReferenceDto, StorageLocationDto, StorageLocationInput,
    },
    providers::ProviderService,
    sessions::HistoryService,
    storage::{resolve_storage_location, StorageManager},
};

const MAX_ENCODED_REFERENCE_NAME_BYTES: usize = 1024;
const MAX_REFERENCE_NAME_CHARS: usize = 255;

pub struct WorkbenchState {
    database: Arc<Database>,
    storage: StorageManager,
    providers: ProviderService,
    history: HistoryService,
    references: ReferenceStore,
    generation: GenerationService,
    media: MediaResolver,
}

impl WorkbenchState {
    pub fn initialize(default_data_dir: &Path, config_dir: &Path) -> Result<Self, CommandError> {
        let location = resolve_storage_location(default_data_dir, config_dir)?;
        let database = Arc::new(Database::open(
            &location.active_data_dir.join("workbench.sqlite3"),
        )?);
        Self::from_parts(location, database)
    }

    pub fn from_parts(
        location: crate::workbench::storage::StorageLocation,
        database: Arc<Database>,
    ) -> Result<Self, CommandError> {
        let data_root = location.active_data_dir.clone();
        let provider_repository = ProviderRepository::new(database.clone());
        let history = HistoryService::new(HistoryRepository::new(database.clone()));
        let storage = StorageManager::new(location)?;
        let references = ReferenceStore::new(data_root.join("uploads"))?;
        let media = MediaResolver::open(database.clone(), data_root.clone())?;
        let providers =
            ProviderService::new(provider_repository.clone(), data_root.join("settings.json"));
        providers.prepare_startup()?;
        history.recover_interrupted_runs()?;
        let generation = GenerationService::new(
            provider_repository,
            history.clone(),
            references.clone(),
            data_root.clone(),
        );
        Ok(Self {
            database,
            storage,
            providers,
            history,
            references,
            generation,
            media,
        })
    }

    pub fn database(&self) -> &Arc<Database> {
        &self.database
    }

    pub fn references(&self) -> &ReferenceStore {
        &self.references
    }

    pub fn media_resolver(&self) -> MediaResolver {
        self.media.clone()
    }

    fn stage_existing_reference(&self, image_id: i64) -> Result<StagedReferenceDto, CommandError> {
        let (bytes, mime_type) = self.media.read(image_id)?;
        self.references
            .stage(&format!("reference-{image_id}"), mime_type, &bytes)
    }
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, WorkbenchState>) -> Result<SettingsDto, CommandError> {
    state.providers.settings()
}

#[tauri::command]
pub fn update_settings(
    input: SettingsInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<SettingsDto, CommandError> {
    state.providers.update_settings(input)
}

#[tauri::command]
pub fn get_storage_location(
    state: tauri::State<'_, WorkbenchState>,
) -> Result<StorageLocationDto, CommandError> {
    state.storage.status()
}

#[tauri::command]
pub fn update_storage_location(
    input: StorageLocationInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<StorageLocationDto, CommandError> {
    state.storage.schedule(input)
}

#[tauri::command]
pub fn list_providers(
    state: tauri::State<'_, WorkbenchState>,
) -> Result<Vec<ProviderDto>, CommandError> {
    state.providers.list()
}

#[tauri::command]
pub fn create_provider(
    input: ProviderInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProviderDto, CommandError> {
    state.providers.create(input)
}

#[tauri::command]
pub fn get_provider(
    provider_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProviderDto, CommandError> {
    state.providers.get(provider_id)
}

#[tauri::command]
pub fn update_provider(
    provider_id: i64,
    input: ProviderInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProviderDto, CommandError> {
    state.providers.update(provider_id, input)
}

#[tauri::command]
pub fn delete_provider(
    provider_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<(), CommandError> {
    state.providers.delete(provider_id)
}

#[tauri::command]
pub fn set_default_provider(
    provider_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProviderDto, CommandError> {
    state.providers.set_default(provider_id)
}

#[tauri::command]
pub fn list_projects(
    state: tauri::State<'_, WorkbenchState>,
) -> Result<Vec<ProjectDto>, CommandError> {
    state.history.list_projects()
}

#[tauri::command]
pub fn create_project(
    input: ProjectInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProjectDto, CommandError> {
    state.history.create_project(input)
}

#[tauri::command]
pub fn update_project(
    project_id: i64,
    input: ProjectInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<ProjectDto, CommandError> {
    state.history.update_project(project_id, input)
}

#[tauri::command]
pub fn delete_project(
    project_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<(), CommandError> {
    state.history.delete_project(project_id)
}

#[tauri::command]
pub fn list_sessions(
    state: tauri::State<'_, WorkbenchState>,
) -> Result<Vec<SessionDto>, CommandError> {
    state.history.list_sessions()
}

#[tauri::command]
pub fn create_session(
    input: SessionCreateInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<SessionDto, CommandError> {
    state.history.create_session(input)
}

#[tauri::command]
pub fn get_session(
    session_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<SessionDto, CommandError> {
    state.history.get_session(session_id)
}

#[tauri::command]
pub fn update_session(
    session_id: i64,
    input: SessionUpdateInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<SessionDto, CommandError> {
    state.history.update_session(session_id, input)
}

#[tauri::command]
pub fn delete_session(
    session_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<(), CommandError> {
    state.history.delete_session(session_id)
}

#[tauri::command]
pub fn set_session_pinned(
    session_id: i64,
    is_pinned: bool,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<SessionDto, CommandError> {
    state.history.set_pinned(session_id, is_pinned)
}

#[tauri::command]
pub fn list_session_runs(
    session_id: i64,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<Vec<GenerationRunDto>, CommandError> {
    state.history.list_runs(session_id)
}

#[tauri::command]
pub fn stage_reference_image(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<StagedReferenceDto, CommandError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(CommandError::new(
            "reference.raw_body_required",
            "参考图必须使用二进制传输。",
        ));
    };
    let encoded_name = required_header(request.headers(), "x-image-name")?;
    if encoded_name.len() > MAX_ENCODED_REFERENCE_NAME_BYTES
        || !valid_percent_encoding(encoded_name)
    {
        return Err(invalid_reference_name());
    }
    let name = percent_decode_str(encoded_name)
        .decode_utf8()
        .map_err(|_| invalid_reference_name())?;
    if name.chars().count() > MAX_REFERENCE_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(invalid_reference_name());
    }
    let mime_type = required_header(request.headers(), "content-type")?;
    state.references.stage(&name, mime_type, bytes)
}

fn prepare_generation_reference(
    state: &WorkbenchState,
    reference_token: Option<String>,
    reference_image_id: Option<i64>,
) -> Result<Option<String>, CommandError> {
    match (reference_token, reference_image_id) {
        (Some(_), Some(_)) => Err(CommandError::new(
            "reference.conflicting_sources",
            "只能选择一种参考图来源。",
        )),
        (token @ Some(_), None) => Ok(token),
        (None, Some(image_id)) => Ok(Some(state.stage_existing_reference(image_id)?.token)),
        (None, None) => Ok(None),
    }
}

#[tauri::command]
pub async fn generate_image(
    mut input: GenerateInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<GenerateResultDto, CommandError> {
    input.reference_token = prepare_generation_reference(
        &state,
        input.reference_token.take(),
        input.reference_image_id.take(),
    )?;
    state.generation.generate(input).await
}

#[macro_export]
macro_rules! generate_workbench_handler {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
            $($extra,)*
            $crate::workbench::commands::get_settings,
            $crate::workbench::commands::update_settings,
            $crate::workbench::commands::get_storage_location,
            $crate::workbench::commands::update_storage_location,
            $crate::workbench::commands::list_providers,
            $crate::workbench::commands::create_provider,
            $crate::workbench::commands::get_provider,
            $crate::workbench::commands::update_provider,
            $crate::workbench::commands::delete_provider,
            $crate::workbench::commands::set_default_provider,
            $crate::workbench::commands::list_projects,
            $crate::workbench::commands::create_project,
            $crate::workbench::commands::update_project,
            $crate::workbench::commands::delete_project,
            $crate::workbench::commands::list_sessions,
            $crate::workbench::commands::create_session,
            $crate::workbench::commands::get_session,
            $crate::workbench::commands::update_session,
            $crate::workbench::commands::delete_session,
            $crate::workbench::commands::set_session_pinned,
            $crate::workbench::commands::list_session_runs,
            $crate::workbench::commands::stage_reference_image,
            $crate::workbench::commands::generate_image,
        ]
    };
}

fn required_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, CommandError> {
    headers
        .get(name)
        .ok_or_else(|| CommandError::new("reference.missing_header", "参考图请求缺少必要信息。"))?
        .to_str()
        .map_err(|_| CommandError::new("reference.invalid_header", "参考图请求信息无效。"))
}

fn valid_percent_encoding(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

fn invalid_reference_name() -> CommandError {
    CommandError::new("reference.invalid_name", "参考图文件名无效。")
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::PathBuf, sync::Arc};

    use serde_json::{json, Value};
    use tauri::{
        http::{HeaderMap, HeaderValue},
        ipc::{CallbackFn, InvokeBody},
        test::{assert_ipc_response, get_ipc_response, mock_builder, mock_context, noop_assets},
        webview::InvokeRequest,
        Manager, WebviewUrl, WebviewWindow,
    };

    use super::{prepare_generation_reference, WorkbenchState};
    use crate::workbench::{
        database::{history::HistoryRepository, Database},
        models::{GenerateInput, SessionCreateInput},
        sessions::{HistoryService, NewRunInput},
    };

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    struct CommandFixture {
        _temporary: tempfile::TempDir,
        app: tauri::App<tauri::test::MockRuntime>,
        webview: WebviewWindow<tauri::test::MockRuntime>,
        default_data_dir: PathBuf,
    }

    impl CommandFixture {
        fn new() -> Self {
            let temporary = tempfile::tempdir().unwrap();
            let default_data_dir = temporary.path().join("data");
            let config_dir = temporary.path().join("config");
            let state = WorkbenchState::initialize(&default_data_dir, &config_dir).unwrap();
            let app = mock_builder()
                .invoke_handler(crate::generate_workbench_handler![])
                .manage(state)
                .build(mock_context(noop_assets()))
                .unwrap();
            let webview = WebviewWindow::builder(&app, "main", WebviewUrl::default())
                .build()
                .unwrap();
            Self {
                _temporary: temporary,
                app,
                webview,
                default_data_dir,
            }
        }

        fn request(&self, cmd: &str, body: InvokeBody, headers: HeaderMap) -> InvokeRequest {
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body,
                headers,
                invoke_key: tauri::test::INVOKE_KEY.into(),
            }
        }

        fn json(&self, cmd: &str, body: Value) -> Result<Value, Value> {
            get_ipc_response(
                &self.webview,
                self.request(cmd, InvokeBody::Json(body), HeaderMap::new()),
            )
            .map(|body| body.deserialize::<Value>().unwrap())
        }

        fn ok(&self, cmd: &str, body: Value) -> Value {
            self.json(cmd, body)
                .unwrap_or_else(|error| panic!("{cmd} returned an unexpected error: {error}"))
        }

        fn insert_image(&self, filename: &str, bytes: &[u8], mime_type: &str) -> i64 {
            let image_dir = self.default_data_dir.join("images");
            std::fs::create_dir_all(&image_dir).unwrap();
            std::fs::write(image_dir.join(filename), bytes).unwrap();
            let state = self.app.state::<WorkbenchState>();
            state.database.with_connection(|connection| {
                let now = crate::workbench::models::utc_now();
                connection.execute(
                    "INSERT INTO sessions (title, is_pinned, created_at, updated_at) VALUES ('reference', 0, ?1, ?1)",
                    [&now],
                ).unwrap();
                let session_id = connection.last_insert_rowid();
                connection.execute(
                    "INSERT INTO generation_runs (session_id, status, prompt, parameters_json, provider_name, model, created_at) VALUES (?1, 'succeeded', 'reference', '{}', 'test', 'test', ?2)",
                    rusqlite::params![session_id, now],
                ).unwrap();
                let run_id = connection.last_insert_rowid();
                connection.execute(
                    "INSERT INTO images (generation_run_id, local_path, filename, mime_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![run_id, format!("images/{filename}"), filename, mime_type, crate::workbench::models::utc_now()],
                ).unwrap();
                Ok(connection.last_insert_rowid())
            }).unwrap()
        }
    }

    #[test]
    fn existing_image_reference_is_bounded_read_and_staged_for_single_use() {
        let fixture = CommandFixture::new();
        let image_id = fixture.insert_image("source.png", PNG, "image/png");
        let state = fixture.app.state::<WorkbenchState>();

        let staged = state.stage_existing_reference(image_id).unwrap();
        let reference = state.references.lookup(&staged.token).unwrap();

        assert_eq!(reference.mime_type, "image/png");
        assert_eq!(std::fs::read(reference.path).unwrap(), PNG);
    }

    #[test]
    fn existing_reference_rejects_conflicts_and_safe_media_errors_before_a_run() {
        let fixture = CommandFixture::new();
        let image_id = fixture.insert_image("invalid.png", b"not an image", "image/png");
        let state = fixture.app.state::<WorkbenchState>();
        let conflict =
            prepare_generation_reference(&state, Some("uploaded-token".into()), Some(image_id))
                .unwrap_err();
        let invalid = state.stage_existing_reference(image_id).unwrap_err();
        let missing = state.stage_existing_reference(999_999).unwrap_err();
        let mut oversized_bytes = PNG.to_vec();
        oversized_bytes.resize(25 * 1024 * 1024 + 1, 0);
        let oversized_id = fixture.insert_image("oversized.png", &oversized_bytes, "image/png");
        let oversized = state.stage_existing_reference(oversized_id).unwrap_err();
        let run_count = state
            .database
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM generation_runs WHERE status = 'running'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(crate::workbench::database::schema::database_error)
            })
            .unwrap();

        assert_eq!(conflict.code, "reference.conflicting_sources");
        assert_eq!(invalid.code, "media.not_found");
        assert_eq!(missing.code, "media.not_found");
        assert_eq!(oversized.code, "reference.too_large");
        assert_eq!(run_count, 0);
    }

    #[tauri::command]
    fn extra_ping() -> &'static str {
        "pong"
    }

    #[tauri::command]
    fn extra_version() -> u8 {
        8
    }

    #[test]
    fn unified_handler_composes_extra_and_workbench_commands() {
        let temporary = tempfile::tempdir().unwrap();
        let state = WorkbenchState::initialize(
            &temporary.path().join("data"),
            &temporary.path().join("config"),
        )
        .unwrap();
        let app = mock_builder()
            .invoke_handler(crate::generate_workbench_handler![
                extra_ping,
                extra_version,
            ])
            .manage(state)
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindow::builder(&app, "composition", WebviewUrl::default())
            .build()
            .unwrap();
        let request = |cmd: &str| InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(json!({})),
            headers: HeaderMap::new(),
            invoke_key: tauri::test::INVOKE_KEY.into(),
        };

        assert_ipc_response(&webview, request("extra_ping"), Ok("pong"));
        assert_ipc_response(&webview, request("extra_version"), Ok(8));
        assert!(get_ipc_response(&webview, request("get_settings")).is_ok());
    }

    #[tokio::test]
    async fn state_initialization_imports_legacy_settings_before_generation_is_exposed() {
        let temporary = tempfile::tempdir().unwrap();
        let data_root = temporary.path().join("data");
        std::fs::create_dir(&data_root).unwrap();
        std::fs::write(
            data_root.join("settings.json"),
            serde_json::to_vec(&json!({
                "base_url": "https://legacy.example/v1",
                "api_key": "legacy-secret",
                "model": "gpt-image-2"
            }))
            .unwrap(),
        )
        .unwrap();

        let state =
            WorkbenchState::initialize(&data_root, &temporary.path().join("config")).unwrap();
        let provider_count = state
            .database()
            .with_connection(|connection| {
                connection
                    .query_row("SELECT COUNT(*) FROM providers", [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .map_err(crate::workbench::database::schema::database_error)
            })
            .unwrap();
        assert_eq!(provider_count, 1);

        let session_id = state
            .history
            .create_session(SessionCreateInput {
                title: "startup".into(),
            })
            .unwrap()
            .id;
        let error = state
            .generation
            .generate(GenerateInput {
                session_id,
                provider_id: None,
                prompt: "test".into(),
                model: "".into(),
                width: 1,
                height: 1,
                ratio: "1:1".into(),
                resolution: "1K".into(),
                count: 1,
                quality: "auto".into(),
                output_format: "png".into(),
                output_compression: 100,
                background: "auto".into(),
                moderation: "auto".into(),
                reference_token: None,
                reference_image_id: None,
            })
            .await
            .unwrap_err();
        assert_eq!(error.code, "generation.invalid_size");
    }

    #[test]
    fn state_initialization_recovers_running_rows_before_exposing_services() {
        let temporary = tempfile::tempdir().unwrap();
        let data_root = temporary.path().join("data");
        std::fs::create_dir(&data_root).unwrap();
        let database = Arc::new(Database::open(&data_root.join("workbench.sqlite3")).unwrap());
        let history = HistoryService::new(HistoryRepository::new(database));
        let session_id = history
            .create_session(SessionCreateInput {
                title: "interrupted".into(),
            })
            .unwrap()
            .id;
        let run_id = history
            .create_run(NewRunInput {
                session_id,
                status: "running".into(),
                prompt: "pending".into(),
                parameters: json!({}),
                provider_id: None,
                provider_name: "Primary".into(),
                model: "gpt-image-2".into(),
                reference_image_path: None,
                error_message: None,
            })
            .unwrap()
            .id;
        drop(history);

        let state =
            WorkbenchState::initialize(&data_root, &temporary.path().join("config")).unwrap();

        let recovered = state.history.get_run(run_id).unwrap();
        assert_eq!(recovered.status, "failed");
        assert_eq!(
            recovered.error_message.as_deref(),
            Some("应用在生成完成前退出。")
        );
    }

    #[test]
    fn settings_storage_and_provider_commands_use_the_mock_ipc_contract() {
        let fixture = CommandFixture::new();
        let initial = fixture.ok("get_settings", json!({}));
        assert_eq!(initial["api_key"], "");

        let settings = fixture.ok(
            "update_settings",
            json!({"input": {
                "base_url": "https://api.example/v1",
                "api_key": "secret",
                "model": "gpt-image-2"
            }}),
        );
        assert_eq!(settings["api_key_set"], true);
        assert_eq!(settings["api_key"], "");

        let location = fixture.ok("get_storage_location", json!({}));
        assert_eq!(
            location["active_data_dir"],
            fixture.default_data_dir.to_string_lossy().as_ref()
        );
        let destination = fixture._temporary.path().join("custom");
        let scheduled = fixture.ok(
            "update_storage_location",
            json!({"input": {
                "data_dir": destination,
                "migrate_existing": false
            }}),
        );
        assert_eq!(
            scheduled["pending_data_dir"],
            destination.to_string_lossy().as_ref()
        );
        assert_eq!(scheduled["restart_required"], true);

        let providers = fixture.ok("list_providers", json!({}));
        assert_eq!(providers.as_array().unwrap().len(), 1);
        let created = fixture.ok(
            "create_provider",
            json!({"input": {
                "name": "Backup",
                "base_url": "https://backup.example/v1",
                "api_key": "backup-secret",
                "default_model": "gpt-image-2",
                "is_default": false
            }}),
        );
        let provider_id = created["id"].as_i64().unwrap();
        assert_eq!(
            fixture.ok("get_provider", json!({"providerId": provider_id}))["name"],
            "Backup"
        );
        assert_eq!(
            fixture.ok(
                "update_provider",
                json!({"providerId": provider_id, "input": {
                    "name": "Updated",
                    "base_url": "https://updated.example/v1",
                    "api_key": "",
                    "default_model": "gpt-image-2",
                    "is_default": false
                }})
            )["name"],
            "Updated"
        );
        assert_eq!(
            fixture.ok("set_default_provider", json!({"providerId": provider_id}))["is_default"],
            true
        );
        assert_eq!(
            fixture.ok("delete_provider", json!({"providerId": provider_id})),
            Value::Null
        );
    }

    #[test]
    fn project_session_run_and_generation_commands_use_camel_case_top_level_ids() {
        let fixture = CommandFixture::new();
        let project = fixture.ok("create_project", json!({"input": {"name": "Campaign"}}));
        let project_id = project["id"].as_i64().unwrap();
        assert_eq!(
            fixture
                .ok("list_projects", json!({}))
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            fixture.ok(
                "update_project",
                json!({"projectId": project_id, "input": {"name": "Launch"}})
            )["name"],
            "Launch"
        );

        let session = fixture.ok("create_session", json!({"input": {"title": "Poster"}}));
        let session_id = session["id"].as_i64().unwrap();
        assert_eq!(
            fixture
                .ok("list_sessions", json!({}))
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            fixture.ok("get_session", json!({"sessionId": session_id}))["title"],
            "Poster"
        );
        assert_eq!(
            fixture.ok(
                "update_session",
                json!({"sessionId": session_id, "input": {
                    "title": "Poster v2",
                    "project_id": project_id
                }})
            )["project_id"],
            project_id
        );
        assert_eq!(
            fixture.ok(
                "set_session_pinned",
                json!({"sessionId": session_id, "isPinned": true})
            )["is_pinned"],
            true
        );
        assert!(fixture
            .ok("list_session_runs", json!({"sessionId": session_id}))
            .as_array()
            .unwrap()
            .is_empty());

        let generation_error = fixture
            .json(
                "generate_image",
                json!({"input": {
                    "session_id": session_id,
                    "provider_id": null,
                    "prompt": "",
                    "model": "gpt-image-2",
                    "width": 1536,
                    "height": 864,
                    "ratio": "16:9",
                    "resolution": "1K",
                    "count": 1,
                    "quality": "auto",
                    "output_format": "png",
                    "output_compression": 100,
                    "background": "auto",
                    "moderation": "auto",
                    "reference_token": null
                }}),
            )
            .unwrap_err();
        assert_eq!(generation_error["code"], "generation.prompt_required");

        assert_eq!(
            fixture.ok("delete_project", json!({"projectId": project_id})),
            Value::Null
        );
        assert_eq!(
            fixture.ok("delete_session", json!({"sessionId": session_id})),
            Value::Null
        );
    }

    #[test]
    fn stage_reference_rejects_json_and_missing_headers_with_structured_errors() {
        let fixture = CommandFixture::new();
        assert_ipc_response(
            &fixture.webview,
            fixture.request(
                "stage_reference_image",
                InvokeBody::Json(json!({"bytes": "base64"})),
                HeaderMap::new(),
            ),
            Err(json!({
                "code": "reference.raw_body_required",
                "message": "参考图必须使用二进制传输。",
                "diagnostic": null
            })),
        );
        let mut filename_only = HeaderMap::new();
        filename_only.insert("x-image-name", HeaderValue::from_static("reference.png"));
        assert_ipc_response(
            &fixture.webview,
            fixture.request(
                "stage_reference_image",
                InvokeBody::Raw(PNG.to_vec()),
                filename_only,
            ),
            Err(json!({
                "code": "reference.missing_header",
                "message": "参考图请求缺少必要信息。",
                "diagnostic": null
            })),
        );
        assert_ipc_response(
            &fixture.webview,
            fixture.request(
                "stage_reference_image",
                InvokeBody::Raw(PNG.to_vec()),
                HeaderMap::new(),
            ),
            Err(json!({
                "code": "reference.missing_header",
                "message": "参考图请求缺少必要信息。",
                "diagnostic": null
            })),
        );
    }

    #[test]
    fn stage_reference_percent_decodes_utf8_metadata_and_stages_raw_bytes() {
        let fixture = CommandFixture::new();
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-image-name",
            HeaderValue::from_static("%E5%8F%82%E8%80%83%E5%9B%BE.png"),
        );
        headers.insert("content-type", HeaderValue::from_static("image/png"));

        let response = get_ipc_response(
            &fixture.webview,
            fixture.request(
                "stage_reference_image",
                InvokeBody::Raw(PNG.to_vec()),
                headers,
            ),
        )
        .unwrap()
        .deserialize::<Value>()
        .unwrap();
        let token = response["token"].as_str().unwrap();
        let staged = fixture
            .app
            .state::<WorkbenchState>()
            .references()
            .lookup(token)
            .unwrap();
        assert_eq!(staged.original_name, "参考图.png");
        assert_eq!(staged.mime_type, "image/png");
        assert_eq!(std::fs::read(staged.path).unwrap(), PNG);
    }

    #[test]
    fn stage_reference_rejects_invalid_header_bytes_and_percent_encoded_utf8() {
        let fixture = CommandFixture::new();
        let mut invalid_header = HeaderMap::new();
        invalid_header.insert("x-image-name", HeaderValue::from_bytes(&[0xff]).unwrap());
        invalid_header.insert("content-type", HeaderValue::from_static("image/png"));
        let error = get_ipc_response(
            &fixture.webview,
            fixture.request(
                "stage_reference_image",
                InvokeBody::Raw(PNG.to_vec()),
                invalid_header,
            ),
        )
        .unwrap_err();
        assert_eq!(error["code"], "reference.invalid_header");

        let cases = HashMap::from([("bad-name", "%FF"), ("bad-percent", "%")]);
        for encoded in cases.values() {
            let mut headers = HeaderMap::new();
            headers.insert("x-image-name", HeaderValue::from_str(encoded).unwrap());
            headers.insert("content-type", HeaderValue::from_static("image/png"));
            let error = get_ipc_response(
                &fixture.webview,
                fixture.request(
                    "stage_reference_image",
                    InvokeBody::Raw(PNG.to_vec()),
                    headers,
                ),
            )
            .unwrap_err();
            assert_eq!(error["code"], "reference.invalid_name");
        }
    }

    #[test]
    fn stage_reference_rejects_oversized_names_and_encoded_controls() {
        let fixture = CommandFixture::new();
        for encoded_name in [
            "a".repeat(1025),
            format!("{}.png", "a".repeat(256)),
            "%0D%0Ainjected.png".into(),
            "%00hidden.png".into(),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(
                "x-image-name",
                HeaderValue::from_str(&encoded_name).unwrap(),
            );
            headers.insert("content-type", HeaderValue::from_static("image/png"));

            let error = get_ipc_response(
                &fixture.webview,
                fixture.request(
                    "stage_reference_image",
                    InvokeBody::Raw(PNG.to_vec()),
                    headers,
                ),
            )
            .unwrap_err();

            assert_eq!(
                error["code"], "reference.invalid_name",
                "accepted unsafe encoded name: {encoded_name:?}"
            );
        }
    }
}
