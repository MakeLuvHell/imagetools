import sqlite3
from pathlib import Path

import pytest

from backend.storage_location import (
    StorageLocationError,
    resolve_storage_location,
    schedule_storage_location,
)


def create_source_payload(data_dir: Path) -> None:
    data_dir.mkdir(parents=True)
    with sqlite3.connect(data_dir / "workbench.sqlite3") as connection:
        connection.execute("CREATE TABLE sessions (title TEXT NOT NULL)")
        connection.execute("INSERT INTO sessions (title) VALUES (?)", ("夏季海报",))
    (data_dir / "images").mkdir()
    (data_dir / "images" / "result.png").write_bytes(b"image")
    (data_dir / "uploads").mkdir()
    (data_dir / "uploads" / "reference.png").write_bytes(b"upload")
    (data_dir / "settings.json").write_text('{"model":"gpt-image-2"}', encoding="utf-8")


def test_resolve_storage_location_uses_default_without_bootstrap_config(tmp_path):
    default_data_dir = tmp_path / "default"
    location = resolve_storage_location(default_data_dir, tmp_path / "config")

    assert location.active_data_dir == default_data_dir.resolve()
    assert location.default_data_dir == default_data_dir.resolve()
    assert location.is_custom is False
    assert location.pending_data_dir is None


def test_scheduled_location_becomes_active_after_restart_without_copy(tmp_path):
    default_data_dir = tmp_path / "default"
    custom_data_dir = tmp_path / "custom"
    config_dir = tmp_path / "config"
    default_data_dir.mkdir()

    schedule_storage_location(
        current_data_dir=default_data_dir,
        config_dir=config_dir,
        data_dir=custom_data_dir,
        migrate_existing=False,
    )
    location = resolve_storage_location(default_data_dir, config_dir)

    assert location.active_data_dir == custom_data_dir.resolve()
    assert location.is_custom is True
    assert location.pending_data_dir is None
    assert default_data_dir.exists()


def test_pending_migration_copies_sqlite_images_uploads_and_settings(tmp_path):
    source_data_dir = tmp_path / "source"
    custom_data_dir = tmp_path / "custom"
    config_dir = tmp_path / "config"
    create_source_payload(source_data_dir)

    schedule_storage_location(
        current_data_dir=source_data_dir,
        config_dir=config_dir,
        data_dir=custom_data_dir,
        migrate_existing=True,
    )
    location = resolve_storage_location(source_data_dir, config_dir)

    assert location.active_data_dir == custom_data_dir.resolve()
    assert (custom_data_dir / "images" / "result.png").read_bytes() == b"image"
    assert (custom_data_dir / "uploads" / "reference.png").read_bytes() == b"upload"
    assert (custom_data_dir / "settings.json").read_text(encoding="utf-8") == '{"model":"gpt-image-2"}'
    with sqlite3.connect(custom_data_dir / "workbench.sqlite3") as connection:
        assert connection.execute("SELECT title FROM sessions").fetchone()[0] == "夏季海报"
    assert (source_data_dir / "workbench.sqlite3").exists()


def test_schedule_rejects_a_nonempty_destination_for_migration(tmp_path):
    source_data_dir = tmp_path / "source"
    custom_data_dir = tmp_path / "custom"
    source_data_dir.mkdir()
    custom_data_dir.mkdir()
    (custom_data_dir / "existing.txt").write_text("keep", encoding="utf-8")

    with pytest.raises(StorageLocationError, match="目标目录必须为空"):
        schedule_storage_location(
            current_data_dir=source_data_dir,
            config_dir=tmp_path / "config",
            data_dir=custom_data_dir,
            migrate_existing=True,
        )


def test_schedule_rejects_nested_data_directories(tmp_path):
    source_data_dir = tmp_path / "source"
    source_data_dir.mkdir()

    with pytest.raises(StorageLocationError, match="不能互相包含"):
        schedule_storage_location(
            current_data_dir=source_data_dir,
            config_dir=tmp_path / "config",
            data_dir=source_data_dir / "nested",
            migrate_existing=False,
        )
