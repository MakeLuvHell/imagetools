use crate::workbench::{
    error::CommandError,
    generation::{
        adapters::normalized::NormalizedImageRequest,
        client::{
            ProviderImage, ProviderResponse, CONNECT_TIMEOUT, MAX_PROVIDER_RESPONSE_BYTES,
            READ_TIMEOUT,
        },
        join_api_url, EditRequest, GenerationRequest, ProviderTransport,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use reqwest::Client;
use std::{future::Future, pin::Pin};

pub struct XaiAdapter {
    base_url: String,
    api_key: String,
    http: Client,
}

impl XaiAdapter {
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
        let path = if request.references.is_empty() {
            "/images/generations"
        } else {
            "/images/edits"
        };
        let response = self
            .http
            .post(join_api_url(&self.base_url, path))
            .bearer_auth(&self.api_key)
            .json(&build_payload(request)?)
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    CommandError::new("provider.timeout", "接口响应超时。")
                } else {
                    CommandError::new("provider.connect_failed", "无法连接接口。")
                }
            })?;
        let status = response.status();
        if !status.is_success() {
            return Err(if matches!(status.as_u16(), 401 | 403) {
                CommandError::new("provider.auth_failed", "API Key 无效或没有图片生成权限。")
            } else if status.as_u16() == 429 {
                CommandError::new("provider.rate_limited", "请求过于频繁，请稍后重试。")
            } else {
                let body = String::from_utf8_lossy(&read_bounded(response, 64 * 1024).await?)
                    .to_ascii_lowercase();
                if body.contains("safety")
                    || body.contains("content policy")
                    || body.contains("policy violation")
                {
                    CommandError::new("provider.safety_blocked", "请求被内容安全策略拦截。")
                } else if body.contains("unsupported") || body.contains("not supported") {
                    CommandError::new(
                        "provider.unsupported_capability",
                        "xAI 不支持所选生成参数。",
                    )
                } else {
                    CommandError::new(
                        "provider.http_error",
                        format!("接口返回错误 {}。", status.as_u16()),
                    )
                }
            });
        }
        let bytes = read_bounded(response, MAX_PROVIDER_RESPONSE_BYTES).await?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| invalid_response())?;
        let data = value
            .get("data")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(invalid_response)?
            .iter()
            .filter_map(|item| serde_json::from_value::<ProviderImage>(item.clone()).ok())
            .filter(|item| {
                !item.b64_json.as_deref().unwrap_or("").is_empty()
                    || !item.url.as_deref().unwrap_or("").is_empty()
            })
            .collect::<Vec<_>>();
        if data.is_empty() {
            return Err(invalid_response());
        }
        Ok(ProviderResponse { data })
    }
}

async fn read_bounded(response: reqwest::Response, limit: usize) -> Result<Vec<u8>, CommandError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(CommandError::new(
            "provider.response_too_large",
            "接口响应数据过大。",
        ));
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            if error.is_timeout() {
                CommandError::new("provider.timeout", "接口响应超时。")
            } else {
                CommandError::new("provider.connect_failed", "无法读取接口响应。")
            }
        })?;
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err(CommandError::new(
                "provider.response_too_large",
                "接口响应数据过大。",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

impl ProviderTransport for XaiAdapter {
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

fn invalid_response() -> CommandError {
    CommandError::new("provider.invalid_response", "接口返回格式不正确。")
}

fn unsupported_entrypoint() -> CommandError {
    CommandError::new(
        "provider.unsupported_capability",
        "xAI 适配器仅支持统一图片请求。",
    )
}

fn build_payload(request: &NormalizedImageRequest) -> Result<serde_json::Value, CommandError> {
    let mut payload = serde_json::json!({
        "model": request.model,
        "prompt": request.prompt,
        "n": request.count,
        "aspect_ratio": request.aspect_ratio,
        "resolution": match request.resolution.as_str() {
            "standard" => "1k",
            "medium" | "large" => "2k",
            _ => return Err(CommandError::new(
                "provider.unsupported_capability",
                "xAI 不支持所选分辨率。",
            )),
        },
        "response_format": "b64_json",
    });
    let images = request
        .references
        .iter()
        .map(|reference| {
            serde_json::json!({
                "url": format!(
                    "data:{};base64,{}",
                    reference.mime_type,
                    STANDARD.encode(&reference.bytes)
                )
            })
        })
        .collect::<Vec<_>>();
    if images.len() == 1 {
        payload["image"] = images[0].clone();
    } else if !images.is_empty() {
        payload["images"] = serde_json::Value::Array(images);
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::{build_payload, XaiAdapter};
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

    const SECRET: &str = "xai-test-secret";

    fn request() -> NormalizedImageRequest {
        NormalizedImageRequest {
            prompt: "产品图".into(),
            model: "grok-imagine-image-quality".into(),
            count: 2,
            aspect_ratio: "16:9".into(),
            resolution: "standard".into(),
            size: "1536x864".into(),
            references: vec![],
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
    fn generation_payload_maps_shared_fields_and_omits_references() {
        assert_eq!(
            build_payload(&request()).unwrap(),
            serde_json::json!({
                "model": "grok-imagine-image-quality",
                "prompt": "产品图",
                "n": 2,
                "aspect_ratio": "16:9",
                "resolution": "1k",
                "response_format": "b64_json"
            })
        );
    }

    #[test]
    fn edit_payload_uses_singular_image_then_ordered_images() {
        let references = vec![
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
            NormalizedReference {
                filename: "third.jpeg".into(),
                mime_type: "image/jpeg".into(),
                bytes: vec![7, 8, 9],
            },
        ];
        let mut one = request();
        one.references = references[..1].to_vec();
        let mut three = request();
        three.references = references;

        assert_eq!(
            build_payload(&one).unwrap()["image"],
            serde_json::json!({"url": "data:image/png;base64,AQID"})
        );
        assert!(build_payload(&one).unwrap().get("images").is_none());
        assert_eq!(
            build_payload(&three).unwrap()["images"],
            serde_json::json!([
                {"url": "data:image/png;base64,AQID"},
                {"url": "data:image/webp;base64,BAUG"},
                {"url": "data:image/jpeg;base64,BwgJ"}
            ])
        );
        assert!(build_payload(&three).unwrap().get("image").is_none());
    }

    #[tokio::test]
    async fn sends_bearer_json_and_normalizes_url_and_base64_results() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let captured = read_request(&mut stream);
            assert_eq!(captured.0, "POST");
            assert_eq!(captured.1, "/v1/images/generations");
            assert_eq!(
                captured.2.get("authorization").map(String::as_str),
                Some("Bearer xai-test-secret")
            );
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&captured.3).unwrap(),
                build_payload(&request()).unwrap()
            );
            let body = r#"{"data":[{"url":"https://cdn.example/result.png"},{"b64_json":"AQID"}]}"#;
            write_response(&mut stream, 200, body);
        });
        let adapter = XaiAdapter::new(format!("http://{address}/v1"), SECRET).unwrap();

        let response = adapter.generate_image(&request()).await.unwrap();
        server.join().unwrap();

        assert_eq!(response.data.len(), 2);
        assert_eq!(
            response.data[0].url.as_deref(),
            Some("https://cdn.example/result.png")
        );
        assert_eq!(response.data[1].b64_json.as_deref(), Some("AQID"));
    }

    #[tokio::test]
    async fn maps_authentication_errors_without_leaking_secrets_or_response_bodies() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = read_request(&mut stream);
            write_response(
                &mut stream,
                401,
                r#"{"error":"bad xai-test-secret data:image/png;base64,PRIVATE"}"#,
            );
        });
        let adapter = XaiAdapter::new(format!("http://{address}/v1"), SECRET).unwrap();

        let error = adapter.generate_image(&request()).await.unwrap_err();
        server.join().unwrap();

        assert_eq!(error.code, "provider.auth_failed");
        let serialized = serde_json::to_string(&error).unwrap();
        assert!(!serialized.contains(SECRET));
        assert!(!serialized.contains("data:image"));
        assert!(!serialized.contains("PRIVATE"));
    }

    #[tokio::test]
    async fn classifies_rate_limit_safety_and_unsupported_errors() {
        assert_eq!(
            request_error(429, r#"{"error":"too many requests"}"#)
                .await
                .code,
            "provider.rate_limited"
        );
        assert_eq!(
            request_error(400, r#"{"error":"request blocked by safety policy"}"#)
                .await
                .code,
            "provider.safety_blocked"
        );
        assert_eq!(
            request_error(400, r#"{"error":"unsupported aspect ratio"}"#)
                .await
                .code,
            "provider.unsupported_capability"
        );
    }

    async fn request_error(status: u16, body: &'static str) -> CommandError {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = read_request(&mut stream);
            write_response(&mut stream, status, body);
        });
        let adapter = XaiAdapter::new(format!("http://{address}/v1"), SECRET).unwrap();
        let error = adapter.generate_image(&request()).await.unwrap_err();
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
