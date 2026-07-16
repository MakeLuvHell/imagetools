#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod workbench;

use std::{
    io::{Read, Write},
    net::TcpStream,
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
use url::Url;

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg(debug_assertions)]
const DEV_BACKEND_PORT: u16 = 7860;

#[cfg(debug_assertions)]
const DEV_BACKEND_TOKEN_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../build/desktop-dev-backend.json"
);

#[cfg(not(debug_assertions))]
use std::net::TcpListener;

#[cfg(not(debug_assertions))]
fn find_available_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn health_response_is_ok(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

#[cfg(not(debug_assertions))]
fn request_health(port: u16) -> bool {
    let address = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect(address) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    health_response_is_ok(&response)
}

#[cfg(debug_assertions)]
fn health_dev_token(response: &str) -> Option<String> {
    if !health_response_is_ok(response) {
        return None;
    }
    let (_, body) = response.split_once("\r\n\r\n")?;
    serde_json::from_str::<serde_json::Value>(body)
        .ok()?
        .get("desktop_dev_token")?
        .as_str()
        .map(ToOwned::to_owned)
}

#[cfg(debug_assertions)]
fn request_dev_backend_token(port: u16) -> Option<String> {
    let address = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect(address) else {
        return None;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return None;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return None;
    }
    health_dev_token(&response)
}

#[cfg(not(debug_assertions))]
fn wait_for_backend(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if request_health(port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("backend did not become ready before timeout".into())
}

#[cfg(not(debug_assertions))]
fn start_backend(app: &tauri::App) -> Result<u16, Box<dyn std::error::Error>> {
    let port = find_available_port()?;
    let data_dir = app.path().app_data_dir()?;
    let config_dir = app.path().app_local_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    std::fs::create_dir_all(&config_dir)?;
    let (_events, child) = app
        .shell()
        .sidecar("imagetools-backend")?
        .env("IMAGE_TOOLS_HOST", "127.0.0.1")
        .env("IMAGE_TOOLS_PORT", port.to_string())
        .env(
            "IMAGE_TOOLS_DATA_DIR",
            data_dir.to_string_lossy().to_string(),
        )
        .env(
            "IMAGE_TOOLS_CONFIG_DIR",
            config_dir.to_string_lossy().to_string(),
        )
        .spawn()?;
    app.manage(BackendProcess(Mutex::new(Some(child))));
    wait_for_backend(port)?;
    Ok(port)
}

#[cfg(debug_assertions)]
fn read_dev_backend_token() -> Result<String, Box<dyn std::error::Error>> {
    let payload = std::fs::read_to_string(DEV_BACKEND_TOKEN_PATH)?;
    let parsed_payload = serde_json::from_str::<serde_json::Value>(&payload)?;
    let token = parsed_payload
        .get("token")
        .and_then(serde_json::Value::as_str)
        .filter(|token| !token.is_empty())
        .ok_or("desktop development backend token is missing")?;
    Ok(token.to_owned())
}

#[cfg(debug_assertions)]
fn wait_for_dev_backend() -> Result<(), Box<dyn std::error::Error>> {
    let expected_token = read_dev_backend_token()?;
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if request_dev_backend_token(DEV_BACKEND_PORT).as_deref() == Some(expected_token.as_str()) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("desktop development backend did not match this launch before timeout".into())
}

#[cfg(debug_assertions)]
fn prepare_backend(_app: &tauri::App) -> Result<u16, Box<dyn std::error::Error>> {
    wait_for_dev_backend()?;
    Ok(DEV_BACKEND_PORT)
}

#[cfg(not(debug_assertions))]
fn prepare_backend(app: &tauri::App) -> Result<u16, Box<dyn std::error::Error>> {
    start_backend(app)
}

fn stop_backend(app_handle: &tauri::AppHandle) {
    if let Some(state) = app_handle.try_state::<BackendProcess>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
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
        .invoke_handler(tauri::generate_handler![pick_data_directory, set_app_theme])
        .setup(|app| {
            let port = prepare_backend(app)?;
            let url = Url::parse(&format!("http://127.0.0.1:{port}/"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Image Tools")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let app_handle = window.app_handle();
                stop_backend(&app_handle);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Image Tools desktop app");
}

#[cfg(test)]
mod tests {
    #[cfg(debug_assertions)]
    use super::health_dev_token;
    use super::{health_response_is_ok, theme_override};

    #[test]
    fn accepts_http_11_health_success() {
        assert!(health_response_is_ok(
            "HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}"
        ));
    }

    #[test]
    fn rejects_health_failure_status() {
        assert!(!health_response_is_ok(
            "HTTP/1.1 503 Service Unavailable\r\n\r\n"
        ));
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

    #[cfg(debug_assertions)]
    #[test]
    fn extracts_desktop_dev_token_from_health_response() {
        assert_eq!(
            health_dev_token("HTTP/1.1 200 OK\r\n\r\n{\"desktop_dev_token\":\"launch-token\"}"),
            Some("launch-token".to_string())
        );
    }
}
