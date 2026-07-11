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


def test_session_category_api_manages_projects_assignments_and_pins(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)
    session = client.post("/api/sessions", json={"title": "产品海报"}).json()

    project = client.post("/api/projects", json={"name": "品牌视觉"})

    assert project.status_code == 200
    assert project.json()["name"] == "品牌视觉"
    project_id = project.json()["id"]

    assigned = client.patch(
        f"/api/sessions/{session['id']}",
        json={"project_id": project_id},
    )
    pinned = client.post(f"/api/sessions/{session['id']}/pin")

    assert assigned.status_code == 200
    assert assigned.json()["project_id"] == project_id
    assert assigned.json()["is_pinned"] is False
    assert pinned.status_code == 200
    assert pinned.json()["is_pinned"] is True
    assert client.get("/api/projects").json()[0]["id"] == project_id
    assert client.get("/api/sessions").json()[0]["project_id"] == project_id

    deleted = client.delete(f"/api/projects/{project_id}")

    assert deleted.status_code == 204
    restored = client.get(f"/api/sessions/{session['id']}").json()
    assert restored["project_id"] is None
    assert restored["is_pinned"] is True


def test_session_category_api_rejects_unknown_project_and_can_unpin(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    client = TestClient(main.app)
    session = client.post("/api/sessions", json={"title": "产品海报"}).json()

    rejected = client.patch(
        f"/api/sessions/{session['id']}",
        json={"project_id": 999},
    )
    client.post(f"/api/sessions/{session['id']}/pin")
    unpinned = client.delete(f"/api/sessions/{session['id']}/pin")

    assert rejected.status_code == 400
    assert "项目不存在" in rejected.json()["detail"]
    assert unpinned.status_code == 200
    assert unpinned.json()["is_pinned"] is False
