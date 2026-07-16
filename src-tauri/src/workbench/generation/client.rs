use super::files::sanitize_reference_filename;
use super::{
    build_edit_fields, build_generation_payload, join_api_url, EditRequest, GenerationRequest,
};
use crate::workbench::error::CommandError;
use futures_util::StreamExt;
use reqwest::{
    header::CONTENT_TYPE,
    multipart::{Form, Part},
    Client, Response,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub const READ_TIMEOUT: Duration = Duration::from_secs(300);
pub const MAX_PROVIDER_RESPONSE_BYTES: usize = 192 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderImage {
    #[serde(default)]
    pub b64_json: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderResponse {
    pub data: Vec<ProviderImage>,
}

#[derive(Clone)]
pub struct ProviderClient {
    base_url: String,
    api_key: String,
    http: Client,
}

impl ProviderClient {
    pub fn new(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
    ) -> Result<Self, CommandError> {
        Self::build(
            base_url.into(),
            api_key.into(),
            CONNECT_TIMEOUT,
            READ_TIMEOUT,
        )
    }

    #[cfg(test)]
    fn with_timeouts(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        connect_timeout: Duration,
        read_timeout: Duration,
    ) -> Result<Self, CommandError> {
        Self::build(
            base_url.into(),
            api_key.into(),
            connect_timeout,
            read_timeout,
        )
    }

    fn build(
        base_url: String,
        api_key: String,
        connect_timeout: Duration,
        read_timeout: Duration,
    ) -> Result<Self, CommandError> {
        let base_url = base_url.trim().trim_end_matches('/').to_string();
        if base_url.is_empty() {
            return Err(CommandError::new(
                "provider.missing_url",
                "请先填写 API 地址。",
            ));
        }
        let api_key = api_key.trim().to_string();
        if api_key.is_empty() {
            return Err(CommandError::new(
                "provider.missing_key",
                "请先填写 API Key。",
            ));
        }
        let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 10 {
                return attempt.error("too many redirects");
            }
            if attempt
                .previous()
                .last()
                .is_some_and(|previous| !allows_redirect(previous, attempt.url()))
            {
                return attempt.stop();
            }
            attempt.follow()
        });
        let http = Client::builder()
            .connect_timeout(connect_timeout)
            .read_timeout(read_timeout)
            .redirect(redirect_policy)
            .build()
            .map_err(|_| transport_error("provider.connect_failed", "无法初始化接口连接。"))?;
        Ok(Self {
            base_url,
            api_key,
            http,
        })
    }

    pub async fn generate(
        &self,
        request: &GenerationRequest,
    ) -> Result<ProviderResponse, CommandError> {
        let url = join_api_url(&self.base_url, "/v1/images/generations");
        let response = self
            .http
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&build_generation_payload(request))
            .send()
            .await
            .map_err(map_request_error)?;
        parse_response(response).await
    }

    pub async fn edit(
        &self,
        request: &EditRequest,
        filename: impl Into<String>,
        mime_type: &str,
        image: Vec<u8>,
    ) -> Result<ProviderResponse, CommandError> {
        let filename = sanitize_reference_filename(&filename.into(), mime_type)?;
        let image = Part::bytes(image)
            .file_name(filename)
            .mime_str(mime_type)
            .map_err(|_| CommandError::new("provider.invalid_response", "参考图类型无效。"))?;
        let mut form = Form::new().part("image", image);
        for (name, value) in build_edit_fields(request) {
            form = form.text(name, value);
        }
        let url = join_api_url(&self.base_url, "/v1/images/edits");
        let response = self
            .http
            .post(url)
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(map_request_error)?;
        parse_response(response).await
    }
}

fn allows_redirect(previous: &reqwest::Url, next: &reqwest::Url) -> bool {
    previous.scheme() != "https" || next.scheme() == "https"
}

async fn parse_response(response: Response) -> Result<ProviderResponse, CommandError> {
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bytes = read_response_bytes(response, MAX_PROVIDER_RESPONSE_BYTES).await?;
    if !status.is_success() {
        let body = String::from_utf8_lossy(&bytes).to_ascii_lowercase();
        let message = if matches!(status.as_u16(), 500 | 503 | 504) {
            format!("接口服务器异常 {}。", status.as_u16())
        } else if content_type.contains("html")
            || body.contains("<html")
            || body.contains("<!doctype")
        {
            format!(
                "接口返回了网页错误页，不是 API JSON 响应。状态码：{}。",
                status.as_u16()
            )
        } else {
            format!("接口返回错误 {}。", status.as_u16())
        };
        return Err(CommandError::new("provider.http_error", message));
    }
    if !content_type.contains("json") {
        return Err(CommandError::new(
            "provider.non_json",
            "接口返回的不是 JSON。",
        ));
    }

    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| CommandError::new("provider.invalid_json", "接口返回 JSON 无法解析。"))?;
    let data = value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(invalid_response)?;
    let data = data
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

async fn read_response_bytes(response: Response, limit: usize) -> Result<Vec<u8>, CommandError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(provider_response_too_large());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(map_request_error)?;
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err(provider_response_too_large());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn map_request_error(error: reqwest::Error) -> CommandError {
    if error.is_timeout() {
        transport_error("provider.timeout", "接口响应超时。")
    } else {
        transport_error("provider.connect_failed", "无法连接接口。")
    }
}

fn invalid_response() -> CommandError {
    CommandError::new("provider.invalid_response", "接口返回格式不正确。")
}

fn provider_response_too_large() -> CommandError {
    CommandError::new(
        "provider.response_too_large",
        "接口响应数据过大，请减少生成张数或图片尺寸。",
    )
}

fn transport_error(code: &'static str, message: &'static str) -> CommandError {
    CommandError::new(code, message)
}

#[cfg(test)]
mod tests {
    use super::{
        allows_redirect, read_response_bytes, ProviderClient, ProviderResponse, CONNECT_TIMEOUT,
        MAX_PROVIDER_RESPONSE_BYTES, READ_TIMEOUT,
    };
    use crate::workbench::generation::{EditRequest, GenerationRequest};
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::{Arc, Mutex},
        thread,
        time::{Duration, Instant},
    };

    const SECRET: &str = "sk-local-fixture-secret";
    const PNG_FIXTURE: &str =
        include_str!("../../../../tests/fixtures/backend-contracts/image-success.json");
    const URL_FIXTURE: &str =
        include_str!("../../../../tests/fixtures/backend-contracts/image-url-success.json");

    #[derive(Debug, Clone)]
    struct TestRequest {
        method: String,
        path: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    }

    fn generation_request() -> GenerationRequest {
        GenerationRequest {
            prompt: "产品图".into(),
            model: "gpt-image-2".into(),
            size: "1536x864".into(),
            count: 2,
            quality: "high".into(),
            output_format: "webp".into(),
            output_compression: 72,
            background: "opaque".into(),
            moderation: "low".into(),
        }
    }

    fn edit_request() -> EditRequest {
        EditRequest {
            prompt: "修改产品图".into(),
            model: "gpt-image-1".into(),
            size: "1024x1024".into(),
            quality: "auto".into(),
            output_format: "png".into(),
            output_compression: 100,
            background: "auto".into(),
        }
    }

    #[test]
    fn fixtures_deserialize_base64_and_url_results() {
        let base64: ProviderResponse = serde_json::from_str(PNG_FIXTURE).unwrap();
        let url: ProviderResponse = serde_json::from_str(URL_FIXTURE).unwrap();

        assert!(base64.data[0]
            .b64_json
            .as_deref()
            .unwrap()
            .starts_with("iVBOR"));
        assert_eq!(
            url.data[0].url.as_deref(),
            Some("https://cdn.example.com/result.png")
        );
    }

    #[test]
    fn production_timeouts_match_the_python_transport_contract() {
        assert_eq!(CONNECT_TIMEOUT, Duration::from_secs(10));
        assert_eq!(READ_TIMEOUT, Duration::from_secs(300));
    }

    #[test]
    fn redirect_policy_rejects_https_downgrades_even_when_the_effective_port_matches() {
        let secure = reqwest::Url::parse("https://provider.example:443/v1/images").unwrap();
        let downgrade = reqwest::Url::parse("http://provider.example:443/result").unwrap();
        let same_origin = reqwest::Url::parse("https://provider.example:443/result").unwrap();

        assert!(!allows_redirect(&secure, &downgrade));
        assert!(allows_redirect(&secure, &same_origin));
    }

    #[tokio::test]
    async fn rejects_missing_provider_url_and_key() {
        let missing_url = ProviderClient::new("", SECRET).err().unwrap();
        let missing_key = ProviderClient::new("http://127.0.0.1", " ").err().unwrap();

        assert_eq!(missing_url.code, "provider.missing_url");
        assert_eq!(missing_key.code, "provider.missing_key");
    }

    #[tokio::test]
    async fn generate_posts_bearer_json_to_the_nonduplicated_v1_path() {
        let (base_url, requests, server) =
            spawn_server(1, |_, _| response(200, "application/json", PNG_FIXTURE));
        let client = ProviderClient::new(format!("{base_url}/v1"), SECRET).unwrap();

        let result = client.generate(&generation_request()).await.unwrap();
        server.join().unwrap();

        assert_eq!(result.data.len(), 1);
        let request = &requests.lock().unwrap()[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/v1/images/generations");
        assert_eq!(request.headers["authorization"], format!("Bearer {SECRET}"));
        assert_eq!(request.headers["content-type"], "application/json");
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&request.body).unwrap(),
            serde_json::json!({
                "prompt": "产品图",
                "model": "gpt-image-2",
                "size": "1536x864",
                "n": 2,
                "quality": "high",
                "output_format": "webp",
                "output_compression": 72,
                "background": "opaque",
                "moderation": "low"
            })
        );
    }

    #[tokio::test]
    async fn edit_posts_one_image_part_and_python_compatible_fields() {
        let (base_url, requests, server) =
            spawn_server(1, |_, _| response(200, "application/json", URL_FIXTURE));
        let client = ProviderClient::new(base_url, SECRET).unwrap();

        client
            .edit(
                &edit_request(),
                "reference.png",
                "image/png",
                b"fixture-image-bytes".to_vec(),
            )
            .await
            .unwrap();
        server.join().unwrap();

        let request = &requests.lock().unwrap()[0];
        assert_eq!(request.path, "/v1/images/edits");
        assert_eq!(request.headers["authorization"], format!("Bearer {SECRET}"));
        assert!(request.headers["content-type"].starts_with("multipart/form-data; boundary="));
        let body = String::from_utf8_lossy(&request.body);
        for expected in [
            "name=\"prompt\"",
            "修改产品图",
            "name=\"model\"",
            "gpt-image-1",
            "name=\"size\"",
            "1024x1024",
            "name=\"output_format\"",
            "png",
            "name=\"image\"; filename=\"reference.png\"",
            "Content-Type: image/png",
            "fixture-image-bytes",
        ] {
            assert!(
                body.contains(expected),
                "missing multipart fragment: {expected}"
            );
        }
        for omitted in [
            "name=\"quality\"",
            "name=\"background\"",
            "output_compression",
        ] {
            assert!(
                !body.contains(omitted),
                "unexpected multipart field: {omitted}"
            );
        }
    }

    #[tokio::test]
    async fn edit_sanitizes_unicode_multipart_filename_attributes() {
        let (base_url, requests, server) =
            spawn_server(1, |_, _| response(200, "application/json", URL_FIXTURE));
        let client = ProviderClient::new(base_url, SECRET).unwrap();

        client
            .edit(
                &edit_request(),
                "folder\\ignored/中文\"'\r\nX-Evil: yes\0.exe",
                "image/png",
                b"fixture-image-bytes".to_vec(),
            )
            .await
            .unwrap();
        server.join().unwrap();

        let request_body = requests.lock().unwrap()[0].body.clone();
        let body = String::from_utf8_lossy(&request_body);
        let filename_line = body
            .lines()
            .find(|line| line.contains("name=\"image\""))
            .unwrap();
        assert!(filename_line.contains("中文"));
        assert!(filename_line.ends_with(".png\""));
        for forbidden in ["folder", "ignored", "X-Evil:", "exe", "%0D", "%0A", "\\0"] {
            assert!(!filename_line.contains(forbidden), "{filename_line}");
        }
        assert_eq!(body.matches("name=\"image\"").count(), 1);
    }

    #[tokio::test]
    async fn follows_provider_redirects() {
        let (base_url, requests, server) = spawn_server(2, |request, _| {
            if request.path == "/v1/images/generations" {
                response_with_headers(307, "text/plain", "", &[("Location", "/redirected")])
            } else {
                response(200, "application/json", URL_FIXTURE)
            }
        });
        let client = ProviderClient::new(base_url, SECRET).unwrap();

        let result = client.generate(&generation_request()).await.unwrap();
        server.join().unwrap();

        assert_eq!(
            result.data[0].url.as_deref(),
            Some("https://cdn.example.com/result.png")
        );
        assert_eq!(requests.lock().unwrap()[1].path, "/redirected");
    }

    #[tokio::test]
    async fn does_not_forward_bearer_credentials_to_another_redirect_origin() {
        let (redirect_base, redirected_requests, redirected_server) =
            spawn_server(1, |_, _| response(200, "application/json", URL_FIXTURE));
        let redirect_url = format!("{redirect_base}/result");
        let (provider_base, provider_requests, provider_server) = spawn_server(1, move |_, _| {
            response_with_headers(
                307,
                "text/plain",
                "",
                &[("Location", redirect_url.as_str())],
            )
        });
        let client = ProviderClient::new(provider_base, SECRET).unwrap();

        client.generate(&generation_request()).await.unwrap();
        provider_server.join().unwrap();
        redirected_server.join().unwrap();

        assert_eq!(
            provider_requests.lock().unwrap()[0].headers["authorization"],
            format!("Bearer {SECRET}")
        );
        assert!(!redirected_requests.lock().unwrap()[0]
            .headers
            .contains_key("authorization"));
    }

    #[tokio::test]
    async fn maps_timeout_and_connect_failures_without_leaking_the_key() {
        let (base_url, _, server) = spawn_server(1, |_, _| {
            thread::sleep(Duration::from_millis(100));
            response(200, "application/json", PNG_FIXTURE)
        });
        let timeout_client = ProviderClient::with_timeouts(
            base_url,
            SECRET,
            Duration::from_millis(20),
            Duration::from_millis(20),
        )
        .unwrap();
        let timeout = timeout_client
            .generate(&generation_request())
            .await
            .unwrap_err();
        server.join().unwrap();

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let unavailable = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        let connect_client = ProviderClient::new(unavailable, SECRET).unwrap();
        let connect = connect_client
            .generate(&generation_request())
            .await
            .unwrap_err();

        assert_eq!(timeout.code, "provider.timeout");
        assert_eq!(connect.code, "provider.connect_failed");
        assert_secret_free(&timeout);
        assert_secret_free(&connect);
    }

    #[tokio::test]
    async fn classifies_http_non_json_invalid_json_and_invalid_shapes() {
        let cases = [
            (
                502,
                "text/html",
                "<!doctype html><title>bad gateway</title>",
                "provider.http_error",
                "网页错误页",
            ),
            (
                502,
                "application/json",
                "<!doctype html><title>bad gateway</title>",
                "provider.http_error",
                "网页错误页",
            ),
            (
                503,
                "application/json",
                "{\"error\":\"unavailable\"}",
                "provider.http_error",
                "接口服务器异常 503",
            ),
            (
                200,
                "text/plain",
                "not json",
                "provider.non_json",
                "不是 JSON",
            ),
            (
                200,
                "application/json",
                "{broken",
                "provider.invalid_json",
                "无法解析",
            ),
            (
                200,
                "application/json",
                "[]",
                "provider.invalid_response",
                "格式不正确",
            ),
            (
                200,
                "application/json",
                "{\"data\":[]}",
                "provider.invalid_response",
                "格式不正确",
            ),
        ];

        for (status, content_type, body, expected_code, message_fragment) in cases {
            let body = body.to_string();
            let (base_url, _, server) =
                spawn_server(1, move |_, _| response(status, content_type, &body));
            let client = ProviderClient::new(base_url, SECRET).unwrap();
            let error = client.generate(&generation_request()).await.unwrap_err();
            server.join().unwrap();

            assert_eq!(error.code, expected_code);
            assert!(
                error.message.contains(message_fragment),
                "{}",
                error.message
            );
            assert_secret_free(&error);
        }
    }

    #[tokio::test]
    async fn skips_unrecognized_image_items_when_a_response_contains_a_valid_image() {
        let mixed = format!(
            "{{\"data\":[{{\"b64_json\":\"{}\"}},{{}},42]}}",
            serde_json::from_str::<ProviderResponse>(PNG_FIXTURE)
                .unwrap()
                .data[0]
                .b64_json
                .as_deref()
                .unwrap()
        );
        let (base_url, _, server) =
            spawn_server(1, move |_, _| response(200, "application/json", &mixed));
        let client = ProviderClient::new(base_url, SECRET).unwrap();

        let result = client.generate(&generation_request()).await.unwrap();
        server.join().unwrap();

        assert_eq!(result.data.len(), 1);
        assert!(result.data[0].b64_json.is_some());
    }

    #[tokio::test]
    async fn rejects_provider_content_length_above_the_hard_limit() {
        let declared = MAX_PROVIDER_RESPONSE_BYTES + 1;
        let (base_url, _, server) = spawn_server(1, move |_, _| {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {declared}\r\nConnection: close\r\n\r\n"
            )
        });
        let client = ProviderClient::new(base_url, SECRET).unwrap();

        let error = client.generate(&generation_request()).await.unwrap_err();
        server.join().unwrap();

        assert_eq!(error.code, "provider.response_too_large");
        assert_secret_free(&error);
    }

    #[tokio::test]
    async fn bounds_chunked_provider_responses_while_streaming() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = read_request(&mut stream);
            let body = vec![b'x'; 129];
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(&body).unwrap();
            stream.write_all(b"\r\n0\r\n\r\n").unwrap();
        });
        let response = reqwest::Client::new()
            .get(format!("http://{address}/chunked"))
            .send()
            .await
            .unwrap();

        let error = read_response_bytes(response, 128).await.unwrap_err();
        server.join().unwrap();

        assert_eq!(error.code, "provider.response_too_large");
        assert_secret_free(&error);
    }

    fn assert_secret_free(error: &crate::workbench::error::CommandError) {
        assert!(!serde_json::to_string(error).unwrap().contains(SECRET));
    }

    fn spawn_server<F>(
        expected_requests: usize,
        handler: F,
    ) -> (String, Arc<Mutex<Vec<TestRequest>>>, thread::JoinHandle<()>)
    where
        F: Fn(&TestRequest, usize) -> String + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let handler = Arc::new(handler);
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut handled = 0;
            while handled < expected_requests && Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let request = read_request(&mut stream);
                        captured.lock().unwrap().push(request.clone());
                        let reply = handler(&request, handled);
                        let _ = stream.write_all(reply.as_bytes());
                        handled += 1;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2));
                    }
                    Err(error) => panic!("test server accept failed: {error}"),
                }
            }
            assert_eq!(handled, expected_requests, "test server request count");
        });
        (format!("http://{address}"), requests, server)
    }

    fn read_request(stream: &mut TcpStream) -> TestRequest {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 4096];
        let header_end = loop {
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0, "request ended before headers");
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
            .map(|(name, value)| (name.to_lowercase(), value.trim().to_string()))
            .collect::<HashMap<_, _>>();
        let content_length = headers
            .get("content-length")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        while bytes.len() - header_end < content_length {
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0, "request ended before body");
            bytes.extend_from_slice(&buffer[..read]);
        }
        TestRequest {
            method,
            path,
            headers,
            body: bytes[header_end..header_end + content_length].to_vec(),
        }
    }

    fn response(status: u16, content_type: &str, body: &str) -> String {
        response_with_headers(status, content_type, body, &[])
    }

    fn response_with_headers(
        status: u16,
        content_type: &str,
        body: &str,
        headers: &[(&str, &str)],
    ) -> String {
        let reason = match status {
            200 => "OK",
            307 => "Temporary Redirect",
            502 => "Bad Gateway",
            _ => "Test Response",
        };
        let extra = headers
            .iter()
            .map(|(name, value)| format!("{name}: {value}\r\n"))
            .collect::<String>();
        format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{body}",
            body.len()
        )
    }
}
