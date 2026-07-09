import json

from fastapi.testclient import TestClient

from backend import main


def configure_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "IMAGE_DIR", tmp_path / "images")
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.delenv("IMAGE_TOOLS_BASE_URL", raising=False)
    monkeypatch.delenv("IMAGE_TOOLS_API_KEY", raising=False)
    monkeypatch.delenv("IMAGE_TOOLS_MODEL", raising=False)


def test_provider_api_crud_redacts_key_and_preserves_blank_key_updates(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)

    created = client.post(
        "/api/providers",
        json={
            "name": "Primary",
            "base_url": "https://api.example.com/v1/",
            "api_key": "sk-primary",
            "default_model": "gpt-image-2",
            "is_default": True,
        },
    )

    assert created.status_code == 200
    created_payload = created.json()
    assert created_payload["name"] == "Primary"
    assert created_payload["base_url"] == "https://api.example.com/v1"
    assert created_payload["api_key"] == ""
    assert created_payload["api_key_set"] is True
    assert created_payload["is_default"] is True

    updated = client.patch(
        f"/api/providers/{created_payload['id']}",
        json={
            "name": "Primary Updated",
            "base_url": "https://api.updated.example/v1",
            "api_key": "",
            "default_model": "gpt-image-2-preview",
            "is_default": True,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["name"] == "Primary Updated"
    assert updated.json()["api_key"] == ""
    assert updated.json()["api_key_set"] is True
    assert main.load_settings().api_key == "sk-primary"
    assert main.load_settings().model == "gpt-image-2-preview"

    listed = client.get("/api/providers")

    assert listed.status_code == 200
    assert listed.json()[0]["api_key"] == ""
    assert listed.json()[0]["api_key_set"] is True

    deleted = client.delete(f"/api/providers/{created_payload['id']}")

    assert deleted.status_code == 204
    assert client.get("/api/providers").json() == []


def test_setting_default_provider_keeps_single_default(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)
    first = client.post(
        "/api/providers",
        json={
            "name": "First",
            "base_url": "https://first.example/v1",
            "api_key": "sk-first",
            "default_model": "gpt-image-2",
            "is_default": True,
        },
    ).json()
    second = client.post(
        "/api/providers",
        json={
            "name": "Second",
            "base_url": "https://second.example/v1",
            "api_key": "sk-second",
            "default_model": "gpt-image-2",
            "is_default": False,
        },
    ).json()

    response = client.post(f"/api/providers/{second['id']}/default")

    assert response.status_code == 200
    providers = client.get("/api/providers").json()
    defaults = [provider for provider in providers if provider["is_default"]]
    assert [provider["name"] for provider in defaults] == ["Second"]
    assert main.load_settings().base_url == "https://second.example/v1"
    assert main.load_settings().api_key == "sk-second"
    assert client.get(f"/api/providers/{first['id']}").json()["is_default"] is False


def test_provider_api_migrates_legacy_settings_once(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    tmp_path.mkdir(parents=True, exist_ok=True)
    main.SETTINGS_PATH.write_text(
        json.dumps(
            {
                "base_url": "https://legacy.example/v1/",
                "api_key": "sk-legacy",
                "model": "gpt-image-2",
            }
        ),
        encoding="utf-8",
    )
    client = TestClient(main.app)

    first = client.get("/api/providers")
    second = client.get("/api/providers")

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(second.json()) == 1
    provider = second.json()[0]
    assert provider["name"] == "Default"
    assert provider["base_url"] == "https://legacy.example/v1"
    assert provider["api_key"] == ""
    assert provider["api_key_set"] is True
    assert provider["default_model"] == "gpt-image-2"
    assert provider["is_default"] is True
