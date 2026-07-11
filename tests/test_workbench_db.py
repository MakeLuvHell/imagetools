from backend import workbench_db


def test_initialize_database_creates_schema_version_and_is_idempotent(tmp_path):
    store = workbench_db.WorkbenchStore(tmp_path)

    store.initialize()
    first_provider = store.create_provider(
        name="Primary",
        base_url="https://api.example.com/v1",
        api_key="sk-test",
        default_model="gpt-image-2",
        is_default=True,
    )
    store.initialize()

    assert store.database_path == tmp_path / "workbench.sqlite3"
    assert store.schema_version() == 2
    assert store.get_provider(first_provider.id).name == "Primary"


def test_provider_crud_preserves_default_invariant(tmp_path):
    store = workbench_db.WorkbenchStore(tmp_path)
    store.initialize()

    primary = store.create_provider(
        name="Primary",
        base_url="https://api.primary.example/v1",
        api_key="sk-primary",
        default_model="gpt-image-2",
        is_default=True,
    )
    secondary = store.create_provider(
        name="Secondary",
        base_url="https://api.secondary.example/v1",
        api_key="sk-secondary",
        default_model="gpt-image-2",
        is_default=True,
    )

    providers = store.list_providers()

    assert [provider.name for provider in providers] == ["Primary", "Secondary"]
    assert store.get_provider(primary.id).is_default is False
    assert store.get_provider(secondary.id).is_default is True

    updated = store.update_provider(
        primary.id,
        name="Primary Updated",
        base_url="https://api.updated.example/v1",
        api_key="sk-updated",
        default_model="gpt-image-2-preview",
        is_default=True,
    )

    assert updated.name == "Primary Updated"
    assert updated.base_url == "https://api.updated.example/v1"
    assert updated.api_key == "sk-updated"
    assert updated.default_model == "gpt-image-2-preview"
    assert updated.is_default is True
    assert store.get_provider(secondary.id).is_default is False

    store.delete_provider(secondary.id)

    assert store.get_provider(secondary.id) is None
    assert [provider.id for provider in store.list_providers()] == [primary.id]


def test_session_crud_lists_by_recent_update(tmp_path):
    store = workbench_db.WorkbenchStore(tmp_path)
    store.initialize()

    first = store.create_session(title="产品海报")
    second = store.create_session(title="头像探索")
    updated = store.update_session(
        first.id,
        title="产品海报主视觉",
        recent_thumbnail_path="images/latest.png",
    )

    sessions = store.list_sessions()

    assert updated.title == "产品海报主视觉"
    assert updated.recent_thumbnail_path == "images/latest.png"
    assert [session.id for session in sessions] == [first.id, second.id]

    store.delete_session(first.id)

    assert store.get_session(first.id) is None
    assert [session.id for session in store.list_sessions()] == [second.id]


def test_initialize_migrates_v1_sessions_without_losing_data(tmp_path):
    database_path = tmp_path / "workbench.sqlite3"
    connection = workbench_db.sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-07-12T00:00:00+00:00');
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            recent_thumbnail_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        INSERT INTO sessions (title, recent_thumbnail_path, created_at, updated_at, deleted_at)
        VALUES ('旧会话', NULL, '2026-07-12T00:00:00+00:00', '2026-07-12T00:00:00+00:00', NULL);
        """
    )
    connection.close()

    store = workbench_db.WorkbenchStore(tmp_path)
    store.initialize()

    session = store.get_session(1)
    assert store.schema_version() == 2
    assert session.title == "旧会话"
    assert session.project_id is None
    assert session.is_pinned is False


def test_projects_assign_sessions_pin_them_and_unassign_on_delete(tmp_path):
    store = workbench_db.WorkbenchStore(tmp_path)
    store.initialize()
    project = store.create_project(name="品牌项目")
    session = store.create_session(title="产品海报")

    assigned = store.update_session(
        session.id,
        title=session.title,
        project_id=project.id,
    )
    pinned = store.set_session_pinned(session.id, True)

    assert [item.name for item in store.list_projects()] == ["品牌项目"]
    assert assigned.project_id == project.id
    assert pinned.is_pinned is True

    store.delete_project(project.id)

    unassigned = store.get_session(session.id)
    assert unassigned.project_id is None
    assert unassigned.is_pinned is True


def test_generation_runs_and_images_are_written_and_read_by_session(tmp_path):
    store = workbench_db.WorkbenchStore(tmp_path)
    store.initialize()
    provider = store.create_provider(
        name="Primary",
        base_url="https://api.example.com/v1",
        api_key="sk-test",
        default_model="gpt-image-2",
        is_default=True,
    )
    session = store.create_session(title="产品海报")

    run = store.create_generation_run(
        session_id=session.id,
        status="running",
        prompt="A clean product poster",
        parameters={"ratio": "16:9", "quality": "high", "count": 2},
        provider_id=provider.id,
        provider_name=provider.name,
        model="gpt-image-2",
        reference_image_path="uploads/ref.png",
    )
    finished = store.finish_generation_run(
        run.id,
        status="succeeded",
        error_message=None,
    )
    image = store.add_image(
        generation_run_id=run.id,
        local_path="images/result.png",
        filename="result.png",
        mime_type="image/png",
        width=1536,
        height=864,
    )

    runs = store.list_generation_runs(session.id)
    images = store.list_images(run.id)

    assert finished.status == "succeeded"
    assert finished.completed_at is not None
    assert runs[0].id == run.id
    assert runs[0].parameters == {"ratio": "16:9", "quality": "high", "count": 2}
    assert runs[0].provider_name == "Primary"
    assert runs[0].model == "gpt-image-2"
    assert image.local_path == "images/result.png"
    assert images == [image]
