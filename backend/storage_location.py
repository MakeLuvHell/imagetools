from __future__ import annotations

import json
import os
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


BOOTSTRAP_FILENAME = "storage-location.json"
DATABASE_FILENAME = "workbench.sqlite3"
PAYLOAD_DIRECTORIES = ("images", "uploads")
PAYLOAD_FILES = ("settings.json",)


class StorageLocationError(ValueError):
    pass


@dataclass(frozen=True)
class StorageLocation:
    default_data_dir: Path
    active_data_dir: Path
    config_path: Path
    pending_data_dir: Path | None

    @property
    def is_custom(self) -> bool:
        return self.active_data_dir != self.default_data_dir


def bootstrap_path(config_dir: Path) -> Path:
    return config_dir.expanduser().resolve() / BOOTSTRAP_FILENAME


def normalize_absolute_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise StorageLocationError("数据目录必须使用绝对路径。")
    return path.resolve()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def ensure_writable_directory(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".imagetools-write-probe"
        with probe.open("wb") as handle:
            handle.write(b"ok")
        probe.unlink()
    except OSError as error:
        raise StorageLocationError(f"无法写入数据目录：{path}") from error


def read_bootstrap(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise StorageLocationError("数据目录配置文件无法读取。") from error
    if not isinstance(payload, dict):
        raise StorageLocationError("数据目录配置文件格式无效。")
    return payload


def write_bootstrap(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.tmp")
        temporary_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary_path, path)
    except OSError as error:
        raise StorageLocationError("无法保存数据目录配置。") from error


def bootstrap_active_dir(payload: dict[str, Any], default_data_dir: Path) -> Path:
    configured = payload.get("active_data_dir")
    if configured is None:
        return default_data_dir
    if not isinstance(configured, str):
        raise StorageLocationError("数据目录配置中的活动路径无效。")
    return normalize_absolute_path(configured)


def pending_location(payload: dict[str, Any]) -> dict[str, Any] | None:
    pending = payload.get("pending")
    if pending is None:
        return None
    if not isinstance(pending, dict):
        raise StorageLocationError("数据目录配置中的迁移任务无效。")
    return pending


def validate_destination(
    *,
    current_data_dir: Path,
    config_dir: Path,
    data_dir: str | Path,
    migrate_existing: bool,
) -> Path:
    current = normalize_absolute_path(current_data_dir)
    config = normalize_absolute_path(config_dir)
    destination = normalize_absolute_path(data_dir)
    if destination == current:
        raise StorageLocationError("新数据目录与当前目录相同。")
    if is_within(destination, current) or is_within(current, destination):
        raise StorageLocationError("新数据目录与当前目录不能互相包含。")
    if destination == config or is_within(config, destination):
        raise StorageLocationError("数据目录不能包含应用的配置目录。")
    ensure_writable_directory(destination)
    if migrate_existing and any(destination.iterdir()):
        raise StorageLocationError("迁移现有数据时，目标目录必须为空。")
    return destination


def copy_sqlite_database(source: Path, destination: Path) -> None:
    if destination.exists():
        raise StorageLocationError("目标目录已包含数据库文件。")
    try:
        with sqlite3.connect(source) as source_connection:
            with sqlite3.connect(destination) as destination_connection:
                source_connection.backup(destination_connection)
    except sqlite3.Error as error:
        raise StorageLocationError("无法复制会话数据库。") from error


def copy_payload(source_data_dir: Path, destination_data_dir: Path) -> None:
    source = normalize_absolute_path(source_data_dir)
    destination = normalize_absolute_path(destination_data_dir)
    ensure_writable_directory(destination)
    database = source / DATABASE_FILENAME
    if database.exists():
        copy_sqlite_database(database, destination / DATABASE_FILENAME)
    for directory_name in PAYLOAD_DIRECTORIES:
        source_directory = source / directory_name
        destination_directory = destination / directory_name
        if source_directory.exists():
            if destination_directory.exists():
                raise StorageLocationError(f"目标目录已包含 {directory_name}。")
            shutil.copytree(source_directory, destination_directory)
    for filename in PAYLOAD_FILES:
        source_file = source / filename
        destination_file = destination / filename
        if source_file.exists():
            if destination_file.exists():
                raise StorageLocationError(f"目标目录已包含 {filename}。")
            shutil.copy2(source_file, destination_file)


def schedule_storage_location(
    *,
    current_data_dir: Path,
    config_dir: Path,
    data_dir: str | Path,
    migrate_existing: bool,
) -> Path:
    current = normalize_absolute_path(current_data_dir)
    config = normalize_absolute_path(config_dir)
    destination = validate_destination(
        current_data_dir=current,
        config_dir=config,
        data_dir=data_dir,
        migrate_existing=migrate_existing,
    )
    path = bootstrap_path(config)
    payload = read_bootstrap(path)
    payload["active_data_dir"] = str(current)
    payload["pending"] = {
        "data_dir": str(destination),
        "source_data_dir": str(current),
        "migrate_existing": bool(migrate_existing),
    }
    write_bootstrap(path, payload)
    return destination


def resolve_storage_location(default_data_dir: Path, config_dir: Path) -> StorageLocation:
    default = normalize_absolute_path(default_data_dir)
    config = normalize_absolute_path(config_dir)
    path = bootstrap_path(config)
    payload = read_bootstrap(path)
    pending = pending_location(payload)
    if pending is not None:
        target_value = pending.get("data_dir")
        source_value = pending.get("source_data_dir")
        migrate_existing = pending.get("migrate_existing")
        if not isinstance(target_value, str) or not isinstance(source_value, str):
            raise StorageLocationError("数据目录迁移任务缺少路径。")
        if not isinstance(migrate_existing, bool):
            raise StorageLocationError("数据目录迁移任务无效。")
        target = validate_destination(
            current_data_dir=normalize_absolute_path(source_value),
            config_dir=config,
            data_dir=target_value,
            migrate_existing=migrate_existing,
        )
        if migrate_existing:
            copy_payload(normalize_absolute_path(source_value), target)
        payload = {"active_data_dir": str(target)}
        write_bootstrap(path, payload)

    active = bootstrap_active_dir(payload, default)
    ensure_writable_directory(active)
    return StorageLocation(
        default_data_dir=default,
        active_data_dir=active,
        config_path=path,
        pending_data_dir=None,
    )
