use std::{path::Path, sync::Arc};

use percent_encoding::percent_decode_str;
use tauri::{http::HeaderMap, ipc::InvokeBody, Runtime};

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
        let references = ReferenceStore::new(data_root.join("uploads"))?;
        let generation = GenerationService::new(
            provider_repository.clone(),
            history.clone(),
            references.clone(),
            data_root.clone(),
        );
        Ok(Self {
            database: database.clone(),
            storage: StorageManager::new(location)?,
            providers: ProviderService::new(provider_repository, data_root.join("settings.json")),
            history,
            references,
            generation,
            media: MediaResolver::new(database, data_root),
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
    if !valid_percent_encoding(encoded_name) {
        return Err(invalid_reference_name());
    }
    let name = percent_decode_str(encoded_name)
        .decode_utf8()
        .map_err(|_| invalid_reference_name())?;
    let mime_type = required_header(request.headers(), "content-type")?;
    state.references.stage(&name, mime_type, bytes)
}

#[tauri::command]
pub async fn generate_image(
    input: GenerateInput,
    state: tauri::State<'_, WorkbenchState>,
) -> Result<GenerateResultDto, CommandError> {
    state.generation.generate(input).await
}

pub fn register_workbench_commands<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        get_settings,
        update_settings,
        get_storage_location,
        update_storage_location,
        list_providers,
        create_provider,
        get_provider,
        update_provider,
        delete_provider,
        set_default_provider,
        list_projects,
        create_project,
        update_project,
        delete_project,
        list_sessions,
        create_session,
        get_session,
        update_session,
        delete_session,
        set_session_pinned,
        list_session_runs,
        stage_reference_image,
        generate_image,
    ])
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
    use std::{collections::HashMap, path::PathBuf};

    use serde_json::{json, Value};
    use tauri::{
        http::{HeaderMap, HeaderValue},
        ipc::{CallbackFn, InvokeBody},
        test::{assert_ipc_response, get_ipc_response, mock_builder, mock_context, noop_assets},
        webview::InvokeRequest,
        Manager, WebviewUrl, WebviewWindow,
    };

    use super::{register_workbench_commands, WorkbenchState};

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
            let app = register_workbench_commands(mock_builder())
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
}
