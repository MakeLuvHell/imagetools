#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use url::Url;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn find_available_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn health_response_is_ok(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

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

fn start_backend(app: &tauri::App) -> Result<u16, Box<dyn std::error::Error>> {
    let port = find_available_port()?;
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let (_events, child) = app
        .shell()
        .sidecar("imagetools-backend")?
        .env("IMAGE_TOOLS_HOST", "127.0.0.1")
        .env("IMAGE_TOOLS_PORT", port.to_string())
        .env("IMAGE_TOOLS_DATA_DIR", data_dir.to_string_lossy().to_string())
        .spawn()?;
    app.manage(BackendProcess(Mutex::new(Some(child))));
    wait_for_backend(port)?;
    Ok(port)
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let port = start_backend(app)?;
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
    use super::health_response_is_ok;

    #[test]
    fn accepts_http_11_health_success() {
        assert!(health_response_is_ok("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}"));
    }

    #[test]
    fn rejects_health_failure_status() {
        assert!(!health_response_is_ok("HTTP/1.1 503 Service Unavailable\r\n\r\n"));
    }
}
