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


def create_provider_and_session(client):
    provider = client.post(
        "/api/providers",
        json={
            "name": "Primary",
            "base_url": "https://api.example.com/v1",
            "api_key": "sk-primary",
            "default_model": "gpt-image-2",
            "is_default": True,
        },
    ).json()
    session = client.post("/api/sessions", json={"title": "产品海报"}).json()
    return provider, session


class SuccessfulImageApiClient:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, *, output_dir, **kwargs):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / "result.png"
        path.write_bytes(b"image-bytes")
        return [path], {"data": [{"b64_json": "ignored"}]}

    def edit(self, *, output_dir, **kwargs):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / "edited.png"
        path.write_bytes(b"edited-bytes")
        return [path], {"data": [{"b64_json": "ignored"}]}


class FailingImageApiClient:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, **kwargs):
        raise main.ApiError("upstream failed")


def test_generate_writes_successful_run_and_image_history(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "ImageApiClient", SuccessfulImageApiClient)
    client = TestClient(main.app)
    provider, session = create_provider_and_session(client)

    response = client.post(
        "/api/generate",
        data={
            "session_id": str(session["id"]),
            "provider_id": str(provider["id"]),
            "prompt": "A clean product poster",
            "model": "gpt-image-2",
            "width": "1536",
            "height": "864",
            "ratio": "16:9",
            "resolution": "standard",
            "count": "2",
            "quality": "high",
            "output_format": "png",
            "background": "opaque",
            "moderation": "low",
        },
    )

    assert response.status_code == 200
    assert response.json()["images"] == ["/files/images/result.png"]

    runs = client.get(f"/api/sessions/{session['id']}/runs").json()
    assert len(runs) == 1
    run = runs[0]
    assert run["status"] == "succeeded"
    assert run["prompt"] == "A clean product poster"
    assert run["provider_name"] == "Primary"
    assert run["model"] == "gpt-image-2"
    assert run["parameters"]["size"] == "1536x864"
    assert run["parameters"]["ratio"] == "16:9"
    assert run["parameters"]["resolution"] == "standard"
    assert run["parameters"]["quality"] == "high"
    assert run["parameters"]["count"] == 2
    assert run["images"][0]["local_path"] == "images/result.png"
    assert run["images"][0]["url"] == "/files/images/result.png"
    assert client.get(f"/api/sessions/{session['id']}").json()["recent_thumbnail_path"] == "images/result.png"


def test_generate_writes_failed_run_when_upstream_fails(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "ImageApiClient", FailingImageApiClient)
    client = TestClient(main.app)
    provider, session = create_provider_and_session(client)

    response = client.post(
        "/api/generate",
        data={
            "session_id": str(session["id"]),
            "provider_id": str(provider["id"]),
            "prompt": "A clean product poster",
            "width": "1536",
            "height": "864",
        },
    )

    assert response.status_code == 502
    runs = client.get(f"/api/sessions/{session['id']}/runs").json()
    assert len(runs) == 1
    assert runs[0]["status"] == "failed"
    assert "upstream failed" in runs[0]["error_message"]
    assert runs[0]["images"] == []


def test_generate_with_reference_uses_edit_path_and_records_reference(tmp_path, monkeypatch):
    configure_runtime(tmp_path, monkeypatch)
    monkeypatch.setattr(main, "ImageApiClient", SuccessfulImageApiClient)
    client = TestClient(main.app)
    provider, session = create_provider_and_session(client)

    response = client.post(
        "/api/generate",
        data={
            "session_id": str(session["id"]),
            "provider_id": str(provider["id"]),
            "prompt": "Use this reference",
            "width": "1536",
            "height": "864",
        },
        files={"reference": ("ref.png", b"reference-bytes", "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["kind"] == "image_to_image"
    assert response.json()["images"] == ["/files/images/edited.png"]
    run = client.get(f"/api/sessions/{session['id']}/runs").json()[0]
    assert run["status"] == "succeeded"
    assert run["reference_image_path"].startswith("uploads/ref_")
    assert run["images"][0]["local_path"] == "images/edited.png"
