use std::{
    io::Read,
    path::{Component, PathBuf},
    sync::Arc,
};

use cap_std::{ambient_authority, fs::Dir};
use rusqlite::OptionalExtension;
use tauri::{
    http::{header, Method, Request, Response, StatusCode},
    Runtime,
};

use crate::workbench::{
    database::Database, error::CommandError, generation::files::MAX_RESULT_IMAGE_BYTES,
};

const MEDIA_SCHEME: &str = "imagetools-media";

#[derive(Debug)]
pub struct ResolvedMedia {
    pub path: PathBuf,
    pub file: cap_std::fs::File,
}

#[derive(Clone)]
pub struct MediaResolver {
    database: Arc<Database>,
    image_root: PathBuf,
    image_dir: Arc<Dir>,
}

impl MediaResolver {
    pub fn open(database: Arc<Database>, data_root: PathBuf) -> Result<Self, CommandError> {
        let data_root = data_root.canonicalize().map_err(|_| media_unavailable())?;
        let data_dir = Dir::open_ambient_dir(&data_root, ambient_authority())
            .map_err(|_| media_unavailable())?;
        match data_dir.create_dir("images") {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(media_unavailable()),
        }
        let image_dir = data_dir
            .open_dir("images")
            .map_err(|_| path_outside_workspace())?;
        let image_root = data_root
            .join("images")
            .canonicalize()
            .map_err(|_| media_unavailable())?;
        if image_root == data_root || !image_root.starts_with(&data_root) {
            return Err(path_outside_workspace());
        }
        Ok(Self {
            database,
            image_root,
            image_dir: Arc::new(image_dir),
        })
    }

    pub fn resolve(&self, image_id: i64) -> Result<ResolvedMedia, CommandError> {
        let stored = self.database.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT local_path, mime_type FROM images WHERE id = ?1",
                    [image_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(|_| CommandError::new("database.query_failed", "无法读取工作区数据库。"))
        })?;
        let (local_path, _stored_mime_type) = stored.ok_or_else(media_not_found)?;
        let relative = std::path::Path::new(&local_path);
        let mut components = relative.components();
        let filename = match (components.next(), components.next(), components.next()) {
            (Some(Component::Normal(root)), Some(Component::Normal(filename)), None)
                if root == "images" =>
            {
                filename
            }
            _ => return Err(path_outside_workspace()),
        };

        let target = self
            .image_root
            .join(filename)
            .canonicalize()
            .map_err(|_| media_not_found())?;
        if !target.starts_with(&self.image_root) {
            return Err(path_outside_workspace());
        }

        let file = self
            .image_dir
            .open(filename)
            .map_err(|_| media_not_found())?;
        let metadata = file.metadata().map_err(|_| media_not_found())?;
        if !metadata.is_file() {
            return Err(media_not_found());
        }
        if metadata.len() > MAX_RESULT_IMAGE_BYTES as u64 {
            return Err(media_too_large());
        }

        Ok(ResolvedMedia { path: target, file })
    }
}

pub fn media_url(image_id: i64) -> String {
    media_url_for_platform(image_id, cfg!(windows))
}

pub fn media_url_for_platform(image_id: i64, windows: bool) -> String {
    if windows {
        format!("http://{MEDIA_SCHEME}.localhost/image/{image_id}")
    } else {
        format!("{MEDIA_SCHEME}://localhost/image/{image_id}")
    }
}

pub fn register_media_protocol<R: Runtime>(
    builder: tauri::Builder<R>,
    resolver: MediaResolver,
) -> tauri::Builder<R> {
    builder.register_uri_scheme_protocol(MEDIA_SCHEME, move |_context, request| {
        media_response(&resolver, request)
    })
}

pub fn media_response(resolver: &MediaResolver, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET {
        return empty_response(StatusCode::METHOD_NOT_ALLOWED);
    }
    if request.uri().query().is_some() {
        return empty_response(StatusCode::NOT_FOUND);
    }
    let Some(image_id) = parse_image_id(request.uri().path()) else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    let resolved = match resolver.resolve(image_id) {
        Ok(resolved) => resolved,
        Err(error) if error.code == "media.path_outside_workspace" => {
            return empty_response(StatusCode::FORBIDDEN)
        }
        Err(_) => return empty_response(StatusCode::NOT_FOUND),
    };
    let (body, mime_type) = match read_resolved_media(resolved) {
        Ok(media) => media,
        Err(_) => return empty_response(StatusCode::NOT_FOUND),
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type)
        .header("x-content-type-options", "nosniff")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| empty_response(StatusCode::NOT_FOUND))
}

fn read_resolved_media(
    mut resolved: ResolvedMedia,
) -> Result<(Vec<u8>, &'static str), CommandError> {
    let bytes = read_resolved_media_with_limit(&mut resolved.file, MAX_RESULT_IMAGE_BYTES)?;
    let mime_type = detect_image_mime(&bytes).ok_or_else(media_not_found)?;
    Ok((bytes, mime_type))
}

fn read_resolved_media_with_limit(
    file: &mut cap_std::fs::File,
    limit: usize,
) -> Result<Vec<u8>, CommandError> {
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| media_not_found())?;
    if bytes.len() > limit {
        return Err(media_too_large());
    }
    Ok(bytes)
}

fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn parse_image_id(path: &str) -> Option<i64> {
    let value = path.strip_prefix("/image/")?;
    if value.is_empty() || value.contains('/') || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse::<i64>().ok().filter(|id| *id > 0)
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("static media response is valid")
}

fn media_not_found() -> CommandError {
    CommandError::new("media.not_found", "图片不存在。")
}

fn media_too_large() -> CommandError {
    CommandError::new("media.too_large", "图片文件过大。")
}

fn media_unavailable() -> CommandError {
    CommandError::new("media.unavailable", "图片目录暂时不可用。")
}

fn path_outside_workspace() -> CommandError {
    CommandError::new("media.path_outside_workspace", "图片不在当前工作区中。")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf, sync::Arc};

    use tauri::http::{Method, Request, StatusCode};

    use super::{
        detect_image_mime, media_response, media_url_for_platform, read_resolved_media,
        read_resolved_media_with_limit, register_media_protocol, MediaResolver,
    };
    use crate::workbench::{database::Database, models::utc_now};

    struct MediaFixture {
        _temporary: tempfile::TempDir,
        data_root: PathBuf,
        database: Arc<Database>,
        resolver: MediaResolver,
    }

    impl MediaFixture {
        fn new() -> Self {
            let temporary = tempfile::tempdir().unwrap();
            let data_root = temporary.path().join("data");
            fs::create_dir_all(data_root.join("images")).unwrap();
            let database = Arc::new(Database::open(&data_root.join("workbench.sqlite3")).unwrap());
            let resolver = MediaResolver::open(database.clone(), data_root.clone()).unwrap();
            Self {
                _temporary: temporary,
                data_root,
                database,
                resolver,
            }
        }

        fn insert_image(&self, local_path: &str, mime_type: &str) -> i64 {
            self.database
                .with_connection(|connection| {
                    let now = utc_now();
                    connection.execute(
                        "INSERT INTO sessions (title, is_pinned, created_at, updated_at) VALUES ('media', 0, ?1, ?1)",
                        [&now],
                    ).unwrap();
                    let session_id = connection.last_insert_rowid();
                    connection.execute(
                        "INSERT INTO generation_runs (session_id, status, prompt, parameters_json, provider_name, model, created_at) VALUES (?1, 'succeeded', 'media', '{}', 'test', 'test', ?2)",
                        rusqlite::params![session_id, now],
                    ).unwrap();
                    let run_id = connection.last_insert_rowid();
                    connection.execute(
                        "INSERT INTO images (generation_run_id, local_path, filename, mime_type, created_at) VALUES (?1, ?2, 'result.png', ?3, ?4)",
                        rusqlite::params![run_id, local_path, mime_type, utc_now()],
                    ).unwrap();
                    Ok(connection.last_insert_rowid())
                })
                .unwrap()
        }

        fn request(&self, method: Method, path: &str) -> tauri::http::Response<Vec<u8>> {
            let request = Request::builder()
                .method(method)
                .uri(format!("imagetools-media://localhost{path}"))
                .body(Vec::new())
                .unwrap();
            media_response(&self.resolver, request)
        }
    }

    #[test]
    fn resolves_the_existing_data_root_relative_image_path() {
        let fixture = MediaFixture::new();
        fs::write(fixture.data_root.join("images/result.png"), b"png").unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        assert_eq!(
            fixture.resolver.resolve(image_id).unwrap().path,
            fixture
                .data_root
                .join("images/result.png")
                .canonicalize()
                .unwrap(),
        );
    }

    #[test]
    fn rejects_a_database_path_that_escapes_the_image_root() {
        let fixture = MediaFixture::new();
        fs::write(fixture.data_root.join("settings.json"), b"secret").unwrap();
        let image_id = fixture.insert_image("../settings.json", "application/json");

        let error = fixture.resolver.resolve(image_id).unwrap_err();

        assert_eq!(error.code, "media.path_outside_workspace");
        assert!(!error
            .message
            .contains(fixture.data_root.to_string_lossy().as_ref()));
    }

    #[test]
    fn rejects_an_images_path_with_traversal() {
        let fixture = MediaFixture::new();
        fs::write(fixture.data_root.join("settings.json"), b"secret").unwrap();
        let image_id = fixture.insert_image("images/../settings.json", "application/json");

        assert_eq!(
            fixture.resolver.resolve(image_id).unwrap_err().code,
            "media.path_outside_workspace"
        );
    }

    #[test]
    fn rejects_parent_components_even_when_the_canonical_target_stays_in_images() {
        let fixture = MediaFixture::new();
        fs::create_dir(fixture.data_root.join("images/sub")).unwrap();
        fs::write(fixture.data_root.join("images/result.png"), b"png").unwrap();

        for local_path in ["images/sub/../result.png", "images/../images/result.png"] {
            let image_id = fixture.insert_image(local_path, "image/png");
            assert_eq!(
                fixture.resolver.resolve(image_id).unwrap_err().code,
                "media.path_outside_workspace",
                "accepted stored path containing ParentDir: {local_path}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_that_escapes_the_image_root() {
        use std::os::unix::fs::symlink;

        let fixture = MediaFixture::new();
        let outside = fixture._temporary.path().join("outside.png");
        fs::write(&outside, b"secret").unwrap();
        symlink(&outside, fixture.data_root.join("images/link.png")).unwrap();
        let image_id = fixture.insert_image("images/link.png", "image/png");

        assert_eq!(
            fixture.resolver.resolve(image_id).unwrap_err().code,
            "media.path_outside_workspace"
        );
    }

    #[test]
    fn rejects_missing_rows_files_and_directories() {
        let fixture = MediaFixture::new();
        let missing_file = fixture.insert_image("images/missing.png", "image/png");
        let directory = fixture.insert_image("images", "image/png");

        assert_eq!(
            fixture.resolver.resolve(999_999).unwrap_err().code,
            "media.not_found"
        );
        assert_eq!(
            fixture.resolver.resolve(missing_file).unwrap_err().code,
            "media.not_found"
        );
        assert_eq!(
            fixture.resolver.resolve(directory).unwrap_err().code,
            "media.path_outside_workspace"
        );
    }

    #[test]
    fn protocol_accepts_only_exact_numeric_get_routes() {
        let fixture = MediaFixture::new();
        fs::write(fixture.data_root.join("images/result.png"), b"png").unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        assert_eq!(
            fixture.request(Method::GET, "/image/not-a-number").status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture.request(Method::GET, "/image/1/extra").status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture
                .request(Method::GET, &format!("/image/{image_id}?unexpected=true"),)
                .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            fixture
                .request(Method::POST, &format!("/image/{image_id}"))
                .status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }

    #[test]
    fn protocol_returns_mime_cors_and_bytes_for_an_existing_image() {
        let fixture = MediaFixture::new();
        let bytes = b"\x89PNG\r\n\x1a\nstored image";
        fs::write(fixture.data_root.join("images/result.png"), bytes).unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        let response = fixture.request(Method::GET, &format!("/image/{image_id}"));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "image/png");
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        assert_eq!(response.body(), bytes);
    }

    #[test]
    fn protocol_detects_image_mime_instead_of_trusting_the_database() {
        let fixture = MediaFixture::new();
        fs::write(
            fixture.data_root.join("images/result.png"),
            b"\x89PNG\r\n\x1a\nimage",
        )
        .unwrap();
        let image_id = fixture.insert_image("images/result.png", "text/html");

        let response = fixture.request(Method::GET, &format!("/image/{image_id}"));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "image/png");
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    }

    #[test]
    fn protocol_rejects_non_image_content_even_when_the_database_claims_png() {
        let fixture = MediaFixture::new();
        fs::write(
            fixture.data_root.join("images/result.png"),
            b"<html>not an image</html>",
        )
        .unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        assert_eq!(
            fixture
                .request(Method::GET, &format!("/image/{image_id}"))
                .status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn resolver_rejects_files_larger_than_the_result_limit_before_reading() {
        let fixture = MediaFixture::new();
        let path = fixture.data_root.join("images/result.png");
        let file = fs::File::create(path).unwrap();
        file.set_len(crate::workbench::generation::files::MAX_RESULT_IMAGE_BYTES as u64 + 1)
            .unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        assert_eq!(
            fixture.resolver.resolve(image_id).unwrap_err().code,
            "media.too_large"
        );
    }

    #[test]
    fn resolver_rejects_subdirectories_outside_the_flat_stored_contract() {
        let fixture = MediaFixture::new();
        fs::create_dir(fixture.data_root.join("images/nested")).unwrap();
        fs::write(
            fixture.data_root.join("images/nested/result.png"),
            b"\x89PNG\r\n\x1a\n",
        )
        .unwrap();
        let image_id = fixture.insert_image("images/nested/result.png", "image/png");

        assert_eq!(
            fixture.resolver.resolve(image_id).unwrap_err().code,
            "media.path_outside_workspace"
        );
    }

    #[test]
    fn opened_handle_enforces_the_limit_again_if_the_file_grows_after_resolve() {
        use std::io::Write;

        let fixture = MediaFixture::new();
        let path = fixture.data_root.join("images/result.png");
        fs::write(&path, b"\x89PNG\r\n\x1a\n").unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");
        let mut resolved = fixture.resolver.resolve(image_id).unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(path)
            .unwrap()
            .write_all(b"growth")
            .unwrap();

        assert_eq!(
            read_resolved_media_with_limit(&mut resolved.file, 8)
                .unwrap_err()
                .code,
            "media.too_large"
        );
    }

    #[cfg(unix)]
    #[test]
    fn opened_handle_is_used_after_the_stored_name_is_replaced() {
        use std::os::unix::fs::symlink;

        let fixture = MediaFixture::new();
        let path = fixture.data_root.join("images/result.png");
        let original = b"\x89PNG\r\n\x1a\noriginal";
        fs::write(&path, original).unwrap();
        let outside = fixture._temporary.path().join("outside.html");
        fs::write(&outside, b"<html>secret</html>").unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");
        let resolved = fixture.resolver.resolve(image_id).unwrap();
        fs::remove_file(&path).unwrap();
        symlink(outside, path).unwrap();

        let (bytes, mime_type) = read_resolved_media(resolved).unwrap();

        assert_eq!(bytes, original);
        assert_eq!(mime_type, "image/png");
    }

    #[cfg(unix)]
    #[test]
    fn resolver_initialization_rejects_an_image_root_symlink_outside_data() {
        use std::os::unix::fs::symlink;

        let temporary = tempfile::tempdir().unwrap();
        let data_root = temporary.path().join("data");
        let outside = temporary.path().join("outside");
        fs::create_dir_all(&data_root).unwrap();
        fs::create_dir(&outside).unwrap();
        symlink(outside, data_root.join("images")).unwrap();
        let database = Arc::new(Database::open(&data_root.join("workbench.sqlite3")).unwrap());

        let error = match MediaResolver::open(database, data_root) {
            Ok(_) => panic!("accepted image root symlink outside data"),
            Err(error) => error,
        };
        assert_eq!(error.code, "media.path_outside_workspace");
    }

    #[test]
    fn protocol_maps_missing_and_containment_errors_without_path_details() {
        let fixture = MediaFixture::new();
        fs::write(fixture.data_root.join("settings.json"), b"secret").unwrap();
        let outside = fixture.insert_image("images/../settings.json", "application/json");

        assert_eq!(
            fixture.request(Method::GET, "/image/999999").status(),
            StatusCode::NOT_FOUND
        );
        let response = fixture.request(Method::GET, &format!("/image/{outside}"));
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(!String::from_utf8_lossy(response.body()).contains("settings.json"));
    }

    #[test]
    fn media_urls_match_tauri_custom_protocol_origins_on_both_platforms() {
        assert_eq!(
            media_url_for_platform(42, true),
            "http://imagetools-media.localhost/image/42"
        );
        assert_eq!(
            media_url_for_platform(42, false),
            "imagetools-media://localhost/image/42"
        );
    }

    #[test]
    fn detects_only_supported_image_signatures_for_protocol_content_types() {
        assert_eq!(
            detect_image_mime(b"\x89PNG\r\n\x1a\ncontent"),
            Some("image/png")
        );
        assert_eq!(
            detect_image_mime(b"\xff\xd8\xffcontent"),
            Some("image/jpeg")
        );
        assert_eq!(
            detect_image_mime(b"RIFF\x04\x00\x00\x00WEBPcontent"),
            Some("image/webp")
        );
        assert_eq!(detect_image_mime(b"<html>content</html>"), None);
    }

    #[test]
    fn media_protocol_helper_builds_with_the_mock_runtime() {
        let fixture = MediaFixture::new();
        let app = register_media_protocol(tauri::test::mock_builder(), fixture.resolver)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        drop(app);
    }
}
