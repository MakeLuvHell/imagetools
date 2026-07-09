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


def test_session_api_creates_lists_reads_renames_and_deletes_sessions(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)

    first = client.post("/api/sessions", json={"title": "产品海报"}).json()
    second = client.post("/api/sessions", json={"title": "头像探索"}).json()

    assert first["title"] == "产品海报"
    assert first["recent_thumbnail_path"] is None
    assert first["created_at"]
    assert first["updated_at"]
    assert client.get(f"/api/sessions/{first['id']}").json()["title"] == "产品海报"

    renamed = client.patch(f"/api/sessions/{first['id']}", json={"title": "产品海报主视觉"})

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "产品海报主视觉"

    listed = client.get("/api/sessions")

    assert listed.status_code == 200
    assert [session["id"] for session in listed.json()] == [first["id"], second["id"]]

    deleted = client.delete(f"/api/sessions/{first['id']}")

    assert deleted.status_code == 204
    assert client.get(f"/api/sessions/{first['id']}").status_code == 404
    assert [session["id"] for session in client.get("/api/sessions").json()] == [second["id"]]


def test_session_api_uses_default_title_when_blank(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)

    created = client.post("/api/sessions", json={"title": "   "})

    assert created.status_code == 200
    assert created.json()["title"].startswith("新会话 ")
