import base64

import anyio
import httpx

from backend import main


def test_normalize_base_url_adds_scheme_and_strips_v1():
    assert main.normalize_base_url("api.example.com/v1/") == "http://api.example.com"
    assert main.normalize_base_url("https://api.example.com/v1") == "https://api.example.com"


def test_load_settings_returns_defaults_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "SETTINGS_PATH", tmp_path / "settings.json")

    settings = main.load_settings()

    assert settings.base_url == ""
    assert settings.api_key == ""
    assert settings.model == "gpt-image-2"


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

    assert saved.base_url == "https://api.example.com"
    assert loaded.base_url == "https://api.example.com"
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


def test_homepage_supports_head_request():
    async def request_homepage_head():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.head("/")

    response = anyio.run(request_homepage_head)

    assert response.status_code == 200
