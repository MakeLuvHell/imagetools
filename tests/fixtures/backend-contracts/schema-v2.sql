CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    default_model TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    recent_thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE generation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    provider_id INTEGER,
    provider_name TEXT NOT NULL,
    model TEXT NOT NULL,
    reference_image_path TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE TABLE images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_run_id INTEGER NOT NULL,
    local_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id) ON DELETE CASCADE
);

INSERT INTO schema_migrations (version, applied_at) VALUES
    (1, '2026-07-12T00:00:00.000000+00:00'),
    (2, '2026-07-15T00:00:00.000000+00:00');

INSERT INTO providers (
    id, name, base_url, api_key, default_model, is_default, created_at, updated_at
)
VALUES (
    1,
    'Primary',
    'https://api.example.com/v1',
    'sk-fixture-secret',
    'gpt-image-2',
    1,
    '2026-07-15T00:00:00.000000+00:00',
    '2026-07-15T00:00:00.000000+00:00'
);

INSERT INTO projects (id, name, created_at, updated_at, deleted_at)
VALUES (
    1,
    '品牌项目',
    '2026-07-15T00:00:00.000000+00:00',
    '2026-07-15T00:00:00.000000+00:00',
    NULL
);

INSERT INTO sessions (
    id,
    title,
    recent_thumbnail_path,
    created_at,
    updated_at,
    deleted_at,
    project_id,
    is_pinned
)
VALUES (
    1,
    '已固定会话',
    'images/result.png',
    '2026-07-15T00:00:00.000000+00:00',
    '2026-07-15T00:00:00.000000+00:00',
    NULL,
    1,
    1
);

INSERT INTO generation_runs (
    id,
    session_id,
    status,
    prompt,
    parameters_json,
    provider_id,
    provider_name,
    model,
    reference_image_path,
    error_message,
    created_at,
    completed_at
)
VALUES (
    1,
    1,
    'succeeded',
    '生成一张海报',
    '{"count":1,"quality":"high","ratio":"16:9"}',
    1,
    'Primary',
    'gpt-image-2',
    NULL,
    NULL,
    '2026-07-15T00:00:00.000000+00:00',
    '2026-07-15T00:00:01.000000+00:00'
);

INSERT INTO images (
    id,
    generation_run_id,
    local_path,
    filename,
    mime_type,
    width,
    height,
    created_at
)
VALUES (
    1,
    1,
    'images/result.png',
    'result.png',
    'image/png',
    1536,
    864,
    '2026-07-15T00:00:01.000000+00:00'
);
