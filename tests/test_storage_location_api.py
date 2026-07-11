from fastapi.testclient import TestClient

from backend import main


def configure_storage_runtime(tmp_path, monkeypatch):
    default_data_dir = tmp_path / "default"
    config_dir = tmp_path / "config"
    default_data_dir.mkdir()
    monkeypatch.setattr(main, "DEFAULT_DATA_DIR", default_data_dir)
    monkeypatch.setattr(main, "DATA_DIR", default_data_dir)
    monkeypatch.setattr(main, "CONFIG_DIR", config_dir)
    monkeypatch.setattr(main, "STORAGE_CONFIG_PATH", config_dir / "storage-location.json")


def test_storage_location_api_reports_the_active_default_directory(tmp_path, monkeypatch):
    configure_storage_runtime(tmp_path, monkeypatch)
    response = TestClient(main.app).get("/api/storage-location")

    assert response.status_code == 200
    assert response.json() == {
        "active_data_dir": str(tmp_path / "default"),
        "default_data_dir": str(tmp_path / "default"),
        "pending_data_dir": None,
        "is_custom": False,
    }


def test_storage_location_api_schedules_copy_migration_for_restart(tmp_path, monkeypatch):
    configure_storage_runtime(tmp_path, monkeypatch)
    destination = tmp_path / "custom"
    response = TestClient(main.app).post(
        "/api/storage-location",
        json={"data_dir": str(destination), "migrate_existing": True},
    )

    assert response.status_code == 200
    assert response.json() == {
        "active_data_dir": str(tmp_path / "default"),
        "default_data_dir": str(tmp_path / "default"),
        "pending_data_dir": str(destination),
        "is_custom": False,
        "restart_required": True,
    }


def test_storage_location_api_rejects_a_relative_destination(tmp_path, monkeypatch):
    configure_storage_runtime(tmp_path, monkeypatch)
    response = TestClient(main.app).post(
        "/api/storage-location",
        json={"data_dir": "relative-data", "migrate_existing": False},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "数据目录必须使用绝对路径。"
