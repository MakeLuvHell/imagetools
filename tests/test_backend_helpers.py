import base64

import anyio
import httpx
from fastapi.testclient import TestClient

from backend import main


def test_normalize_base_url_adds_scheme_and_preserves_v1():
    assert main.normalize_base_url("api.example.com/v1/") == "http://api.example.com/v1"
    assert main.normalize_base_url("https://api.example.com/v1") == "https://api.example.com/v1"


def test_join_api_url_keeps_single_v1_segment():
    assert (
        main.join_api_url("https://img-api.chshapi.org/v1", "/v1/images/generations")
        == "https://img-api.chshapi.org/v1/images/generations"
    )
    assert (
        main.join_api_url("https://api.example.com", "/v1/images/generations")
        == "https://api.example.com/v1/images/generations"
    )


def test_load_settings_returns_defaults_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.delenv("IMAGE_TOOLS_BASE_URL", raising=False)
    monkeypatch.delenv("IMAGE_TOOLS_API_KEY", raising=False)
    monkeypatch.delenv("IMAGE_TOOLS_MODEL", raising=False)

    settings = main.load_settings()

    assert settings.base_url == ""
    assert settings.api_key == ""
    assert settings.model == "gpt-image-2"


def test_load_settings_can_use_environment_defaults_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.setenv("IMAGE_TOOLS_BASE_URL", "https://img-api.chshapi.org/v1/")
    monkeypatch.setenv("IMAGE_TOOLS_API_KEY", "sk-env")
    monkeypatch.setenv("IMAGE_TOOLS_MODEL", "gpt-image-2")

    settings = main.load_settings()

    assert settings.base_url == "https://img-api.chshapi.org/v1"
    assert settings.api_key == "sk-env"
    assert settings.model == "gpt-image-2"


def test_runtime_paths_use_environment_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_DATA_DIR", str(tmp_path / "desktop-data"))

    paths = main.resolve_runtime_paths()

    assert paths.data_dir == tmp_path / "desktop-data"
    assert paths.image_dir == tmp_path / "desktop-data" / "images"
    assert paths.upload_dir == tmp_path / "desktop-data" / "uploads"
    assert paths.settings_path == tmp_path / "desktop-data" / "settings.json"


def test_runtime_paths_default_to_repo_data_dir(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_DATA_DIR", raising=False)

    paths = main.resolve_runtime_paths()

    assert paths.data_dir == main.ROOT_DIR / "data"
    assert paths.image_dir == main.ROOT_DIR / "data" / "images"
    assert paths.upload_dir == main.ROOT_DIR / "data" / "uploads"
    assert paths.settings_path == main.ROOT_DIR / "data" / "settings.json"


def test_resolve_root_dir_uses_pyinstaller_temp_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(main.sys, "frozen", True, raising=False)
    monkeypatch.setattr(main.sys, "_MEIPASS", str(tmp_path), raising=False)

    assert main.resolve_root_dir() == tmp_path


def test_health_endpoint_returns_ok():
    client = TestClient(main.app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "app": "Image Tools"}


def test_save_and_load_settings_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")

    saved = main.save_settings(
        main.AppSettings(
            base_url="https://api.example.com/v1/",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )
    loaded = main.load_settings()

    assert saved.base_url == "https://api.example.com/v1"
    assert loaded.base_url == "https://api.example.com/v1"
    assert loaded.api_key == "sk-test"
    assert loaded.model == "gpt-image-2"


def test_save_settings_keeps_existing_key_when_update_key_is_blank(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")
    main.save_settings(main.AppSettings(base_url="https://api.example.com", api_key="sk-existing", model="gpt-image-2"))

    saved = main.save_settings(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="",
            model="gpt-image-1",
        ),
        keep_existing_key=True,
    )

    assert saved.api_key == "sk-existing"
    assert saved.model == "gpt-image-1"


def test_save_base64_accepts_data_url(tmp_path):
    encoded = base64.b64encode(b"png-bytes").decode("ascii")

    path = main.save_base64(f"data:image/png;base64,{encoded}", tmp_path, 1)

    assert path.exists()
    assert path.read_bytes() == b"png-bytes"
    assert path.name.startswith("image_")
    assert path.suffix == ".png"


def test_public_settings_redacts_api_key():
    public = main.public_settings(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-secret",
            model="gpt-image-2",
        )
    )

    assert public["base_url"] == "https://api.example.com"
    assert public["api_key_set"] is True
    assert public["api_key"] == ""
    assert public["model"] == "gpt-image-2"


def test_save_response_images_decodes_base64_items(tmp_path):
    encoded = base64.b64encode(b"image-one").decode("ascii")
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )

    paths = client.save_response_images({"data": [{"b64_json": encoded}]}, tmp_path)

    assert len(paths) == 1
    assert paths[0].read_bytes() == b"image-one"


def test_validate_image_size_accepts_gpt_image_2_safe_dimensions():
    assert main.validate_image_size(1536, 864) == "1536x864"


def test_validate_image_size_rejects_dimensions_that_are_not_multiple_of_16():
    try:
        main.validate_image_size(1820, 1024)
    except main.ApiError as exc:
        assert "16 的倍数" in str(exc)
    else:
        raise AssertionError("Expected invalid image size to raise ApiError")


def test_generate_payload_includes_supported_advanced_options(tmp_path, monkeypatch):
    encoded = base64.b64encode(b"image-one").decode("ascii")
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )
    captured = {}

    def fake_request_json(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs["json"]
        return {"data": [{"b64_json": encoded}]}

    monkeypatch.setattr(client, "request_json", fake_request_json)

    client.generate(
        prompt="产品图",
        model="gpt-image-2",
        size="1536x864",
        count=2,
        quality="high",
        output_format="webp",
        output_compression=72,
        background="opaque",
        moderation="low",
        output_dir=tmp_path,
    )

    assert list(tmp_path.glob("*.webp"))
    assert captured["method"] == "POST"
    assert captured["path"] == "/v1/images/generations"
    assert captured["json"]["quality"] == "high"
    assert captured["json"]["output_format"] == "webp"
    assert captured["json"]["output_compression"] == 72
    assert captured["json"]["background"] == "opaque"
    assert captured["json"]["moderation"] == "low"


def test_request_json_uses_longer_read_timeout_for_upstream_calls(monkeypatch):
    captured = {}

    class DummyResponse:
        headers = {"content-type": "application/json"}

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": []}

    class DummyClient:
        def __init__(self, timeout, follow_redirects):
            captured["timeout"] = timeout
            captured["follow_redirects"] = follow_redirects

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, method, url, headers=None, **kwargs):
            captured["method"] = method
            captured["url"] = url
            return DummyResponse()

    monkeypatch.setattr(main.httpx, "Client", DummyClient)
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )

    client.request_json("GET", "/v1/test")

    timeout = captured["timeout"]
    read_timeout = getattr(timeout, "read", timeout)

    assert captured["follow_redirects"] is True
    assert read_timeout == 300.0


def test_request_json_reports_read_timeout_as_upstream_timeout(monkeypatch):
    request = httpx.Request("GET", "https://api.example.com/v1/test")

    class DummyClient:
        def __init__(self, timeout, follow_redirects):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, method, url, headers=None, **kwargs):
            raise httpx.ReadTimeout("timed out", request=request)

    monkeypatch.setattr(main.httpx, "Client", DummyClient)
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://api.example.com",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )

    try:
        client.request_json("GET", "/v1/test")
    except main.ApiError as exc:
        assert "响应超时" in str(exc)
        assert "请求地址：https://api.example.com/v1/test" in str(exc)
    else:
        raise AssertionError("Expected timeout to raise ApiError")


def test_request_json_formats_503_with_request_url(monkeypatch):
    request = httpx.Request("POST", "https://img-api.chshapi.org/v1/images/generations")
    response = httpx.Response(
        503,
        request=request,
        json={
            "error": {
                "message": "auth_not_found: no auth available",
                "type": "server_error",
            }
        },
    )

    class DummyClient:
        def __init__(self, timeout, follow_redirects):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, method, url, headers=None, **kwargs):
            raise httpx.HTTPStatusError("service unavailable", request=request, response=response)

    monkeypatch.setattr(main.httpx, "Client", DummyClient)
    client = main.ImageApiClient(
        main.AppSettings(
            base_url="https://img-api.chshapi.org/v1",
            api_key="sk-test",
            model="gpt-image-2",
        )
    )

    try:
        client.request_json("POST", "/v1/images/generations", json={})
    except main.ApiError as exc:
        message = str(exc)
        assert "接口服务器异常 503" in message
        assert "auth_not_found" in message
        assert "请求地址：https://img-api.chshapi.org/v1/images/generations" in message
    else:
        raise AssertionError("Expected 503 to raise ApiError")


def test_validate_background_for_model_rejects_transparent_for_gpt_image_2():
    try:
        main.validate_background_for_model("transparent", "gpt-image-2")
    except main.ApiError as exc:
        assert "不支持透明背景" in str(exc)
    else:
        raise AssertionError("Expected transparent background to be rejected")


def test_homepage_supports_head_request():
    async def request_homepage_head():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.head("/")

    response = anyio.run(request_homepage_head)

    assert response.status_code == 200
