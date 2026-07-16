use std::{
    env,
    ffi::OsString,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::Duration,
};

use atomic_write_file::AtomicWriteFile;
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};

use crate::workbench::{
    error::CommandError,
    models::{StorageLocationDto, StorageLocationInput},
};

const BOOTSTRAP_FILENAME: &str = "storage-location.json";
const DATABASE_FILENAME: &str = "workbench.sqlite3";
const MIGRATION_MARKER_FILENAME: &str = ".imagetools-migration.json";
const PAYLOAD_DIRECTORIES: [&str; 2] = ["images", "uploads"];
const PAYLOAD_FILES: [&str; 1] = ["settings.json"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BootstrapState {
    #[serde(default)]
    active_data_dir: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pending: Option<PendingLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingLocation {
    data_dir: PathBuf,
    source_data_dir: PathBuf,
    migrate_existing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct MigrationMarker {
    source_data_dir: PathBuf,
    target_data_dir: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageLocation {
    pub default_data_dir: PathBuf,
    pub active_data_dir: PathBuf,
    pub config_path: PathBuf,
    pub pending_data_dir: Option<PathBuf>,
}

impl StorageLocation {
    pub fn is_custom(&self) -> bool {
        self.active_data_dir != self.default_data_dir
    }
}

#[derive(Clone)]
pub struct StorageManager {
    location: StorageLocation,
    config_dir: PathBuf,
}

impl StorageManager {
    pub fn new(location: StorageLocation) -> Result<Self, CommandError> {
        let config_dir = location
            .config_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| storage_error("storage.path_invalid", "无法解析工作区数据目录。"))?;
        Ok(Self {
            location,
            config_dir,
        })
    }

    pub fn location(&self) -> &StorageLocation {
        &self.location
    }

    pub fn status(&self) -> Result<StorageLocationDto, CommandError> {
        self.status_with_restart(None)
    }

    pub fn schedule(
        &self,
        input: StorageLocationInput,
    ) -> Result<StorageLocationDto, CommandError> {
        schedule_storage_location(
            &self.location.active_data_dir,
            &self.config_dir,
            &input.data_dir,
            input.migrate_existing,
        )?;
        self.status_with_restart(Some(true))
    }

    fn status_with_restart(
        &self,
        restart_required: Option<bool>,
    ) -> Result<StorageLocationDto, CommandError> {
        let bootstrap = read_bootstrap(&self.location.config_path)?;
        let pending_data_dir = bootstrap
            .pending
            .map(|pending| normalize_absolute_path(&pending.data_dir))
            .transpose()?;
        Ok(StorageLocationDto {
            active_data_dir: path_string(&self.location.active_data_dir),
            default_data_dir: path_string(&self.location.default_data_dir),
            pending_data_dir: pending_data_dir.as_deref().map(path_string),
            is_custom: self.location.is_custom(),
            restart_required,
        })
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn schedule_storage_location(
    current_data_dir: &Path,
    config_dir: &Path,
    data_dir: impl AsRef<Path>,
    migrate_existing: bool,
) -> Result<PathBuf, CommandError> {
    let current = normalize_absolute_path(current_data_dir)?;
    let config = normalize_absolute_path(config_dir)?;
    let destination = validate_destination(
        &current,
        &config,
        data_dir.as_ref(),
        migrate_existing,
        false,
    )?;
    let path = config.join(BOOTSTRAP_FILENAME);
    let mut state = read_bootstrap(&path)?;
    state.active_data_dir = Some(current.clone());
    state.pending = Some(PendingLocation {
        data_dir: destination.clone(),
        source_data_dir: current,
        migrate_existing,
    });
    write_bootstrap(&path, &state)?;
    Ok(destination)
}

pub fn resolve_storage_location(
    default_data_dir: &Path,
    config_dir: &Path,
) -> Result<StorageLocation, CommandError> {
    let default = normalize_absolute_path(default_data_dir)?;
    let config = normalize_absolute_path(config_dir)?;
    let config_path = config.join(BOOTSTRAP_FILENAME);
    let mut state = read_bootstrap(&config_path)?;

    if let Some(pending) = state.pending.clone() {
        let source = normalize_absolute_path(&pending.source_data_dir)?;
        let target = validate_destination(
            &source,
            &config,
            &pending.data_dir,
            pending.migrate_existing,
            true,
        )?;
        let payload_already_promoted =
            pending.migrate_existing && migration_marker_matches(&target, &source, &target);
        if pending.migrate_existing && !payload_already_promoted {
            migrate_payload(&source, &target)?;
        }
        state = BootstrapState {
            active_data_dir: Some(target),
            pending: None,
        };
        write_bootstrap(&config_path, &state)?;
        if pending.migrate_existing {
            let _ = fs::remove_file(target_marker_path(
                state
                    .active_data_dir
                    .as_deref()
                    .unwrap_or(&pending.data_dir),
            ));
        }
    }

    let active = normalize_absolute_path(state.active_data_dir.as_deref().unwrap_or(&default))?;
    ensure_writable_directory(&active)?;
    let active = normalize_absolute_path(&active)?;
    let _ = fs::remove_file(target_marker_path(&active));
    Ok(StorageLocation {
        default_data_dir: default,
        active_data_dir: active,
        config_path,
        pending_data_dir: None,
    })
}

fn validate_destination(
    current_data_dir: &Path,
    config_dir: &Path,
    data_dir: &Path,
    migrate_existing: bool,
    allow_owned_migration: bool,
) -> Result<PathBuf, CommandError> {
    let current = normalize_absolute_path(current_data_dir)?;
    let config = normalize_absolute_path(config_dir)?;
    let destination = normalize_absolute_path(data_dir)?;
    if destination == current {
        return Err(storage_error(
            "storage.same_path",
            "新数据目录与当前目录相同。",
        ));
    }
    if is_within(&destination, &current) || is_within(&current, &destination) {
        return Err(storage_error(
            "storage.nested_path",
            "新数据目录与当前目录不能互相包含。",
        ));
    }
    if destination == config || is_within(&config, &destination) {
        return Err(storage_error(
            "storage.contains_config",
            "数据目录不能包含应用的配置目录。",
        ));
    }

    ensure_writable_directory(&destination)?;
    let destination = normalize_absolute_path(&destination)?;
    if migrate_existing && directory_has_entries(&destination)? {
        let owned =
            allow_owned_migration && migration_marker_matches(&destination, &current, &destination);
        if !owned {
            return Err(storage_error(
                "storage.destination_not_empty",
                "迁移现有数据时，目标目录必须为空。",
            ));
        }
    }
    Ok(destination)
}

fn normalize_absolute_path(value: &Path) -> Result<PathBuf, CommandError> {
    let expanded = expand_tilde(value);
    if !expanded.is_absolute() {
        return Err(storage_error(
            "storage.relative_path",
            "数据目录必须使用绝对路径。",
        ));
    }
    let normalized = lexical_normalize(&expanded);
    canonicalize_with_missing_tail(&normalized)
        .map_err(|_| storage_error("storage.path_invalid", "无法解析工作区数据目录。"))
}

fn expand_tilde(path: &Path) -> PathBuf {
    let mut components = path.components();
    let Some(Component::Normal(first)) = components.next() else {
        return path.to_path_buf();
    };
    if first != "~" {
        return path.to_path_buf();
    }
    let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) else {
        return path.to_path_buf();
    };
    let mut expanded = PathBuf::from(home);
    for component in components {
        expanded.push(component.as_os_str());
    }
    expanded
}

fn lexical_normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn canonicalize_with_missing_tail(path: &Path) -> std::io::Result<PathBuf> {
    let mut existing = path;
    let mut tail: Vec<OsString> = Vec::new();
    while !existing.exists() {
        let Some(name) = existing.file_name() else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "path has no existing ancestor",
            ));
        };
        tail.push(name.to_os_string());
        existing = existing.parent().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "path has no existing ancestor",
            )
        })?;
    }
    let mut canonical = portable_canonicalize(existing)?;
    for component in tail.into_iter().rev() {
        canonical.push(component);
    }
    Ok(canonical)
}

fn portable_canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    let canonical = fs::canonicalize(path)?;
    #[cfg(windows)]
    {
        let text = canonical.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return Ok(PathBuf::from(format!(r"\\{rest}")));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return Ok(PathBuf::from(rest));
        }
    }
    Ok(canonical)
}

fn is_within(path: &Path, parent: &Path) -> bool {
    path.starts_with(parent)
}

fn ensure_writable_directory(path: &Path) -> Result<(), CommandError> {
    fs::create_dir_all(path)
        .map_err(|_| storage_error("storage.unwritable", "无法写入数据目录。"))?;
    if !fs::metadata(path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
    {
        return Err(storage_error("storage.unwritable", "无法写入数据目录。"));
    }

    let probe = path.join(format!(".imagetools-write-probe-{}", uuid::Uuid::new_v4()));
    let probe_result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&probe)?;
        file.write_all(b"ok")?;
        file.sync_all()?;
        drop(file);
        fs::remove_file(&probe)
    })();
    if probe_result.is_err() {
        let _ = fs::remove_file(&probe);
        return Err(storage_error("storage.unwritable", "无法写入数据目录。"));
    }
    Ok(())
}

fn directory_has_entries(path: &Path) -> Result<bool, CommandError> {
    let mut entries = fs::read_dir(path)
        .map_err(|_| storage_error("storage.unwritable", "无法读取数据目录。"))?;
    Ok(entries.next().is_some())
}

fn read_bootstrap(path: &Path) -> Result<BootstrapState, CommandError> {
    if !path.exists() {
        return Ok(BootstrapState::default());
    }
    let bytes = fs::read(path).map_err(|_| {
        storage_error(
            "storage.bootstrap_read_failed",
            "数据目录配置文件无法读取。",
        )
    })?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| storage_error("storage.bootstrap_invalid", "数据目录配置文件格式无效。"))?;
    if !value.is_object() {
        return Err(storage_error(
            "storage.bootstrap_invalid",
            "数据目录配置文件格式无效。",
        ));
    }
    serde_json::from_value(value)
        .map_err(|_| storage_error("storage.bootstrap_invalid", "数据目录配置文件格式无效。"))
}

fn write_bootstrap(path: &Path, state: &BootstrapState) -> Result<(), CommandError> {
    let parent = path
        .parent()
        .ok_or_else(|| storage_error("storage.bootstrap_write_failed", "无法保存数据目录配置。"))?;
    fs::create_dir_all(parent)
        .map_err(|_| storage_error("storage.bootstrap_write_failed", "无法保存数据目录配置。"))?;
    let payload = serde_json::to_vec_pretty(state)
        .map_err(|_| storage_error("storage.bootstrap_write_failed", "无法保存数据目录配置。"))?;
    atomic_write(path, &payload)
        .map_err(|_| storage_error("storage.bootstrap_write_failed", "无法保存数据目录配置。"))
}

fn atomic_write(path: &Path, payload: &[u8]) -> std::io::Result<()> {
    let mut file = AtomicWriteFile::open(path)?;
    file.write_all(payload)?;
    file.flush()?;
    file.commit()
}

fn migrate_payload(source: &Path, target: &Path) -> Result<(), CommandError> {
    validate_source_directory(source)?;
    let marker = MigrationMarker {
        source_data_dir: source.to_path_buf(),
        target_data_dir: target.to_path_buf(),
    };
    let staging = migration_staging_path(target)?;

    if staging.exists() {
        if !migration_marker_matches(&staging, source, target) {
            return Err(storage_error(
                "storage.migration_staging_conflict",
                "迁移暂存目录已被其他文件占用。",
            ));
        }
        fs::remove_dir_all(&staging)
            .map_err(|_| storage_error("storage.copy_failed", "无法清理迁移暂存目录。"))?;
    }
    if directory_has_entries(target)? {
        return Err(storage_error(
            "storage.destination_changed",
            "迁移期间目标目录发生了变化。",
        ));
    }

    fs::create_dir(&staging)
        .map_err(|_| storage_error("storage.copy_failed", "无法创建迁移暂存目录。"))?;
    if let Err(error) = write_migration_marker(&staging, &marker) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    copy_payload(source, &staging)?;

    if directory_has_entries(target)? {
        return Err(storage_error(
            "storage.destination_changed",
            "迁移期间目标目录发生了变化。",
        ));
    }
    fs::remove_dir(target)
        .map_err(|_| storage_error("storage.copy_failed", "无法准备迁移目标目录。"))?;
    if let Err(_error) = fs::rename(&staging, target) {
        let _ = ensure_writable_directory(target);
        return Err(storage_error(
            "storage.copy_failed",
            "无法完成工作区数据迁移。",
        ));
    }
    Ok(())
}

fn validate_source_directory(source: &Path) -> Result<(), CommandError> {
    if !fs::metadata(source)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
        || fs::read_dir(source).is_err()
    {
        return Err(storage_error(
            "storage.source_unavailable",
            "无法读取原工作区数据目录。",
        ));
    }
    Ok(())
}

fn migration_staging_path(target: &Path) -> Result<PathBuf, CommandError> {
    let parent = target
        .parent()
        .ok_or_else(|| storage_error("storage.path_invalid", "无法解析工作区数据目录。"))?;
    let name = target
        .file_name()
        .ok_or_else(|| storage_error("storage.path_invalid", "无法解析工作区数据目录。"))?;
    let mut staging_name = OsString::from(".");
    staging_name.push(name);
    staging_name.push(".imagetools-migration");
    Ok(parent.join(staging_name))
}

fn target_marker_path(directory: &Path) -> PathBuf {
    directory.join(MIGRATION_MARKER_FILENAME)
}

fn write_migration_marker(directory: &Path, marker: &MigrationMarker) -> Result<(), CommandError> {
    let payload = serde_json::to_vec(marker)
        .map_err(|_| storage_error("storage.copy_failed", "无法记录迁移暂存状态。"))?;
    atomic_write(&target_marker_path(directory), &payload)
        .map_err(|_| storage_error("storage.copy_failed", "无法记录迁移暂存状态。"))
}

fn migration_marker_matches(directory: &Path, source: &Path, target: &Path) -> bool {
    let Ok(payload) = fs::read(target_marker_path(directory)) else {
        return false;
    };
    serde_json::from_slice::<MigrationMarker>(&payload)
        .map(|marker| {
            marker
                == (MigrationMarker {
                    source_data_dir: source.to_path_buf(),
                    target_data_dir: target.to_path_buf(),
                })
        })
        .unwrap_or(false)
}

fn copy_payload(source_data_dir: &Path, destination_data_dir: &Path) -> Result<(), CommandError> {
    let source = normalize_absolute_path(source_data_dir)?;
    let destination = normalize_absolute_path(destination_data_dir)?;
    validate_source_directory(&source)?;
    ensure_writable_directory(&destination)?;

    let database = source.join(DATABASE_FILENAME);
    if database.exists() {
        copy_sqlite_database(&database, &destination.join(DATABASE_FILENAME))?;
    }
    for directory_name in PAYLOAD_DIRECTORIES {
        let source_directory = source.join(directory_name);
        if source_directory.exists() {
            copy_directory(
                &source_directory,
                &destination.join(directory_name),
                directory_name,
            )?;
        }
    }
    for filename in PAYLOAD_FILES {
        let source_file = source.join(filename);
        if source_file.exists() {
            let destination_file = destination.join(filename);
            if destination_file.exists() {
                return Err(storage_error(
                    "storage.destination_conflict",
                    "目标目录已包含工作区文件。",
                ));
            }
            fs::copy(source_file, destination_file)
                .map_err(|_| storage_error("storage.copy_failed", "无法复制工作区文件。"))?;
        }
    }
    Ok(())
}

fn copy_sqlite_database(source: &Path, destination: &Path) -> Result<(), CommandError> {
    if destination.exists() {
        return Err(storage_error(
            "storage.destination_conflict",
            "目标目录已包含数据库文件。",
        ));
    }
    let result = (|| -> rusqlite::Result<()> {
        let source_connection =
            Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut destination_connection = Connection::open(destination)?;
        let backup = Backup::new(&source_connection, &mut destination_connection)?;
        backup.run_to_completion(100, Duration::from_millis(10), None)?;
        drop(backup);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(destination);
        return Err(storage_error(
            "storage.copy_database_failed",
            "无法复制会话数据库。",
        ));
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path, _name: &str) -> Result<(), CommandError> {
    if destination.exists() {
        return Err(storage_error(
            "storage.destination_conflict",
            "目标目录已包含工作区目录。",
        ));
    }
    fs::create_dir(destination)
        .map_err(|_| storage_error("storage.copy_failed", "无法复制工作区目录。"))?;
    let entries = fs::read_dir(source)
        .map_err(|_| storage_error("storage.copy_failed", "无法读取工作区目录。"))?;
    for entry in entries {
        let entry =
            entry.map_err(|_| storage_error("storage.copy_failed", "无法读取工作区目录。"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory(&source_path, &destination_path, "nested")?;
        } else if source_path.is_file() {
            fs::copy(&source_path, &destination_path)
                .map_err(|_| storage_error("storage.copy_failed", "无法复制工作区文件。"))?;
        } else {
            return Err(storage_error(
                "storage.copy_failed",
                "工作区包含无法复制的文件。",
            ));
        }
    }
    let permissions = fs::metadata(source)
        .map_err(|_| storage_error("storage.copy_failed", "无法读取工作区目录。"))?
        .permissions();
    fs::set_permissions(destination, permissions)
        .map_err(|_| storage_error("storage.copy_failed", "无法复制工作区目录。"))?;
    Ok(())
}

fn storage_error(code: &'static str, message: &'static str) -> CommandError {
    CommandError::new(code, message)
}

#[cfg(test)]
mod tests {
    use super::{resolve_storage_location, schedule_storage_location};
    use rusqlite::Connection;
    use serde_json::json;

    fn create_source_payload(data_dir: &std::path::Path) {
        std::fs::create_dir_all(data_dir).unwrap();
        let connection = Connection::open(data_dir.join("workbench.sqlite3")).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE sessions (title TEXT NOT NULL);
                 INSERT INTO sessions (title) VALUES ('夏季海报');",
            )
            .unwrap();
        std::fs::create_dir(data_dir.join("images")).unwrap();
        std::fs::write(data_dir.join("images/result.png"), b"image").unwrap();
        std::fs::create_dir(data_dir.join("uploads")).unwrap();
        std::fs::write(data_dir.join("uploads/reference.png"), b"upload").unwrap();
        std::fs::write(
            data_dir.join("settings.json"),
            br#"{"model":"gpt-image-2"}"#,
        )
        .unwrap();
    }

    #[test]
    fn resolves_the_default_without_a_bootstrap_file() {
        let temporary = tempfile::tempdir().unwrap();
        let default = temporary.path().join("default");
        let config = temporary.path().join("config");

        let location = resolve_storage_location(&default, &config).unwrap();

        assert_eq!(location.active_data_dir, default.canonicalize().unwrap());
        assert_eq!(location.default_data_dir, default.canonicalize().unwrap());
        assert_eq!(location.config_path, config.join("storage-location.json"));
        assert_eq!(location.pending_data_dir, None);
        assert!(!location.is_custom());
    }

    #[test]
    fn scheduled_location_activates_on_restart_without_copying() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("keep.txt"), b"source").unwrap();

        let scheduled = schedule_storage_location(&source, &config, &target, false).unwrap();

        assert_eq!(scheduled, target.canonicalize().unwrap());
        let bootstrap: serde_json::Value =
            serde_json::from_slice(&std::fs::read(config.join("storage-location.json")).unwrap())
                .unwrap();
        assert_eq!(
            bootstrap,
            json!({
                "active_data_dir": source.canonicalize().unwrap(),
                "pending": {
                    "data_dir": target.canonicalize().unwrap(),
                    "source_data_dir": source.canonicalize().unwrap(),
                    "migrate_existing": false
                }
            })
        );

        let location = resolve_storage_location(&source, &config).unwrap();

        assert_eq!(location.active_data_dir, target.canonicalize().unwrap());
        assert!(location.is_custom());
        assert!(source.join("keep.txt").exists());
        assert!(!target.join("keep.txt").exists());
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(config.join("storage-location.json")).unwrap()
            )
            .unwrap(),
            json!({ "active_data_dir": target.canonicalize().unwrap() })
        );
    }

    #[test]
    fn pending_copy_migrates_database_images_uploads_and_settings() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        create_source_payload(&source);

        schedule_storage_location(&source, &config, &target, true).unwrap();
        let location = resolve_storage_location(&source, &config).unwrap();

        assert_eq!(location.active_data_dir, target.canonicalize().unwrap());
        assert_eq!(
            std::fs::read(target.join("images/result.png")).unwrap(),
            b"image"
        );
        assert_eq!(
            std::fs::read(target.join("uploads/reference.png")).unwrap(),
            b"upload"
        );
        assert_eq!(
            std::fs::read(target.join("settings.json")).unwrap(),
            br#"{"model":"gpt-image-2"}"#
        );
        let copied = Connection::open(target.join("workbench.sqlite3")).unwrap();
        assert_eq!(
            copied
                .query_row("SELECT title FROM sessions", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
            "夏季海报"
        );
        assert!(source.join("workbench.sqlite3").exists());
        assert!(source.join("images/result.png").exists());
        assert!(source.join("uploads/reference.png").exists());
        assert!(source.join("settings.json").exists());
    }

    #[test]
    fn missing_pending_source_does_not_activate_an_empty_workspace() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        std::fs::create_dir(&source).unwrap();
        schedule_storage_location(&source, &config, &target, true).unwrap();
        std::fs::remove_dir(&source).unwrap();

        let error = resolve_storage_location(&source, &config).unwrap_err();

        assert_eq!(error.code, "storage.source_unavailable");
        assert!(target.read_dir().unwrap().next().is_none());
        let bootstrap: serde_json::Value =
            serde_json::from_slice(&std::fs::read(config.join("storage-location.json")).unwrap())
                .unwrap();
        assert!(bootstrap.get("pending").is_some());
    }

    #[test]
    fn failed_payload_copy_can_retry_without_manual_target_cleanup() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        std::fs::create_dir(&source).unwrap();
        let database = Connection::open(source.join("workbench.sqlite3")).unwrap();
        database
            .execute_batch(
                "CREATE TABLE sessions (title TEXT NOT NULL);
                 INSERT INTO sessions (title) VALUES ('可重试迁移');",
            )
            .unwrap();
        drop(database);
        std::fs::write(source.join("images"), b"not a directory").unwrap();
        schedule_storage_location(&source, &config, &target, true).unwrap();

        let first_error = resolve_storage_location(&source, &config).unwrap_err();

        assert_eq!(first_error.code, "storage.copy_failed");
        assert!(target.read_dir().unwrap().next().is_none());
        std::fs::remove_file(source.join("images")).unwrap();
        std::fs::create_dir(source.join("images")).unwrap();
        std::fs::write(source.join("images/result.png"), b"fixed").unwrap();

        let location = resolve_storage_location(&source, &config).unwrap();

        assert_eq!(location.active_data_dir, target.canonicalize().unwrap());
        assert_eq!(
            std::fs::read(target.join("images/result.png")).unwrap(),
            b"fixed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn bootstrap_write_failure_can_retry_after_permissions_recover() {
        use std::os::unix::fs::PermissionsExt;

        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        create_source_payload(&source);
        schedule_storage_location(&source, &config, &target, true).unwrap();
        let original_permissions = std::fs::metadata(&config).unwrap().permissions();
        let mut read_only = original_permissions.clone();
        read_only.set_mode(0o500);
        std::fs::set_permissions(&config, read_only).unwrap();

        let first_result = resolve_storage_location(&source, &config);

        std::fs::set_permissions(&config, original_permissions).unwrap();
        let first_error = first_result.unwrap_err();
        assert_eq!(first_error.code, "storage.bootstrap_write_failed");
        std::fs::write(target.join("user-added.txt"), b"preserve").unwrap();
        std::fs::write(source.join("images/result.png"), b"changed source").unwrap();

        let location = resolve_storage_location(&source, &config).unwrap();

        assert_eq!(location.active_data_dir, target.canonicalize().unwrap());
        assert_eq!(
            std::fs::read(target.join("images/result.png")).unwrap(),
            b"image"
        );
        assert_eq!(
            std::fs::read(target.join("user-added.txt")).unwrap(),
            b"preserve"
        );
    }

    #[test]
    fn rejects_relative_and_nested_destinations() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let config = temporary.path().join("config");
        std::fs::create_dir(&source).unwrap();

        let relative = schedule_storage_location(&source, &config, "relative", false).unwrap_err();
        assert_eq!(relative.code, "storage.relative_path");

        let nested =
            schedule_storage_location(&source, &config, source.join("nested"), false).unwrap_err();
        assert_eq!(nested.code, "storage.nested_path");

        let parent =
            schedule_storage_location(&source, &config, temporary.path(), false).unwrap_err();
        assert_eq!(parent.code, "storage.nested_path");
    }

    #[test]
    fn rejects_a_destination_that_contains_the_config_directory() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let destination = temporary.path().join("destination");
        let config = destination.join("config");
        std::fs::create_dir(&source).unwrap();

        let error = schedule_storage_location(&source, &config, &destination, false).unwrap_err();

        assert_eq!(error.code, "storage.contains_config");
    }

    #[test]
    fn rejects_a_nonempty_copy_destination() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source");
        let target = temporary.path().join("target");
        let config = temporary.path().join("config");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("existing.txt"), b"keep").unwrap();

        let error = schedule_storage_location(&source, &config, &target, true).unwrap_err();

        assert_eq!(error.code, "storage.destination_not_empty");
        assert_eq!(std::fs::read(target.join("existing.txt")).unwrap(), b"keep");
    }

    #[test]
    fn rejects_an_active_data_path_occupied_by_a_file() {
        let temporary = tempfile::tempdir().unwrap();
        let default = temporary.path().join("default");
        let blocked = temporary.path().join("blocked");
        let config = temporary.path().join("config");
        std::fs::create_dir(&config).unwrap();
        std::fs::write(&blocked, b"not a directory").unwrap();
        std::fs::write(
            config.join("storage-location.json"),
            serde_json::to_vec(&json!({ "active_data_dir": blocked })).unwrap(),
        )
        .unwrap();

        let error = resolve_storage_location(&default, &config).unwrap_err();

        assert_eq!(error.code, "storage.unwritable");
        assert_eq!(std::fs::read(&blocked).unwrap(), b"not a directory");
    }

    #[test]
    fn rejects_malformed_bootstrap_json() {
        let temporary = tempfile::tempdir().unwrap();
        let default = temporary.path().join("default");
        let config = temporary.path().join("config");
        std::fs::create_dir(&config).unwrap();
        std::fs::write(config.join("storage-location.json"), b"{broken").unwrap();

        let error = resolve_storage_location(&default, &config).unwrap_err();

        assert_eq!(error.code, "storage.bootstrap_invalid");
        assert!(!default.exists());
    }
}
