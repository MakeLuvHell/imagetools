use crate::workbench::{
    error::CommandError,
    generation::{
        adapters::normalized::NormalizedImageRequest,
        client::{
            ProviderImage, ProviderResponse, CONNECT_TIMEOUT, MAX_PROVIDER_RESPONSE_BYTES,
            READ_TIMEOUT,
        },
        EditRequest, GenerationRequest, ProviderTransport,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::Client;
use std::{future::Future, pin::Pin};

const MODEL_SEGMENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'/')
    .add(b':')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

pub struct GeminiAdapter {
    base_url: String,
    api_key: String,
    http: Client,
}

impl GeminiAdapter {
    pub fn new(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
    ) -> Result<Self, CommandError> {
        let base_url = base_url.into().trim().trim_end_matches('/').to_string();
        if base_url.is_empty() {
            return Err(CommandError::new(
                "provider.missing_url",
                "请先填写 API 地址。",
            ));
        }
        let api_key = api_key.into().trim().to_string();
        if api_key.is_empty() {
            return Err(CommandError::new(
                "provider.missing_key",
                "请先填写 API Key。",
            ));
        }
        let http = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| CommandError::new("provider.connect_failed", "无法初始化接口连接。"))?;
        Ok(Self {
            base_url,
            api_key,
            http,
        })
    }

    async fn send(
        &self,
        request: &NormalizedImageRequest,
    ) -> Result<ProviderResponse, CommandError> {
        let response = self
            .http
            .post(generation_url(&self.base_url, &request.model))
            .header("x-goog-api-key", &self.api_key)
            .json(&build_payload(request)?)
            .send()
            .await
            .map_err(map_request_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(match status.as_u16() {
                401 | 403 => {
                    CommandError::new("provider.auth_failed", "API Key 无效或没有图片生成权限。")
                }
                429 => CommandError::new("provider.rate_limited", "请求过于频繁，请稍后重试。"),
                _ => CommandError::new(
                    "provider.http_error",
                    format!("接口返回错误 {}。", status.as_u16()),
                ),
            });
        }
        let bytes = read_bounded(response, MAX_PROVIDER_RESPONSE_BYTES).await?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| invalid_response())?;
        let data = value
            .get("candidates")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|candidate| candidate.pointer("/content/parts")?.as_array())
            .flatten()
            .filter_map(|part| part.get("inlineData"))
            .filter_map(|inline| inline.get("data").and_then(serde_json::Value::as_str))
            .filter(|data| !data.is_empty())
            .map(|data| ProviderImage {
                b64_json: Some(data.to_string()),
                url: None,
            })
            .collect::<Vec<_>>();
        if data.is_empty() {
            if is_safety_blocked(&value) {
                return Err(CommandError::new(
                    "provider.safety_blocked",
                    "请求被内容安全策略拦截。",
                ));
            }
            return Err(invalid_response());
        }
        Ok(ProviderResponse { data })
    }
}

fn is_safety_blocked(value: &serde_json::Value) -> bool {
    let prompt_blocked = value
        .pointer("/promptFeedback/blockReason")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|reason| {
            !reason.is_empty() && !reason.eq_ignore_ascii_case("BLOCK_REASON_UNSPECIFIED")
        });
    let prompt_rating_blocked = ratings_blocked(value.pointer("/promptFeedback/safetyRatings"));
    let candidate_blocked = value
        .get("candidates")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|candidates| {
            candidates.iter().any(|candidate| {
                let finish_reason = candidate
                    .get("finishReason")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_ascii_uppercase();
                finish_reason.contains("SAFETY")
                    || finish_reason.contains("PROHIBITED_CONTENT")
                    || ratings_blocked(candidate.get("safetyRatings"))
            })
        });
    prompt_blocked || prompt_rating_blocked || candidate_blocked
}

fn ratings_blocked(ratings: Option<&serde_json::Value>) -> bool {
    ratings
        .and_then(serde_json::Value::as_array)
        .is_some_and(|ratings| {
            ratings.iter().any(|rating| {
                rating.get("blocked").and_then(serde_json::Value::as_bool) == Some(true)
            })
        })
}

impl ProviderTransport for GeminiAdapter {
    fn generate_image<'a>(
        &'a self,
        request: &'a NormalizedImageRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async move { self.send(request).await })
    }

    fn generate<'a>(
        &'a self,
        _request: &'a GenerationRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async { Err(unsupported_entrypoint()) })
    }

    fn edit<'a>(
        &'a self,
        _request: &'a EditRequest,
        _filename: String,
        _mime_type: &'a str,
        _image: Vec<u8>,
    ) -> Pin<Box<dyn Future<Output = Result<ProviderResponse, CommandError>> + Send + 'a>> {
        Box::pin(async { Err(unsupported_entrypoint()) })
    }
}

fn generation_url(base_url: &str, model: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let versioned = if base.ends_with("/v1beta") {
        base.to_string()
    } else {
        format!("{base}/v1beta")
    };
    let model = model.trim().strip_prefix("models/").unwrap_or(model.trim());
    format!(
        "{versioned}/models/{}:generateContent",
        utf8_percent_encode(model, MODEL_SEGMENT_ENCODE_SET)
    )
}

async fn read_bounded(response: reqwest::Response, limit: usize) -> Result<Vec<u8>, CommandError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(response_too_large());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(map_request_error)?;
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err(response_too_large());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn map_request_error(error: reqwest::Error) -> CommandError {
    if error.is_timeout() {
        CommandError::new("provider.timeout", "接口响应超时。")
    } else {
        CommandError::new("provider.connect_failed", "无法连接接口。")
    }
}

fn invalid_response() -> CommandError {
    CommandError::new("provider.invalid_response", "接口返回格式不正确。")
}

fn response_too_large() -> CommandError {
    CommandError::new("provider.response_too_large", "接口响应数据过大。")
}

fn unsupported_entrypoint() -> CommandError {
    CommandError::new(
        "provider.unsupported_capability",
        "Gemini 适配器仅支持统一图片请求。",
    )
}

fn build_payload(request: &NormalizedImageRequest) -> Result<serde_json::Value, CommandError> {
    if request.count != 1 {
        return Err(CommandError::new(
            "provider.unsupported_capability",
            "Gemini 每次只支持生成一张图片。",
        ));
    }
    let image_size = if request.model == "gemini-3-pro-image" {
        match request.resolution.as_str() {
            "standard" => "1K",
            "medium" => "2K",
            "large" => "4K",
            _ => {
                return Err(CommandError::new(
                    "provider.unsupported_capability",
                    "Gemini 不支持所选分辨率。",
                ))
            }
        }
    } else {
        "1K"
    };
    let mut parts = vec![serde_json::json!({"text": request.prompt})];
    parts.extend(request.references.iter().map(|reference| {
        serde_json::json!({
            "inlineData": {
                "mimeType": reference.mime_type,
                "data": STANDARD.encode(&reference.bytes),
            }
        })
    }));
    Ok(serde_json::json!({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": request.aspect_ratio,
                "imageSize": image_size,
            }
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::{build_payload, GeminiAdapter};
    use crate::workbench::generation::adapters::normalized::{
        NormalizedImageRequest, NormalizedReference, OpenAiOptions,
    };
    use crate::workbench::{error::CommandError, generation::ProviderTransport};
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        thread,
        time::Duration,
    };

    const SECRET: &str = "gemini-test-secret";

    fn request(model: &str, resolution: &str) -> NormalizedImageRequest {
        NormalizedImageRequest {
            prompt: "把产品放在桌面上".into(),
            model: model.into(),
            count: 1,
            aspect_ratio: "16:9".into(),
            resolution: resolution.into(),
            size: "1536x864".into(),
            references: vec![
                NormalizedReference {
                    filename: "first.png".into(),
                    mime_type: "image/png".into(),
                    bytes: vec![1, 2, 3],
                },
                NormalizedReference {
                    filename: "second.webp".into(),
                    mime_type: "image/webp".into(),
                    bytes: vec![4, 5, 6],
                },
            ],
            openai_options: OpenAiOptions {
                quality: "auto".into(),
                output_format: "png".into(),
                output_compression: 100,
                background: "auto".into(),
                moderation: "auto".into(),
            },
        }
    }

    #[test]
    fn payload_places_prompt_before_ordered_images_and_maps_pro_to_2k() {
        assert_eq!(
            build_payload(&request("gemini-3-pro-image", "medium")).unwrap(),
            serde_json::json!({
                "contents": [{
                    "parts": [
                        {"text": "把产品放在桌面上"},
                        {"inlineData": {"mimeType": "image/png", "data": "AQID"}},
                        {"inlineData": {"mimeType": "image/webp", "data": "BAUG"}}
                    ]
                }],
                "generationConfig": {
                    "responseModalities": ["IMAGE"],
                    "imageConfig": {
                        "aspectRatio": "16:9",
                        "imageSize": "2K"
                    }
                }
            })
        );
    }

    #[tokio::test]
    async fn encodes_model_path_uses_google_key_and_extracts_only_inline_images() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let captured = read_request(&mut stream);
            assert_eq!(captured.0, "POST");
            assert_eq!(
                captured.1,
                "/v1beta/models/team%2Fcustom%20image:generateContent"
            );
            assert_eq!(
                captured.2.get("x-goog-api-key").map(String::as_str),
                Some(SECRET)
            );
            assert!(!captured.2.contains_key("authorization"));
            let body = r#"{"candidates":[{"content":{"parts":[{"text":"ignored"},{"thought":true,"text":"hidden"},{"inlineData":{"mimeType":"image/png","data":"AQID"}},{"inlineData":{"mimeType":"image/webp","data":""}}]}}]}"#;
            write_response(&mut stream, 200, body);
        });
        let adapter = GeminiAdapter::new(format!("http://{address}"), SECRET).unwrap();
        let mut input = request("team/custom image", "standard");
        input.references.clear();

        let response = adapter.generate_image(&input).await.unwrap();
        server.join().unwrap();

        assert_eq!(response.data.len(), 1);
        assert_eq!(response.data[0].b64_json.as_deref(), Some("AQID"));
        assert_eq!(response.data[0].url, None);
    }

    #[tokio::test]
    async fn distinguishes_proven_safety_blocks_from_invalid_success_responses() {
        let safety =
            response_error(r#"{"promptFeedback":{"blockReason":"SAFETY"},"candidates":[]}"#).await;
        let malformed =
            response_error(r#"{"candidates":[{"content":{"parts":[{"text":"no image"}]}}]}"#).await;

        assert_eq!(safety.code, "provider.safety_blocked");
        assert_eq!(malformed.code, "provider.invalid_response");
    }

    async fn response_error(body: &'static str) -> CommandError {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = read_request(&mut stream);
            write_response(&mut stream, 200, body);
        });
        let adapter = GeminiAdapter::new(format!("http://{address}"), SECRET).unwrap();
        let mut input = request("gemini-2.5-flash-image", "standard");
        input.references.clear();
        let error = adapter.generate_image(&input).await.unwrap_err();
        server.join().unwrap();
        error
    }

    fn read_request(stream: &mut TcpStream) -> (String, String, HashMap<String, String>, Vec<u8>) {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 4096];
        let header_end = loop {
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0);
            bytes.extend_from_slice(&buffer[..read]);
            if let Some(index) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                break index + 4;
            }
        };
        let header_text = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
        let mut lines = header_text.split("\r\n");
        let mut request_line = lines.next().unwrap().split_whitespace();
        let method = request_line.next().unwrap().to_string();
        let path = request_line.next().unwrap().to_string();
        let headers = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.to_ascii_lowercase(), value.trim().to_string()))
            .collect::<HashMap<_, _>>();
        let content_length = headers
            .get("content-length")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        while bytes.len() - header_end < content_length {
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0);
            bytes.extend_from_slice(&buffer[..read]);
        }
        (
            method,
            path,
            headers,
            bytes[header_end..header_end + content_length].to_vec(),
        )
    }

    fn write_response(stream: &mut TcpStream, status: u16, body: &str) {
        write!(
            stream,
            "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    }
}
