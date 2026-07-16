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

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    recent_thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
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

INSERT INTO schema_migrations (version, applied_at)
VALUES (1, '2026-07-12T00:00:00.000000+00:00');

INSERT INTO sessions (
    id,
    title,
    recent_thumbnail_path,
    created_at,
    updated_at,
    deleted_at
)
VALUES (
    1,
    '旧会话',
    NULL,
    '2026-07-12T00:00:00.000000+00:00',
    '2026-07-12T00:00:00.000000+00:00',
    NULL
);
