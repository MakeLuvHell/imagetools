import json
import sqlite3
from pathlib import Path

from backend import main
from backend.storage_location import resolve_storage_location, schedule_storage_location
from backend.workbench_db import WorkbenchStore


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "backend-contracts"


def install_fixture(data_dir: Path, name: str) -> WorkbenchStore:
    database_path = data_dir / "workbench.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.executescript((FIXTURE_DIR / name).read_text(encoding="utf-8"))
    store = WorkbenchStore(data_dir)
    store.initialize()
    return store


def test_python_upgrades_shared_v1_fixture_without_losing_session(tmp_path):
    store = install_fixture(tmp_path, "schema-v1.sql")

    session = store.get_session(1)

    assert store.schema_version() == 2
    assert session is not None
    assert session.title == "旧会话"
    assert session.project_id is None
    assert session.is_pinned is False


def test_python_preserves_shared_v2_fixture_workspace_rows(tmp_path):
    store = install_fixture(tmp_path, "schema-v2.sql")

    providers = store.list_providers()
    projects = store.list_projects()
    session = store.get_session(1)
    runs = store.list_generation_runs(1)
    images = store.list_images(1)

    assert store.schema_version() == 2
    assert len(providers) == 1
    provider = providers[0]
    assert (
        provider.id,
        provider.name,
        provider.base_url,
        provider.api_key,
        provider.default_model,
        provider.is_default,
        provider.created_at,
        provider.updated_at,
    ) == (
        1,
        "Primary",
        "https://api.example.com/v1",
        "sk-fixture-secret",
        "gpt-image-2",
        True,
        "2026-07-15T00:00:00.000000+00:00",
        "2026-07-15T00:00:00.000000+00:00",
    )
    assert len(projects) == 1
    project = projects[0]
    assert (project.id, project.name, project.created_at, project.updated_at) == (
        1,
        "品牌项目",
        "2026-07-15T00:00:00.000000+00:00",
        "2026-07-15T00:00:00.000000+00:00",
    )
    assert session is not None
    assert (
        session.id,
        session.title,
        session.recent_thumbnail_path,
        session.project_id,
        session.is_pinned,
        session.created_at,
        session.updated_at,
    ) == (
        1,
        "已固定会话",
        "images/result.png",
        1,
        True,
        "2026-07-15T00:00:00.000000+00:00",
        "2026-07-15T00:00:00.000000+00:00",
    )
    assert len(runs) == 1
    run = runs[0]
    assert (
        run.id,
        run.session_id,
        run.status,
        run.prompt,
        run.parameters,
        run.provider_id,
        run.provider_name,
        run.model,
        run.reference_image_path,
        run.error_message,
        run.created_at,
        run.completed_at,
    ) == (
        1,
        1,
        "succeeded",
        "生成一张海报",
        {"count": 1, "quality": "high", "ratio": "16:9"},
        1,
        "Primary",
        "gpt-image-2",
        None,
        None,
        "2026-07-15T00:00:00.000000+00:00",
        "2026-07-15T00:00:01.000000+00:00",
    )
    assert len(images) == 1
    image = images[0]
    assert (
        image.id,
        image.generation_run_id,
        image.local_path,
        image.filename,
        image.mime_type,
        image.width,
        image.height,
        image.created_at,
    ) == (
        1,
        1,
        "images/result.png",
        "result.png",
        "image/png",
        1536,
        864,
        "2026-07-15T00:00:01.000000+00:00",
    )


def test_python_storage_bootstrap_uses_the_shared_pending_shape(tmp_path):
    source = tmp_path / "source"
    target = tmp_path / "target"
    config = tmp_path / "config"
    source.mkdir()

    schedule_storage_location(
        current_data_dir=source,
        config_dir=config,
        data_dir=target,
        migrate_existing=False,
    )

    bootstrap_path = config / "storage-location.json"
    assert json.loads(bootstrap_path.read_text(encoding="utf-8")) == {
        "active_data_dir": str(source.resolve()),
        "pending": {
            "data_dir": str(target.resolve()),
            "source_data_dir": str(source.resolve()),
            "migrate_existing": False,
        },
    }

    location = resolve_storage_location(source, config)

    assert location.active_data_dir == target.resolve()
    assert json.loads(bootstrap_path.read_text(encoding="utf-8")) == {
        "active_data_dir": str(target.resolve())
    }


def test_python_provider_helpers_match_the_shared_public_contract(tmp_path):
    contract = json.loads((FIXTURE_DIR / "public-contract.json").read_text(encoding="utf-8"))
    store = install_fixture(tmp_path, "schema-v2.sql")
    provider = store.get_provider(1)
    assert provider is not None

    clean_input = main.clean_provider_payload(main.ProviderPayload(**contract["provider_input"]))

    assert clean_input.model_dump() == contract["provider_input"]
    assert main.public_provider(provider) == contract["provider_public"]
    assert main.public_settings(main.provider_to_settings(provider)) == contract["settings_public"]
