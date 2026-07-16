use std::{
    fs,
    path::{Component, PathBuf},
    sync::Arc,
};

use rusqlite::OptionalExtension;
use tauri::{
    http::{header, Method, Request, Response, StatusCode},
    Runtime,
};

use crate::workbench::{database::Database, error::CommandError};

const MEDIA_SCHEME: &str = "imagetools-media";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedMedia {
    pub path: PathBuf,
    pub mime_type: String,
}

#[derive(Clone)]
pub struct MediaResolver {
    database: Arc<Database>,
    data_root: PathBuf,
}

impl MediaResolver {
    pub fn new(database: Arc<Database>, data_root: PathBuf) -> Self {
        Self {
            database,
            data_root,
        }
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
        let (local_path, mime_type) = stored.ok_or_else(media_not_found)?;
        let relative = std::path::Path::new(&local_path);
        let mut components = relative.components();
        if !matches!(components.next(), Some(Component::Normal(root)) if root == "images")
            || components.any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(path_outside_workspace());
        }

        let image_root = self
            .data_root
            .join("images")
            .canonicalize()
            .map_err(|_| media_not_found())?;
        let target = self
            .data_root
            .join(relative)
            .canonicalize()
            .map_err(|_| media_not_found())?;
        if target == image_root || !target.starts_with(&image_root) {
            return Err(path_outside_workspace());
        }
        if !fs::metadata(&target)
            .map(|metadata| metadata.is_file())
            .unwrap_or(false)
        {
            return Err(media_not_found());
        }

        Ok(ResolvedMedia {
            path: target,
            mime_type,
        })
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
    let body = match fs::read(&resolved.path) {
        Ok(body) => body,
        Err(_) => return empty_response(StatusCode::NOT_FOUND),
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, resolved.mime_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| empty_response(StatusCode::NOT_FOUND))
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

fn path_outside_workspace() -> CommandError {
    CommandError::new("media.path_outside_workspace", "图片不在当前工作区中。")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf, sync::Arc};

    use tauri::http::{Method, Request, StatusCode};

    use super::{media_response, media_url_for_platform, register_media_protocol, MediaResolver};
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
            let resolver = MediaResolver::new(database.clone(), data_root.clone());
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
        let bytes = b"stored image";
        fs::write(fixture.data_root.join("images/result.png"), bytes).unwrap();
        let image_id = fixture.insert_image("images/result.png", "image/png");

        let response = fixture.request(Method::GET, &format!("/image/{image_id}"));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "image/png");
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        assert_eq!(response.body(), bytes);
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
    fn media_protocol_helper_builds_with_the_mock_runtime() {
        let fixture = MediaFixture::new();
        let app = register_media_protocol(tauri::test::mock_builder(), fixture.resolver)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        drop(app);
    }
}
