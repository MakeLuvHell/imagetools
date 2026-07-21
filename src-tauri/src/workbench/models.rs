use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderInput {
    #[serde(default = "default_provider_protocol")]
    pub protocol: String,
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

fn default_provider_protocol() -> String {
    "openai_compatible".to_string()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProviderDto {
    pub id: i64,
    pub protocol: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub api_key_set: bool,
    pub default_model: String,
    pub available_models: Vec<String>,
    pub models_refreshed_at: Option<String>,
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
    #[serde(default, deserialize_with = "deserialize_patch")]
    pub is_pinned: Patch<bool>,
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
    #[serde(default)]
    pub reference_image_id: Option<i64>,
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

pub fn utc_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Micros, false)
}

#[cfg(test)]
mod tests {
    use super::{utc_now, GenerateInput, Patch, ProviderDto, ProviderInput, SessionUpdateInput};

    #[test]
    fn generation_input_accepts_an_existing_image_id_without_a_token() {
        let input: GenerateInput = serde_json::from_value(serde_json::json!({
            "session_id": 1,
            "provider_id": 2,
            "prompt": "continue",
            "model": "gpt-image-2",
            "width": 1024,
            "height": 1024,
            "ratio": "1:1",
            "resolution": "standard",
            "count": 1,
            "quality": "auto",
            "output_format": "png",
            "output_compression": 100,
            "background": "auto",
            "moderation": "auto",
            "reference_image_id": 42
        }))
        .unwrap();

        assert_eq!(input.reference_image_id, Some(42));
        assert_eq!(input.reference_token, None);
    }

    #[test]
    fn provider_input_uses_current_snake_case_fields_and_defaults() {
        let input: ProviderInput = serde_json::from_value(serde_json::json!({
            "name": "Primary",
            "base_url": "https://api.example.com/v1"
        }))
        .unwrap();

        assert_eq!(input.name, "Primary");
        assert_eq!(input.protocol, "openai_compatible");
        assert_eq!(input.base_url, "https://api.example.com/v1");
        assert_eq!(input.api_key, "");
        assert_eq!(input.default_model, "gpt-image-2");
        assert!(!input.is_default);
    }

    #[test]
    fn provider_dto_serializes_a_redacted_snake_case_contract() {
        let provider = ProviderDto {
            id: 7,
            protocol: "xai_images".into(),
            name: "Primary".into(),
            base_url: "https://api.example.com/v1".into(),
            api_key: String::new(),
            api_key_set: true,
            default_model: "gpt-image-2".into(),
            available_models: vec!["grok-imagine-image".into()],
            models_refreshed_at: Some("2026-07-20T00:00:00.000000+00:00".into()),
            is_default: true,
            created_at: "2026-07-16T00:00:00.000000+00:00".into(),
            updated_at: "2026-07-16T00:00:00.000000+00:00".into(),
        };

        assert_eq!(
            serde_json::to_value(provider).unwrap(),
            serde_json::json!({
                "id": 7,
                "protocol": "xai_images",
                "name": "Primary",
                "base_url": "https://api.example.com/v1",
                "api_key": "",
                "api_key_set": true,
                "default_model": "gpt-image-2",
                "available_models": ["grok-imagine-image"],
                "models_refreshed_at": "2026-07-20T00:00:00.000000+00:00",
                "is_default": true,
                "created_at": "2026-07-16T00:00:00.000000+00:00",
                "updated_at": "2026-07-16T00:00:00.000000+00:00"
            })
        );
    }

    #[test]
    fn session_update_distinguishes_missing_null_and_value_project_ids() {
        let missing: SessionUpdateInput = serde_json::from_value(serde_json::json!({})).unwrap();
        let null: SessionUpdateInput =
            serde_json::from_value(serde_json::json!({ "project_id": null })).unwrap();
        let value: SessionUpdateInput =
            serde_json::from_value(serde_json::json!({ "project_id": 42 })).unwrap();

        assert_eq!(missing.project_id, Patch::Missing);
        assert_eq!(null.project_id, Patch::Value(None));
        assert_eq!(value.project_id, Patch::Value(Some(42)));
    }

    #[test]
    fn session_update_distinguishes_missing_null_and_boolean_pin_values() {
        let missing: SessionUpdateInput = serde_json::from_value(serde_json::json!({})).unwrap();
        let null: SessionUpdateInput =
            serde_json::from_value(serde_json::json!({ "is_pinned": null })).unwrap();
        let value: SessionUpdateInput =
            serde_json::from_value(serde_json::json!({ "is_pinned": false })).unwrap();

        assert_eq!(missing.is_pinned, Patch::Missing);
        assert_eq!(null.is_pinned, Patch::Value(None));
        assert_eq!(value.is_pinned, Patch::Value(Some(false)));
    }

    #[test]
    fn utc_timestamp_matches_python_microsecond_representation() {
        let timestamp = utc_now();
        let (date_time, offset) = timestamp.rsplit_once('+').unwrap();
        let (_, fractional) = date_time.rsplit_once('.').unwrap();

        assert_eq!(offset, "00:00");
        assert_eq!(fractional.len(), 6);
        assert!(fractional.bytes().all(|byte| byte.is_ascii_digit()));
    }
}
