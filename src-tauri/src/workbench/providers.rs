use std::{env, fs, path::PathBuf};

use serde_json::Value;

use crate::workbench::{
    database::providers::{ProviderRecord, ProviderRepository},
    error::CommandError,
    models::{ProviderDto, ProviderInput, SettingsDto, SettingsInput},
};

const DEFAULT_MODEL: &str = "gpt-image-2";
const CHSHAPI_BASE_URL: &str = "https://img-api.chshapi.org/v1";

pub struct ProviderService {
    repository: ProviderRepository,
    settings_path: PathBuf,
}

impl ProviderService {
    pub fn new(repository: ProviderRepository, settings_path: PathBuf) -> Self {
        Self {
            repository,
            settings_path,
        }
    }

    pub fn settings_path(&self) -> &std::path::Path {
        &self.settings_path
    }

    pub fn list(&self) -> Result<Vec<ProviderDto>, CommandError> {
        self.migrate_legacy_settings()?;
        self.repository
            .list()
            .map(|providers| providers.into_iter().map(public_provider).collect())
    }

    pub fn get(&self, provider_id: i64) -> Result<ProviderDto, CommandError> {
        self.migrate_legacy_settings()?;
        self.repository
            .get(provider_id)?
            .map(public_provider)
            .ok_or_else(provider_not_found)
    }

    pub fn create(&self, input: ProviderInput) -> Result<ProviderDto, CommandError> {
        self.migrate_legacy_settings()?;
        let clean = clean_provider(input, None)?;
        self.repository
            .create(
                &clean.name,
                &clean.base_url,
                &clean.api_key,
                &clean.default_model,
                clean.is_default,
            )
            .map(public_provider)
    }

    pub fn update(
        &self,
        provider_id: i64,
        input: ProviderInput,
    ) -> Result<ProviderDto, CommandError> {
        self.migrate_legacy_settings()?;
        let existing = self
            .repository
            .get(provider_id)?
            .ok_or_else(provider_not_found)?;
        let clean = clean_provider(input, Some(&existing.api_key))?;
        self.repository
            .update(
                provider_id,
                &clean.name,
                &clean.base_url,
                &clean.api_key,
                &clean.default_model,
                clean.is_default,
            )
            .map(public_provider)
    }

    pub fn delete(&self, provider_id: i64) -> Result<(), CommandError> {
        self.migrate_legacy_settings()?;
        self.repository.delete(provider_id)
    }

    pub fn set_default(&self, provider_id: i64) -> Result<ProviderDto, CommandError> {
        self.migrate_legacy_settings()?;
        let provider = self
            .repository
            .get(provider_id)?
            .ok_or_else(provider_not_found)?;
        self.repository
            .update(
                provider.id,
                &provider.name,
                &provider.base_url,
                &provider.api_key,
                &provider.default_model,
                true,
            )
            .map(public_provider)
    }

    pub fn settings(&self) -> Result<SettingsDto, CommandError> {
        self.migrate_legacy_settings()?;
        if let Some(provider) = self.default_provider()? {
            return Ok(public_settings(&provider));
        }
        Ok(public_settings(&self.read_legacy_settings()))
    }

    pub fn update_settings(&self, input: SettingsInput) -> Result<SettingsDto, CommandError> {
        self.migrate_legacy_settings()?;
        let existing = self.default_provider()?;
        let effective_key = input
            .api_key
            .trim()
            .to_string()
            .or_else_nonempty(existing.as_ref().map(|provider| provider.api_key.as_str()));
        let base_url = normalize_base_url(&input.base_url);
        if base_url.is_empty() {
            return Err(CommandError::new(
                "provider.base_url_required",
                "请填写 API 地址。",
            ));
        }
        if effective_key.is_empty() {
            return Err(CommandError::new(
                "provider.api_key_required",
                "请填写 API Key。",
            ));
        }
        let model = defaulted_model(&input.model);
        let provider = if let Some(provider) = existing {
            self.repository.update(
                provider.id,
                &provider.name,
                &base_url,
                &effective_key,
                &model,
                true,
            )?
        } else {
            self.repository
                .create("Default", &base_url, &effective_key, &model, true)?
        };
        self.write_settings_file(&provider)?;
        Ok(public_settings(&provider))
    }

    fn default_provider(&self) -> Result<Option<ProviderRecord>, CommandError> {
        let providers = self.repository.list()?;
        Ok(providers
            .iter()
            .find(|provider| provider.is_default)
            .cloned()
            .or_else(|| providers.into_iter().next()))
    }

    fn migrate_legacy_settings(&self) -> Result<(), CommandError> {
        if !self.repository.list()?.is_empty() || !self.settings_path.exists() {
            return Ok(());
        }
        let settings = self.read_legacy_settings();
        if settings.base_url.is_empty() && settings.api_key.is_empty() {
            return Ok(());
        }
        self.repository.create_if_empty(
            "Default",
            &normalize_base_url(&settings.base_url),
            settings.api_key.trim(),
            &defaulted_model(&settings.default_model),
        )?;
        Ok(())
    }

    fn read_legacy_settings(&self) -> ProviderRecord {
        let defaults = environment_settings();
        let value = fs::read(&self.settings_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
        let object = value.as_ref().and_then(Value::as_object);
        let base_url = object
            .and_then(|value| value.get("base_url"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(&defaults.base_url);
        let api_key = object
            .and_then(|value| value.get("api_key"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(&defaults.api_key);
        let model = object
            .and_then(|value| value.get("model"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(&defaults.default_model);
        ProviderRecord {
            id: 0,
            name: "Default".into(),
            base_url: normalize_base_url(base_url),
            api_key: api_key.to_string(),
            default_model: defaulted_model(model),
            is_default: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn write_settings_file(&self, provider: &ProviderRecord) -> Result<(), CommandError> {
        let parent = self.settings_path.parent().ok_or_else(|| {
            CommandError::new("settings.write_failed", "无法保存 Provider 设置。")
        })?;
        fs::create_dir_all(parent)
            .map_err(|_| CommandError::new("settings.write_failed", "无法保存 Provider 设置。"))?;
        let payload = serde_json::json!({
            "base_url": provider.base_url,
            "api_key": provider.api_key,
            "model": provider.default_model
        });
        let bytes = serde_json::to_vec_pretty(&payload)
            .map_err(|_| CommandError::new("settings.write_failed", "无法保存 Provider 设置。"))?;
        fs::write(&self.settings_path, bytes)
            .map_err(|_| CommandError::new("settings.write_failed", "无法保存 Provider 设置。"))
    }
}

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
        CHSHAPI_BASE_URL.to_string()
    } else {
        clean
    }
}

fn clean_provider(
    input: ProviderInput,
    existing_key: Option<&str>,
) -> Result<ProviderInput, CommandError> {
    let name = input.name.trim().to_string();
    let base_url = normalize_base_url(&input.base_url);
    let api_key = input
        .api_key
        .trim()
        .to_string()
        .or_else_nonempty(existing_key);
    if name.is_empty() {
        return Err(CommandError::new(
            "provider.name_required",
            "请填写 provider 名称。",
        ));
    }
    if base_url.is_empty() {
        return Err(CommandError::new(
            "provider.base_url_required",
            "请填写 API 地址。",
        ));
    }
    if api_key.is_empty() {
        return Err(CommandError::new(
            "provider.api_key_required",
            "请填写 API Key。",
        ));
    }
    Ok(ProviderInput {
        name,
        base_url,
        api_key,
        default_model: defaulted_model(&input.default_model),
        is_default: input.is_default,
    })
}

fn public_provider(provider: ProviderRecord) -> ProviderDto {
    ProviderDto {
        id: provider.id,
        name: provider.name,
        base_url: provider.base_url,
        api_key: String::new(),
        api_key_set: !provider.api_key.is_empty(),
        default_model: provider.default_model,
        is_default: provider.is_default,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
    }
}

fn public_settings(provider: &ProviderRecord) -> SettingsDto {
    SettingsDto {
        base_url: provider.base_url.clone(),
        api_key: String::new(),
        api_key_set: !provider.api_key.is_empty(),
        model: provider.default_model.clone(),
    }
}

fn defaulted_model(value: &str) -> String {
    let clean = value.trim();
    if clean.is_empty() {
        DEFAULT_MODEL.to_string()
    } else {
        clean.to_string()
    }
}

fn environment_settings() -> ProviderRecord {
    ProviderRecord {
        id: 0,
        name: "Default".into(),
        base_url: normalize_base_url(&env::var("IMAGE_TOOLS_BASE_URL").unwrap_or_default()),
        api_key: env::var("IMAGE_TOOLS_API_KEY")
            .unwrap_or_default()
            .trim()
            .to_string(),
        default_model: defaulted_model(
            &env::var("IMAGE_TOOLS_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.into()),
        ),
        is_default: true,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn provider_not_found() -> CommandError {
    CommandError::new("provider.not_found", "Provider 不存在。")
}

trait NonEmptyFallback {
    fn or_else_nonempty(self, fallback: Option<&str>) -> String;
}

impl NonEmptyFallback for String {
    fn or_else_nonempty(self, fallback: Option<&str>) -> String {
        if self.is_empty() {
            fallback.unwrap_or_default().to_string()
        } else {
            self
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{normalize_base_url, ProviderService};
    use crate::workbench::{
        database::{providers::ProviderRepository, Database},
        models::{ProviderInput, SettingsInput},
    };

    struct ProviderFixture {
        _temporary: tempfile::TempDir,
        repository: ProviderRepository,
        service: ProviderService,
    }

    impl ProviderFixture {
        fn new() -> Self {
            let temporary = tempfile::tempdir().unwrap();
            let database =
                Arc::new(Database::open(&temporary.path().join("workbench.sqlite3")).unwrap());
            let repository = ProviderRepository::new(database);
            let service =
                ProviderService::new(repository.clone(), temporary.path().join("settings.json"));
            Self {
                _temporary: temporary,
                repository,
                service,
            }
        }
    }

    fn provider(name: &str, api_key: &str, is_default: bool) -> ProviderInput {
        ProviderInput {
            name: name.into(),
            base_url: format!("https://{}.example/v1/", name.to_lowercase()),
            api_key: api_key.into(),
            default_model: "gpt-image-2".into(),
            is_default,
        }
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
    fn normalizes_provider_urls_and_the_legacy_chshapi_endpoint() {
        assert_eq!(
            normalize_base_url(" api.example.com/v1/ "),
            "http://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://img-api.chshapi.org"),
            "https://img-api.chshapi.org/v1"
        );
    }

    #[test]
    fn blank_key_update_preserves_the_stored_secret() {
        let fixture = ProviderFixture::new();
        let created = fixture
            .service
            .create(provider("Primary", "sk-primary", true))
            .unwrap();

        let public = fixture
            .service
            .update(
                created.id,
                ProviderInput {
                    name: "Primary Updated".into(),
                    base_url: "https://api.updated.example/v1".into(),
                    api_key: String::new(),
                    default_model: "gpt-image-2-preview".into(),
                    is_default: true,
                },
            )
            .unwrap();

        assert!(public.api_key.is_empty());
        assert!(public.api_key_set);
        assert_eq!(fixture.repository.secret(created.id).unwrap(), "sk-primary");
    }

    #[test]
    fn setting_a_default_is_atomic_and_missing_ids_are_explicit() {
        let fixture = ProviderFixture::new();
        let first = fixture
            .service
            .create(provider("First", "sk-first", true))
            .unwrap();
        let second = fixture
            .service
            .create(provider("Second", "sk-second", false))
            .unwrap();

        fixture.service.set_default(second.id).unwrap();

        let providers = fixture.service.list().unwrap();
        assert_eq!(providers.len(), 2);
        assert!(!providers[0].is_default);
        assert!(providers[1].is_default);
        assert_eq!(providers[0].id, first.id);
        assert_eq!(providers[1].id, second.id);
        assert_eq!(
            fixture.service.get(999).unwrap_err().code,
            "provider.not_found"
        );
        assert_eq!(
            fixture
                .service
                .update(999, provider("Missing", "sk-missing", false))
                .unwrap_err()
                .code,
            "provider.not_found"
        );
        assert_eq!(
            fixture.service.set_default(999).unwrap_err().code,
            "provider.not_found"
        );
        fixture.service.delete(first.id).unwrap();
        assert_eq!(fixture.service.list().unwrap().len(), 1);
        assert_eq!(
            fixture.service.delete(first.id).unwrap_err().code,
            "provider.not_found"
        );
    }

    #[test]
    fn legacy_settings_imports_once_and_settings_updates_keep_the_key() {
        let fixture = ProviderFixture::new();
        std::fs::write(
            fixture.service.settings_path(),
            br#"{"base_url":"https://legacy.example/v1/","api_key":"sk-legacy","model":"gpt-image-2"}"#,
        )
        .unwrap();

        let first = fixture.service.list().unwrap();
        let second = fixture.service.list().unwrap();

        assert_eq!(first.len(), 1);
        assert_eq!(second.len(), 1);
        assert_eq!(first[0].name, "Default");
        assert_eq!(first[0].base_url, "https://legacy.example/v1");
        assert!(first[0].api_key_set);

        let settings = fixture
            .service
            .update_settings(SettingsInput {
                base_url: "https://updated.example/v1/".into(),
                api_key: String::new(),
                model: "gpt-image-2-preview".into(),
            })
            .unwrap();
        assert_eq!(settings.base_url, "https://updated.example/v1");
        assert_eq!(settings.model, "gpt-image-2-preview");
        assert!(settings.api_key.is_empty());
        assert!(settings.api_key_set);
        assert_eq!(fixture.repository.secret(first[0].id).unwrap(), "sk-legacy");
    }

    #[test]
    fn concurrent_legacy_import_creates_exactly_one_default_provider() {
        let temporary = tempfile::tempdir().unwrap();
        let database =
            Arc::new(Database::open(&temporary.path().join("workbench.sqlite3")).unwrap());
        let repository = ProviderRepository::new(database);
        let settings_path = temporary.path().join("settings.json");
        std::fs::write(
            &settings_path,
            br#"{"base_url":"https://legacy.example/v1","api_key":"sk-legacy","model":"gpt-image-2"}"#,
        )
        .unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let threads = (0..8)
            .map(|_| {
                let repository = repository.clone();
                let settings_path = settings_path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let service = ProviderService::new(repository, settings_path);
                    barrier.wait();
                    service.list().unwrap();
                })
            })
            .collect::<Vec<_>>();

        for thread in threads {
            thread.join().unwrap();
        }

        assert_eq!(repository.list().unwrap().len(), 1);
    }

    #[test]
    fn shared_public_contract_redacts_provider_and_settings_secrets() {
        let temporary = tempfile::tempdir().unwrap();
        let database_path = temporary.path().join("workbench.sqlite3");
        let connection = rusqlite::Connection::open(&database_path).unwrap();
        connection.execute_batch(&fixture("schema-v2.sql")).unwrap();
        drop(connection);
        let database = Arc::new(Database::open(&database_path).unwrap());
        let repository = ProviderRepository::new(database);
        let service = ProviderService::new(repository, temporary.path().join("settings.json"));
        let contract: serde_json::Value =
            serde_json::from_str(&fixture("public-contract.json")).unwrap();

        let input: ProviderInput =
            serde_json::from_value(contract["provider_input"].clone()).unwrap();
        let provider = service.list().unwrap().remove(0);
        let settings = service.settings().unwrap();

        let created_fixture = ProviderFixture::new();
        let created = created_fixture.service.create(input).unwrap();
        let expected = &contract["provider_public"];

        assert_eq!(created.name, expected["name"]);
        assert_eq!(created.base_url, expected["base_url"]);
        assert_eq!(created.api_key, expected["api_key"]);
        assert_eq!(created.api_key_set, expected["api_key_set"]);
        assert_eq!(created.default_model, expected["default_model"]);
        assert_eq!(created.is_default, expected["is_default"]);
        assert!(created.created_at.ends_with("+00:00"));
        assert!(created.updated_at.ends_with("+00:00"));
        assert_eq!(
            serde_json::to_value(provider).unwrap(),
            contract["provider_public"]
        );
        assert_eq!(
            serde_json::to_value(settings).unwrap(),
            contract["settings_public"]
        );
    }
}
