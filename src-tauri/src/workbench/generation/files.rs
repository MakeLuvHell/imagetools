use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{Local, Utc};
use reqwest::header::CONTENT_TYPE;
use uuid::Uuid;

use crate::workbench::{
    error::CommandError, generation::client::ProviderResponse, models::StagedReferenceDto,
    sessions::NewImageInput,
};

pub const MAX_REFERENCE_BYTES: usize = 25 * 1024 * 1024;
const STAGING_LIFETIME: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Clone)]
pub struct StagedReference {
    pub path: PathBuf,
    pub original_name: String,
    pub mime_type: String,
    pub created_at: SystemTime,
}

#[derive(Debug, Clone)]
pub struct ConsumedReference {
    pub path: PathBuf,
    pub original_name: String,
    pub mime_type: String,
}

#[derive(Debug)]
pub struct PersistedImage {
    pub path: PathBuf,
    pub metadata: NewImageInput,
}

#[derive(Clone)]
pub struct ResultFileStore {
    data_root: PathBuf,
    image_dir: PathBuf,
}

impl ResultFileStore {
    pub fn new(data_root: PathBuf) -> Self {
        let image_dir = data_root.join("images");
        Self {
            data_root,
            image_dir,
        }
    }

    pub async fn persist(
        &self,
        response: ProviderResponse,
        output_format: &str,
        width: i64,
        height: i64,
    ) -> Result<Vec<PersistedImage>, CommandError> {
        let mut persisted = Vec::new();
        for (offset, image) in response.data.into_iter().enumerate() {
            let index = offset + 1;
            let material = if let Some(value) = image.b64_json.filter(|value| !value.is_empty()) {
                let encoded = value
                    .strip_prefix("data:")
                    .and_then(|value| value.split_once(','))
                    .map_or(value.as_str(), |(_, encoded)| encoded);
                let bytes = STANDARD.decode(encoded).map_err(|_| {
                    CommandError::new(
                        "generation.invalid_image_data",
                        "接口返回的图片数据无法解析。",
                    )
                });
                bytes.map(|bytes| (bytes, normalized_extension(output_format).to_string()))
            } else if let Some(url) = image.url.filter(|value| !value.is_empty()) {
                self.download(&url, output_format).await
            } else {
                continue;
            };
            let (bytes, extension) = match material {
                Ok(material) => material,
                Err(error) => {
                    Self::cleanup(&persisted);
                    return Err(error);
                }
            };
            match self.write_one(&bytes, index, &extension, width, height) {
                Ok(image) => persisted.push(image),
                Err(error) => {
                    Self::cleanup(&persisted);
                    return Err(error);
                }
            }
        }
        if persisted.is_empty() {
            return Err(CommandError::new(
                "provider.invalid_response",
                "接口响应中没有可识别的图片。",
            ));
        }
        Ok(persisted)
    }

    pub fn cleanup(images: &[PersistedImage]) {
        for image in images {
            let _ = fs::remove_file(&image.path);
        }
    }

    fn write_one(
        &self,
        bytes: &[u8],
        index: usize,
        extension: &str,
        width: i64,
        height: i64,
    ) -> Result<PersistedImage, CommandError> {
        fs::create_dir_all(&self.image_dir).map_err(result_write_failed)?;
        let token = Uuid::new_v4();
        let temporary_path = self.image_dir.join(format!(".{token}.tmp"));
        let filename = format!(
            "image_{}_{}.{}",
            unique_result_timestamp(),
            index,
            extension
        );
        let final_path = self.image_dir.join(&filename);
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)
                .map_err(result_write_failed)?;
            file.write_all(bytes).map_err(result_write_failed)?;
            file.sync_all().map_err(result_write_failed)?;
            drop(file);
            fs::rename(&temporary_path, &final_path).map_err(result_write_failed)
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }
        let local_path = final_path
            .strip_prefix(&self.data_root)
            .map_err(|_| result_write_failed(()))?
            .to_string_lossy()
            .replace('\\', "/");
        Ok(PersistedImage {
            path: final_path,
            metadata: NewImageInput {
                local_path,
                filename,
                mime_type: mime_for_extension(extension).to_string(),
                width: Some(width),
                height: Some(height),
            },
        })
    }

    async fn download(
        &self,
        value: &str,
        fallback_extension: &str,
    ) -> Result<(Vec<u8>, String), CommandError> {
        let url = reqwest::Url::parse(value).map_err(|_| invalid_image_url())?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(invalid_image_url());
        }
        let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 10 {
                return attempt.error("too many redirects");
            }
            if attempt.previous().last().is_some_and(|previous| {
                previous.scheme() == "https" && attempt.url().scheme() != "https"
            }) {
                return attempt.stop();
            }
            attempt.follow()
        });
        let client = reqwest::Client::builder()
            .connect_timeout(super::client::CONNECT_TIMEOUT)
            .read_timeout(super::client::READ_TIMEOUT)
            .redirect(redirect_policy)
            .build()
            .map_err(|_| download_failed())?;
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(map_download_error)?;
        if !response.status().is_success() {
            return Err(CommandError::new(
                "generation.download_failed",
                format!("下载图片失败，状态码：{}。", response.status().as_u16()),
            ));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("");
        let extension = extension_from_url(&url)
            .or_else(|| extension_for_mime(content_type))
            .unwrap_or_else(|| normalized_extension(fallback_extension))
            .to_string();
        let bytes = response.bytes().await.map_err(map_download_error)?.to_vec();
        Ok((bytes, extension))
    }
}

#[derive(Clone)]
pub struct ReferenceStore {
    upload_dir: PathBuf,
    staging_dir: PathBuf,
    entries: Arc<Mutex<HashMap<String, StagedReference>>>,
}

impl ReferenceStore {
    pub fn new(upload_dir: PathBuf) -> Result<Self, CommandError> {
        let staging_dir = upload_dir.join(".staging");
        fs::create_dir_all(&staging_dir).map_err(reference_write_failed)?;
        Self::cleanup_stale_at(&staging_dir, SystemTime::now())?;
        Ok(Self {
            upload_dir,
            staging_dir,
            entries: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn stage(
        &self,
        original_name: &str,
        mime_type: &str,
        bytes: &[u8],
    ) -> Result<StagedReferenceDto, CommandError> {
        if bytes.len() > MAX_REFERENCE_BYTES {
            return Err(CommandError::new(
                "reference.too_large",
                "参考图不能超过 25 MiB。",
            ));
        }
        validated_extension(mime_type, bytes)?;
        let token = Uuid::new_v4().to_string();
        let temporary_path = self.staging_dir.join(format!(".{token}.tmp"));
        let staged_path = self.staging_dir.join(&token);
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)
                .map_err(reference_write_failed)?;
            file.write_all(bytes).map_err(reference_write_failed)?;
            file.flush().map_err(reference_write_failed)?;
            drop(file);
            fs::rename(&temporary_path, &staged_path).map_err(reference_write_failed)
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }

        let entry = StagedReference {
            path: staged_path.clone(),
            original_name: original_name.to_string(),
            mime_type: canonical_mime(mime_type),
            created_at: SystemTime::now(),
        };
        let mut entries = match self.entries.lock() {
            Ok(entries) => entries,
            Err(error) => {
                let _ = fs::remove_file(&staged_path);
                return Err(reference_unavailable(error));
            }
        };
        entries.insert(token.clone(), entry);
        Ok(StagedReferenceDto { token })
    }

    pub fn lookup(&self, token: &str) -> Result<StagedReference, CommandError> {
        self.entries
            .lock()
            .map_err(reference_unavailable)?
            .get(token)
            .cloned()
            .ok_or_else(reference_not_found)
    }

    pub fn consume(&self, token: &str) -> Result<ConsumedReference, CommandError> {
        self.consume_with_move(token, |from, to| fs::rename(from, to))
    }

    fn consume_with_move(
        &self,
        token: &str,
        move_file: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
    ) -> Result<ConsumedReference, CommandError> {
        let mut entries = self.entries.lock().map_err(reference_unavailable)?;
        let staged = entries
            .get(token)
            .cloned()
            .ok_or_else(reference_not_found)?;
        let extension = extension_for_mime(&staged.mime_type).ok_or_else(|| {
            CommandError::new(
                "reference.unsupported_type",
                "仅支持 PNG、JPEG 和 WebP 参考图。",
            )
        })?;
        let filename = format!(
            "ref_{}_{}.{}",
            Local::now().format("%Y%m%d_%H%M%S"),
            Uuid::new_v4(),
            extension
        );
        let path = self.upload_dir.join(filename);
        move_file(&staged.path, &path).map_err(reference_write_failed)?;
        entries.remove(token);
        Ok(ConsumedReference {
            path,
            original_name: staged.original_name,
            mime_type: staged.mime_type,
        })
    }

    fn cleanup_stale_at(staging_dir: &Path, now: SystemTime) -> Result<(), CommandError> {
        let entries = fs::read_dir(staging_dir).map_err(reference_write_failed)?;
        for entry in entries {
            let entry = entry.map_err(reference_write_failed)?;
            let metadata = entry.metadata().map_err(reference_write_failed)?;
            let is_stale = metadata
                .modified()
                .ok()
                .and_then(|modified| now.duration_since(modified).ok())
                .is_some_and(|age| age > STAGING_LIFETIME);
            if is_stale {
                if metadata.is_dir() {
                    fs::remove_dir_all(entry.path()).map_err(reference_write_failed)?;
                } else {
                    fs::remove_file(entry.path()).map_err(reference_write_failed)?;
                }
            }
        }
        Ok(())
    }

    #[cfg(test)]
    fn staging_dir(&self) -> &Path {
        &self.staging_dir
    }
}

fn validated_extension(mime_type: &str, bytes: &[u8]) -> Result<&'static str, CommandError> {
    let canonical = canonical_mime(mime_type);
    let extension = extension_for_mime(&canonical).ok_or_else(|| {
        CommandError::new(
            "reference.unsupported_type",
            "仅支持 PNG、JPEG 和 WebP 参考图。",
        )
    })?;
    let matches = match canonical.as_str() {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(b"\xff\xd8\xff"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !matches {
        return Err(CommandError::new(
            "reference.mime_mismatch",
            "参考图内容与文件类型不匹配。",
        ));
    }
    Ok(extension)
}

fn canonical_mime(mime_type: &str) -> String {
    match mime_type.trim().to_ascii_lowercase().as_str() {
        "image/jpg" => "image/jpeg".to_string(),
        canonical => canonical.to_string(),
    }
}

fn extension_for_mime(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn extension_from_url(url: &reqwest::Url) -> Option<&'static str> {
    let extension = Path::new(url.path())
        .extension()
        .and_then(|value| value.to_str())?;
    match extension.to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpg" | "jpeg" => Some("jpg"),
        "webp" => Some("webp"),
        _ => None,
    }
}

fn unique_result_timestamp() -> String {
    static LAST_TIMESTAMP_MICROS: AtomicI64 = AtomicI64::new(0);

    let now = Utc::now().timestamp_micros();
    let unique = loop {
        let previous = LAST_TIMESTAMP_MICROS.load(Ordering::Relaxed);
        let candidate = now.max(previous.saturating_add(1));
        if LAST_TIMESTAMP_MICROS
            .compare_exchange_weak(previous, candidate, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
        {
            break candidate;
        }
    };
    chrono::DateTime::<Utc>::from_timestamp_micros(unique)
        .unwrap_or_else(Utc::now)
        .format("%Y%m%d_%H%M%S%6f")
        .to_string()
}

fn normalized_extension(value: &str) -> &'static str {
    match value
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "jpeg" | "jpg" => "jpg",
        "webp" => "webp",
        _ => "png",
    }
}

fn mime_for_extension(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

fn invalid_image_url() -> CommandError {
    CommandError::new("generation.invalid_image_url", "接口返回的图片地址无效。")
}

fn map_download_error(error: reqwest::Error) -> CommandError {
    if error.is_timeout() {
        CommandError::new("generation.download_timeout", "下载图片超时。")
    } else {
        download_failed()
    }
}

fn download_failed() -> CommandError {
    CommandError::new("generation.download_failed", "无法下载接口返回的图片。")
}

fn result_write_failed<T>(_: T) -> CommandError {
    CommandError::new("generation.file_write_failed", "无法保存生成的图片。")
}

fn reference_not_found() -> CommandError {
    CommandError::new("reference.not_found", "参考图不存在或已经使用。")
}

fn reference_unavailable<T>(_: T) -> CommandError {
    CommandError::new("reference.unavailable", "参考图暂时不可用。")
}

fn reference_write_failed<T>(_: T) -> CommandError {
    CommandError::new("reference.write_failed", "无法保存参考图。")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::{Duration, SystemTime},
    };

    use base64::{engine::general_purpose::STANDARD, Engine};

    use super::{ReferenceStore, ResultFileStore, MAX_REFERENCE_BYTES};
    use crate::workbench::generation::client::{ProviderImage, ProviderResponse};

    const PNG_1X1: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, b'I', b'H', b'D',
        b'R', 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ];
    const JPEG: &[u8] = &[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, b'J', b'F', b'I', b'F'];
    const WEBP: &[u8] = b"RIFF\x04\x00\x00\x00WEBPVP8 ";

    #[test]
    fn stages_and_consumes_raw_png_bytes_once() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();

        let staged = store.stage("参考图.png", "image/png", PNG_1X1).unwrap();
        let metadata = store.lookup(&staged.token).unwrap();
        assert_eq!(metadata.original_name, "参考图.png");
        assert_eq!(metadata.mime_type, "image/png");

        let consumed = store.consume(&staged.token).unwrap();
        assert_eq!(fs::read(&consumed.path).unwrap(), PNG_1X1);
        assert!(consumed.path.starts_with(temporary.path().join("uploads")));
        assert!(consumed
            .path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("ref_"));
        assert_eq!(consumed.path.extension().unwrap(), "png");
        assert_eq!(
            store.consume(&staged.token).unwrap_err().code,
            "reference.not_found"
        );
    }

    #[test]
    fn rejects_references_larger_than_twenty_five_mib() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();
        let bytes = vec![0_u8; MAX_REFERENCE_BYTES + 1];

        assert_eq!(
            store
                .stage("large.png", "image/png", &bytes)
                .unwrap_err()
                .code,
            "reference.too_large"
        );
    }

    #[test]
    fn accepts_jpeg_and_webp_only_when_mime_matches_the_signature() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();

        assert!(store.stage("photo.jpeg", "image/jpeg", JPEG).is_ok());
        assert!(store.stage("image.webp", "image/webp", WEBP).is_ok());
        assert_eq!(
            store
                .stage("wrong.png", "image/png", JPEG)
                .unwrap_err()
                .code,
            "reference.mime_mismatch"
        );
        assert_eq!(
            store
                .stage("text.txt", "text/plain", b"not an image")
                .unwrap_err()
                .code,
            "reference.unsupported_type"
        );
    }

    #[test]
    fn assigns_unique_tokens_and_staging_names() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();

        let first = store.stage("same.png", "image/png", PNG_1X1).unwrap();
        let second = store.stage("same.png", "image/png", PNG_1X1).unwrap();

        assert_ne!(first.token, second.token);
        assert_ne!(
            store.lookup(&first.token).unwrap().path,
            store.lookup(&second.token).unwrap().path
        );
    }

    #[cfg(unix)]
    #[test]
    fn failed_consumption_keeps_the_token_available_for_retry() {
        use std::os::unix::fs::PermissionsExt;

        let temporary = tempfile::tempdir().unwrap();
        let upload_dir = temporary.path().join("uploads");
        let store = ReferenceStore::new(upload_dir.clone()).unwrap();
        let staged = store.stage("reference.png", "image/png", PNG_1X1).unwrap();
        fs::set_permissions(&upload_dir, fs::Permissions::from_mode(0o500)).unwrap();

        let error = store.consume(&staged.token).unwrap_err();

        fs::set_permissions(&upload_dir, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(error.code, "reference.write_failed");
        assert!(store.lookup(&staged.token).is_ok());
        assert!(store.consume(&staged.token).is_ok());
    }

    #[test]
    fn consumption_keeps_metadata_locked_until_the_move_succeeds() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();
        let staged = store.stage("reference.png", "image/png", PNG_1X1).unwrap();

        let error = store
            .consume_with_move(&staged.token, |_, _| {
                assert!(store.entries.try_lock().is_err());
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "fixture move rejected",
                ))
            })
            .unwrap_err();

        assert_eq!(error.code, "reference.write_failed");
        assert!(store.lookup(&staged.token).is_ok());
    }

    #[test]
    fn concurrent_consumers_cannot_move_the_same_token_twice() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();
        let staged = store.stage("reference.png", "image/png", PNG_1X1).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let consumers = (0..2)
            .map(|_| {
                let store = store.clone();
                let token = staged.token.clone();
                let barrier = barrier.clone();
                thread::spawn(move || {
                    barrier.wait();
                    store.consume(&token)
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();

        let results = consumers
            .into_iter()
            .map(|consumer| consumer.join().unwrap())
            .collect::<Vec<_>>();

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter_map(|result| result.as_ref().err())
                .map(|error| error.code.as_str())
                .collect::<Vec<_>>(),
            ["reference.not_found"]
        );
    }

    #[test]
    fn startup_removes_staging_files_older_than_twenty_four_hours() {
        let temporary = tempfile::tempdir().unwrap();
        let staging = temporary.path().join("uploads/.staging");
        fs::create_dir_all(&staging).unwrap();
        let stale = staging.join("stale");
        fs::write(&stale, b"stale").unwrap();
        let modified = fs::metadata(&stale).unwrap().modified().unwrap();

        ReferenceStore::cleanup_stale_at(&staging, modified + Duration::from_secs(23 * 60 * 60))
            .unwrap();
        assert!(stale.exists());
        ReferenceStore::cleanup_stale_at(
            &staging,
            modified + Duration::from_secs(24 * 60 * 60 + 1),
        )
        .unwrap();

        assert!(!stale.exists());
        let store = ReferenceStore::new(temporary.path().join("uploads")).unwrap();
        assert!(store.staging_dir().exists());
        assert!(SystemTime::now().duration_since(modified).is_ok());
    }

    #[tokio::test]
    async fn downloads_url_results_from_a_local_http_server() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request).unwrap();
            let body = b"downloaded-image";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: image/webp\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
        });
        let temporary = tempfile::tempdir().unwrap();
        let store = ResultFileStore::new(temporary.path().to_path_buf());

        let images = store
            .persist(
                ProviderResponse {
                    data: vec![ProviderImage {
                        b64_json: None,
                        url: Some(format!("http://{address}/result.webp")),
                    }],
                },
                "png",
                1536,
                864,
            )
            .await
            .unwrap();

        server.join().unwrap();
        assert_eq!(fs::read(&images[0].path).unwrap(), b"downloaded-image");
        assert_eq!(images[0].metadata.mime_type, "image/webp");
        assert_eq!(images[0].path.extension().unwrap(), "webp");
        assert!(fs::read_dir(temporary.path().join("images"))
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with('.')));
    }

    #[tokio::test]
    async fn removes_prior_final_files_when_a_later_result_is_invalid() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ResultFileStore::new(temporary.path().to_path_buf());
        let response = ProviderResponse {
            data: vec![
                ProviderImage {
                    b64_json: Some(STANDARD.encode(b"first-image")),
                    url: None,
                },
                ProviderImage {
                    b64_json: Some("not base64".into()),
                    url: None,
                },
            ],
        };

        let error = store
            .persist(response, "png", 1024, 1024)
            .await
            .unwrap_err();

        assert_eq!(error.code, "generation.invalid_image_data");
        assert!(fs::read_dir(temporary.path().join("images"))
            .unwrap()
            .next()
            .is_none());
    }

    #[tokio::test]
    async fn result_names_end_with_index_and_remain_unique_across_persists() {
        let temporary = tempfile::tempdir().unwrap();
        let store = ResultFileStore::new(temporary.path().to_path_buf());
        let mut names = std::collections::HashSet::new();

        for _ in 0..16 {
            let images = store
                .persist(
                    ProviderResponse {
                        data: vec![ProviderImage {
                            b64_json: Some(STANDARD.encode(b"image")),
                            url: None,
                        }],
                    },
                    "png",
                    1024,
                    1024,
                )
                .await
                .unwrap();
            let filename = &images[0].metadata.filename;
            let stem = filename.strip_suffix(".png").unwrap();
            let parts = stem.split('_').collect::<Vec<_>>();
            assert_eq!(parts.len(), 4, "unexpected result filename: {filename}");
            assert_eq!(parts[0], "image");
            assert_eq!(parts[1].len(), 8);
            assert_eq!(parts[2].len(), 12);
            assert_eq!(parts[3], "1");
            assert!(parts[1..]
                .iter()
                .all(|part| part.bytes().all(|byte| byte.is_ascii_digit())));
            assert!(
                names.insert(filename.clone()),
                "duplicate result filename: {filename}"
            );
        }
    }
}
