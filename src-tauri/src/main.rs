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

fn report_startup_error(
    error: &workbench::error::CommandError,
    display: impl FnOnce(&str),
) -> std::io::Error {
    display(&error.message);
    std::io::Error::other(error.message.clone())
}

fn empty_media_response(status: StatusCode) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("empty media response is valid")
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(generate_workbench_handler![
            pick_data_directory,
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
            let state = match state {
                Ok(state) => state,
                Err(error) => {
                    let setup_error = report_startup_error(&error, |message| {
                        app.dialog().message(message).show(|_| {});
                    });
                    return Err(setup_error.into());
                }
            };
            app.manage(state);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Image Tools")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0)
                .on_navigation(is_allowed_navigation)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Image Tools desktop app");
}

#[cfg(test)]
mod tests {
    use super::theme_override;
    use super::{is_allowed_navigation, report_startup_error, resolve_workspace_directories};
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
        let error = CommandError::new("database.open_failed", "无法打开工作区数据库。")
            .with_diagnostic("secret path and sqlite details");
        let mut displayed = String::new();

        let setup_error = report_startup_error(&error, |message| displayed = message.to_string());

        assert_eq!(displayed, "无法打开工作区数据库。");
        assert_eq!(setup_error.to_string(), "无法打开工作区数据库。");
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
