#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod workbench;

use std::{ffi::OsString, path::PathBuf};

use tauri::{http::StatusCode, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use url::Url;

fn resolve_workspace_directories(
    default_data_dir: PathBuf,
    default_config_dir: PathBuf,
    data_override: Option<OsString>,
    config_override: Option<OsString>,
) -> Result<(PathBuf, PathBuf), workbench::error::CommandError> {
    fn resolve(
        default: PathBuf,
        override_value: Option<OsString>,
        code: &str,
        message: &str,
    ) -> Result<PathBuf, workbench::error::CommandError> {
        let path = override_value.map(PathBuf::from).unwrap_or(default);
        if !path.is_absolute() {
            return Err(workbench::error::CommandError::new(code, message));
        }
        Ok(path)
    }

    let data_dir = resolve(
        default_data_dir,
        data_override,
        "startup.relative_data_dir",
        "工作区数据目录必须使用绝对路径。",
    )?;
    let config_dir = resolve(
        default_config_dir,
        config_override,
        "startup.relative_config_dir",
        "工作区配置目录必须使用绝对路径。",
    )?;
    Ok((data_dir, config_dir))
}

fn is_allowed_navigation(url: &Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return false;
    }
    #[cfg(windows)]
    {
        url.scheme() == "http" && url.host_str() == Some("tauri.localhost")
    }
    #[cfg(not(windows))]
    {
        url.scheme() == "tauri" && url.host_str() == Some("localhost")
    }
}

fn schedule_startup_failure(
    error: &workbench::error::CommandError,
    show: impl FnOnce(String, Box<dyn FnOnce() + Send>),
    exit: impl FnOnce(i32) + Send + 'static,
) {
    show(error.message.clone(), Box::new(move || exit(1)));
}

enum StartupOutcome<T> {
    Ready(T),
    FailureScheduled,
}

fn resolve_startup<T>(
    result: Result<T, workbench::error::CommandError>,
    show: impl FnOnce(String, Box<dyn FnOnce() + Send>),
    exit: impl FnOnce(i32) + Send + 'static,
) -> StartupOutcome<T> {
    match result {
        Ok(value) => StartupOutcome::Ready(value),
        Err(error) => {
            schedule_startup_failure(&error, show, exit);
            StartupOutcome::FailureScheduled
        }
    }
}

fn empty_media_response(status: StatusCode) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("empty media response is valid")
}

fn should_exit_after_window_event(label: &str, event: &tauri::WindowEvent) -> bool {
    label == "main"
        && matches!(
            event,
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
        )
}

fn theme_override(mode: &str) -> Result<Option<tauri::Theme>, String> {
    match mode {
        "system" => Ok(None),
        "light" => Ok(Some(tauri::Theme::Light)),
        "dark" => Ok(Some(tauri::Theme::Dark)),
        unsupported => Err(format!("不支持的主题模式：{unsupported}")),
    }
}

#[tauri::command]
fn set_app_theme(window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    let theme = theme_override(&mode)?;
    let result = window.set_theme(theme);
    result.map_err(|error| format!("无法同步窗口主题：{error}"))
}

#[tauri::command]
fn pick_data_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .set_title("选择数据目录")
        .pick_folder(move |selection| {
            let _ = sender.send(selection.map(|path| path.to_string()));
        });
    receiver
        .recv()
        .map_err(|_| "系统目录选择器未返回结果。".to_string())
}

fn save_result_failed() -> workbench::error::CommandError {
    workbench::error::CommandError::new("media.save_failed", "无法保存图片。")
}

async fn write_selected_media(
    selection: Option<tauri_plugin_dialog::FilePath>,
    media: workbench::media::SaveableMedia,
) -> Result<bool, workbench::error::CommandError> {
    let Some(selection) = selection else {
        return Ok(false);
    };
    let destination = selection.into_path().map_err(|_| save_result_failed())?;
    tokio::fs::write(destination, media.bytes)
        .await
        .map_err(|_| save_result_failed())?;
    Ok(true)
}

#[tauri::command]
async fn save_result_image(
    image_id: i64,
    app: tauri::AppHandle,
    state: tauri::State<'_, workbench::commands::WorkbenchState>,
) -> Result<bool, workbench::error::CommandError> {
    let media = state.media_resolver().read_for_save(image_id)?;
    let extension = match media.mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => return Err(save_result_failed()),
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("保存图片")
        .set_file_name(&media.filename)
        .add_filter("图片文件", &[extension])
        .save_file(move |selection| {
            let _ = sender.send(selection);
        });
    let selection = receiver.await.map_err(|_| save_result_failed())?;
    write_selected_media(selection, media).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(generate_workbench_handler![
            pick_data_directory,
            save_result_image,
            set_app_theme
        ])
        .register_uri_scheme_protocol("imagetools-media", |context, request| {
            let Some(state) = context
                .app_handle()
                .try_state::<workbench::commands::WorkbenchState>()
            else {
                return empty_media_response(StatusCode::SERVICE_UNAVAILABLE);
            };
            workbench::media::media_response(&state.media_resolver(), request)
        })
        .setup(|app| {
            let defaults = (app.path().app_data_dir()?, app.path().app_local_data_dir()?);
            let directories = resolve_workspace_directories(
                defaults.0,
                defaults.1,
                std::env::var_os("IMAGE_TOOLS_DATA_DIR"),
                std::env::var_os("IMAGE_TOOLS_CONFIG_DIR"),
            );
            let state = directories.and_then(|(data_dir, config_dir)| {
                workbench::commands::WorkbenchState::initialize(&data_dir, &config_dir)
            });
            let app_handle = app.handle().clone();
            let state = resolve_startup(
                state,
                |message, on_closed| {
                    app.dialog().message(message).show(move |_| on_closed());
                },
                move |code| app_handle.exit(code),
            );
            let StartupOutcome::Ready(state) = state else {
                return Ok(());
            };
            app.manage(state);
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Image Tools")
                    .inner_size(1280.0, 860.0)
                    .min_inner_size(960.0, 640.0)
                    .on_navigation(is_allowed_navigation)
                    .build()?;
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if should_exit_after_window_event("main", event) {
                    app_handle.exit(0);
                    std::thread::spawn(|| {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        std::process::exit(0);
                    });
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Image Tools desktop app");
}

#[cfg(test)]
mod tests {
    use super::theme_override;
    use super::{
        is_allowed_navigation, resolve_startup, resolve_workspace_directories,
        should_exit_after_window_event, StartupOutcome,
    };
    use crate::workbench::error::CommandError;
    use std::{ffi::OsString, path::PathBuf};
    use url::Url;

    #[test]
    fn rejects_relative_workspace_overrides_before_initialization() {
        let defaults = (
            PathBuf::from("/default/data"),
            PathBuf::from("/default/config"),
        );

        let data_error = resolve_workspace_directories(
            defaults.0.clone(),
            defaults.1.clone(),
            Some(OsString::from("relative-data")),
            None,
        )
        .unwrap_err();
        let config_error = resolve_workspace_directories(
            defaults.0,
            defaults.1,
            None,
            Some(OsString::from("relative-config")),
        )
        .unwrap_err();

        assert_eq!(data_error.code, "startup.relative_data_dir");
        assert_eq!(config_error.code, "startup.relative_config_dir");
    }

    #[test]
    fn accepts_absolute_workspace_overrides() {
        let data = std::env::temp_dir().join("image-tools-data");
        let config = std::env::temp_dir().join("image-tools-config");
        let resolved = resolve_workspace_directories(
            PathBuf::from("/default/data"),
            PathBuf::from("/default/config"),
            Some(data.clone().into_os_string()),
            Some(config.clone().into_os_string()),
        )
        .unwrap();

        assert_eq!(resolved, (data, config));
    }

    #[test]
    fn allows_only_the_bundled_application_origin() {
        #[cfg(windows)]
        let bundled = Url::parse("http://tauri.localhost/index.html").unwrap();
        #[cfg(not(windows))]
        let bundled = Url::parse("tauri://localhost/index.html").unwrap();

        assert!(is_allowed_navigation(&bundled));
        assert!(!is_allowed_navigation(
            &Url::parse("https://provider.example/v1/images").unwrap()
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("file:///tmp/provider.html").unwrap()
        ));
        #[cfg(windows)]
        assert!(!is_allowed_navigation(
            &Url::parse("http://tauri.localhost:8080/index.html").unwrap()
        ));
        #[cfg(not(windows))]
        assert!(!is_allowed_navigation(
            &Url::parse("tauri://localhost:8080/index.html").unwrap()
        ));
    }

    #[test]
    fn startup_dialog_uses_only_the_safe_command_message() {
        use std::sync::{Arc, Mutex};

        let error = CommandError::new("database.open_failed", "无法打开工作区数据库。")
            .with_diagnostic("secret path and sqlite details");
        let displayed = Arc::new(Mutex::new(String::new()));
        let completion = Arc::new(Mutex::new(None));
        let exit_codes = Arc::new(Mutex::new(Vec::new()));
        let displayed_for_show = displayed.clone();
        let completion_for_show = completion.clone();
        let exit_codes_for_callback = exit_codes.clone();

        let outcome = resolve_startup::<()>(
            Err(error),
            move |message, on_closed| {
                *displayed_for_show.lock().unwrap() = message;
                *completion_for_show.lock().unwrap() = Some(on_closed);
            },
            move |code| exit_codes_for_callback.lock().unwrap().push(code),
        );

        assert!(matches!(outcome, StartupOutcome::FailureScheduled));
        assert_eq!(*displayed.lock().unwrap(), "无法打开工作区数据库。");
        assert!(exit_codes.lock().unwrap().is_empty());
        completion.lock().unwrap().take().unwrap()();
        assert_eq!(*exit_codes.lock().unwrap(), [1]);
    }

    #[test]
    fn exits_only_after_a_terminal_main_window_event() {
        assert!(should_exit_after_window_event(
            "main",
            &tauri::WindowEvent::Destroyed
        ));
        assert!(!should_exit_after_window_event(
            "secondary",
            &tauri::WindowEvent::Destroyed
        ));
        assert!(!should_exit_after_window_event(
            "main",
            &tauri::WindowEvent::Focused(false)
        ));
    }

    #[tokio::test]
    async fn save_result_write_returns_false_when_the_dialog_is_cancelled() {
        let media = crate::workbench::media::SaveableMedia {
            bytes: b"image".to_vec(),
            filename: "result.png".into(),
            mime_type: "image/png",
        };

        assert!(!super::write_selected_media(None, media).await.unwrap());
    }

    #[tokio::test]
    async fn save_result_write_persists_only_to_the_native_selection() {
        let temporary = tempfile::tempdir().unwrap();
        let destination = temporary.path().join("chosen.png");
        let media = crate::workbench::media::SaveableMedia {
            bytes: b"image bytes".to_vec(),
            filename: "result.png".into(),
            mime_type: "image/png",
        };

        assert!(super::write_selected_media(
            Some(tauri_plugin_dialog::FilePath::Path(destination.clone())),
            media,
        )
        .await
        .unwrap());
        assert_eq!(std::fs::read(destination).unwrap(), b"image bytes");
    }

    #[test]
    fn maps_supported_theme_modes() {
        assert_eq!(theme_override("system"), Ok(None));
        assert_eq!(theme_override("light"), Ok(Some(tauri::Theme::Light)));
        assert_eq!(theme_override("dark"), Ok(Some(tauri::Theme::Dark)));
    }

    #[test]
    fn rejects_unsupported_theme_modes() {
        assert_eq!(
            theme_override("sepia"),
            Err("不支持的主题模式：sepia".to_string())
        );
    }
}
