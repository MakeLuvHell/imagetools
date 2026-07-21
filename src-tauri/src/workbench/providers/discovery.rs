use std::{collections::HashSet, time::Duration};

use futures_util::StreamExt;
use reqwest::{header::CONTENT_TYPE, StatusCode};

use crate::workbench::{
    error::CommandError,
    generation::{adapters::normalized::ProviderProtocol, join_api_url},
};

const MAX_MODEL_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_MODELS: usize = 256;
const MAX_MODEL_ID_CHARS: usize = 200;

pub(super) fn recommended_models(protocol: ProviderProtocol) -> &'static [&'static str] {
    match protocol {
        ProviderProtocol::OpenAiCompatible => &["gpt-image-2"],
        ProviderProtocol::XaiImages => &[
            "grok-imagine-image",
            "grok-imagine-image-pro",
            "grok-imagine-image-quality",
        ],
        ProviderProtocol::GeminiNative => &["gemini-3-pro-image", "gemini-2.5-flash-image"],
    }
}

pub(super) fn model_list_url(protocol: ProviderProtocol, base_url: &str) -> String {
    match protocol {
        ProviderProtocol::OpenAiCompatible | ProviderProtocol::XaiImages => {
            join_api_url(base_url, "/v1/models")
        }
        ProviderProtocol::GeminiNative => join_api_url(base_url, "/v1beta/models"),
    }
}

pub(super) fn parse_models(
    protocol: ProviderProtocol,
    bytes: &[u8],
) -> Result<Vec<String>, CommandError> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| model_list_failed())?;
    let items = match protocol {
        ProviderProtocol::OpenAiCompatible | ProviderProtocol::XaiImages => {
            value.get("data").and_then(serde_json::Value::as_array)
        }
        ProviderProtocol::GeminiNative => value.get("models").and_then(serde_json::Value::as_array),
    }
    .ok_or_else(model_list_failed)?;

    let mut returned = Vec::new();
    let mut seen = HashSet::new();
    for item in items.iter().take(MAX_MODELS) {
        let field = if protocol == ProviderProtocol::GeminiNative {
            "name"
        } else {
            "id"
        };
        let Some(raw) = item.get(field).and_then(serde_json::Value::as_str) else {
            continue;
        };
        let clean = raw.trim().strip_prefix("models/").unwrap_or(raw.trim());
        if clean.is_empty() || clean.chars().count() > MAX_MODEL_ID_CHARS {
            continue;
        }
        if seen.insert(clean.to_string()) {
            returned.push(clean.to_string());
        }
    }

    let mut models = Vec::new();
    for recommended in recommended_models(protocol) {
        if !models.iter().any(|model| model == recommended) {
            models.push((*recommended).to_string());
        }
    }
    for model in returned {
        if !models.contains(&model) {
            models.push(model);
        }
    }
    if models.is_empty() {
        return Err(model_list_failed());
    }
    Ok(models)
}

pub(super) async fn fetch_models(
    protocol: ProviderProtocol,
    base_url: &str,
    api_key: &str,
) -> Result<Vec<String>, CommandError> {
    if base_url.trim().is_empty() {
        return Err(CommandError::new(
            "provider.base_url_required",
            "请填写 API 地址。",
        ));
    }
    if api_key.trim().is_empty() {
        return Err(CommandError::new(
            "provider.api_key_required",
            "请填写 API Key。",
        ));
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| connect_failed())?;
    let request = client.get(model_list_url(protocol, base_url));
    let request = match protocol {
        ProviderProtocol::GeminiNative => request.header("x-goog-api-key", api_key.trim()),
        _ => request.bearer_auth(api_key.trim()),
    };
    let response = request.send().await.map_err(|_| connect_failed())?;
    let status = response.status();
    if !status.is_success() {
        return Err(status_error(status));
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.contains("json") {
        return Err(model_list_failed());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MODEL_RESPONSE_BYTES as u64)
    {
        return Err(model_list_failed());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| connect_failed())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_MODEL_RESPONSE_BYTES {
            return Err(model_list_failed());
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_models(protocol, &bytes)
}

fn status_error(status: StatusCode) -> CommandError {
    match status.as_u16() {
        401 | 403 => CommandError::new("provider.auth_failed", "Provider 身份验证失败。"),
        429 => CommandError::new("provider.rate_limited", "Provider 请求过于频繁。"),
        _ => model_list_failed(),
    }
}

fn connect_failed() -> CommandError {
    CommandError::new("provider.connect_failed", "无法连接 Provider。")
}

fn model_list_failed() -> CommandError {
    CommandError::new("provider.model_list_failed", "无法获取可用模型。")
}

#[cfg(test)]
mod tests {
    use super::{model_list_url, parse_models, recommended_models};
    use crate::workbench::generation::adapters::normalized::ProviderProtocol;

    #[test]
    fn model_list_urls_do_not_duplicate_version_segments() {
        assert_eq!(
            model_list_url(
                ProviderProtocol::OpenAiCompatible,
                "https://api.example.com/v1"
            ),
            "https://api.example.com/v1/models"
        );
        assert_eq!(
            model_list_url(ProviderProtocol::XaiImages, "https://api.x.ai/v1"),
            "https://api.x.ai/v1/models"
        );
        assert_eq!(
            model_list_url(
                ProviderProtocol::GeminiNative,
                "https://generativelanguage.googleapis.com"
            ),
            "https://generativelanguage.googleapis.com/v1beta/models"
        );
    }

    #[test]
    fn parses_unique_bounded_models_and_pins_recommendations_first() {
        let body = br#"{"data":[{"id":"other"},{"id":"gpt-image-2"},{"id":"other"},{"id":""}]}"#;
        assert_eq!(
            parse_models(ProviderProtocol::OpenAiCompatible, body).unwrap(),
            vec!["gpt-image-2", "other"]
        );

        let gemini =
            br#"{"models":[{"name":"models/custom-image"},{"name":"models/gemini-3-pro-image"}]}"#;
        assert_eq!(
            parse_models(ProviderProtocol::GeminiNative, gemini).unwrap(),
            vec![
                "gemini-3-pro-image",
                "gemini-2.5-flash-image",
                "custom-image"
            ]
        );
        assert_eq!(recommended_models(ProviderProtocol::XaiImages).len(), 3);
    }
}
