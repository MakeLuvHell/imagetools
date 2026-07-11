from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 2
DATABASE_FILENAME = "workbench.sqlite3"
UNSET = object()


@dataclass(frozen=True)
class Provider:
    id: int
    name: str
    base_url: str
    api_key: str
    default_model: str
    is_default: bool
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class Session:
    id: int
    title: str
    recent_thumbnail_path: str | None
    project_id: int | None
    is_pinned: bool
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class Project:
    id: int
    name: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class GenerationRun:
    id: int
    session_id: int
    status: str
    prompt: str
    parameters: dict[str, Any]
    provider_id: int | None
    provider_name: str
    model: str
    reference_image_path: str | None
    error_message: str | None
    created_at: str
    completed_at: str | None


@dataclass(frozen=True)
class StoredImage:
    id: int
    generation_run_id: int
    local_path: str
    filename: str
    mime_type: str
    width: int | None
    height: int | None
    created_at: str


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds")


class WorkbenchStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.database_path = data_dir / DATABASE_FILENAME

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS providers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    default_model TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    recent_thumbnail_path TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );

                CREATE TABLE IF NOT EXISTS generation_runs (
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

                CREATE TABLE IF NOT EXISTS images (
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
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO schema_migrations (version, applied_at)
                VALUES (?, ?)
                """,
                (1, utc_now()),
            )
            self._migrate_to_v2(connection)

    def _migrate_to_v2(self, connection: sqlite3.Connection) -> None:
        migrated = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version = 2"
        ).fetchone()
        if migrated:
            return
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            )
            """
        )
        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(sessions)").fetchall()
        }
        if "project_id" not in columns:
            connection.execute(
                "ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"
            )
        if "is_pinned" not in columns:
            connection.execute(
                "ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"
            )
        connection.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)",
            (utc_now(),),
        )

    def schema_version(self) -> int:
        with self.connect() as connection:
            row = connection.execute("SELECT MAX(version) AS version FROM schema_migrations").fetchone()
        return int(row["version"] or 0)

    def create_provider(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str,
        default_model: str,
        is_default: bool = False,
    ) -> Provider:
        now = utc_now()
        with self.connect() as connection:
            if is_default:
                connection.execute("UPDATE providers SET is_default = 0, updated_at = ?", (now,))
            cursor = connection.execute(
                """
                INSERT INTO providers (
                    name, base_url, api_key, default_model, is_default, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (name, base_url, api_key, default_model, int(is_default), now, now),
            )
            provider_id = int(cursor.lastrowid)
        provider = self.get_provider(provider_id)
        if provider is None:
            raise RuntimeError("Created provider could not be loaded")
        return provider

    def get_provider(self, provider_id: int) -> Provider | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM providers WHERE id = ?", (provider_id,)).fetchone()
        return row_to_provider(row) if row else None

    def list_providers(self) -> list[Provider]:
        with self.connect() as connection:
            rows = connection.execute("SELECT * FROM providers ORDER BY id ASC").fetchall()
        return [row_to_provider(row) for row in rows]

    def update_provider(
        self,
        provider_id: int,
        *,
        name: str,
        base_url: str,
        api_key: str,
        default_model: str,
        is_default: bool = False,
    ) -> Provider:
        now = utc_now()
        with self.connect() as connection:
            if is_default:
                connection.execute(
                    "UPDATE providers SET is_default = 0, updated_at = ? WHERE id != ?",
                    (now, provider_id),
                )
            connection.execute(
                """
                UPDATE providers
                SET name = ?,
                    base_url = ?,
                    api_key = ?,
                    default_model = ?,
                    is_default = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (name, base_url, api_key, default_model, int(is_default), now, provider_id),
            )
        provider = self.get_provider(provider_id)
        if provider is None:
            raise KeyError(f"Provider {provider_id} does not exist")
        return provider

    def delete_provider(self, provider_id: int) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM providers WHERE id = ?", (provider_id,))

    def create_project(self, *, name: str) -> Project:
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO projects (name, created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, NULL)
                """,
                (name, now, now),
            )
            project_id = int(cursor.lastrowid)
        project = self.get_project(project_id)
        if project is None:
            raise RuntimeError("Created project could not be loaded")
        return project

    def get_project(self, project_id: int) -> Project | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", (project_id,)
            ).fetchone()
        return row_to_project(row) if row else None

    def list_projects(self) -> list[Project]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC"
            ).fetchall()
        return [row_to_project(row) for row in rows]

    def update_project(self, project_id: int, *, name: str) -> Project:
        with self.connect() as connection:
            connection.execute(
                "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                (name, utc_now(), project_id),
            )
        project = self.get_project(project_id)
        if project is None:
            raise KeyError(f"Project {project_id} does not exist")
        return project

    def delete_project(self, project_id: int) -> None:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                "UPDATE sessions SET project_id = NULL, updated_at = ? WHERE project_id = ?",
                (now, project_id),
            )
            connection.execute(
                "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                (now, now, project_id),
            )

    def create_session(self, *, title: str) -> Session:
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO sessions (
                    title, recent_thumbnail_path, project_id, is_pinned, created_at, updated_at, deleted_at
                )
                VALUES (?, NULL, NULL, 0, ?, ?, NULL)
                """,
                (title, now, now),
            )
            session_id = int(cursor.lastrowid)
        session = self.get_session(session_id)
        if session is None:
            raise RuntimeError("Created session could not be loaded")
        return session

    def get_session(self, session_id: int) -> Session | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL",
                (session_id,),
            ).fetchone()
        return row_to_session(row) if row else None

    def list_sessions(self) -> list[Session]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM sessions
                WHERE deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                """
            ).fetchall()
        return [row_to_session(row) for row in rows]

    def update_session(
        self,
        session_id: int,
        *,
        title: str,
        recent_thumbnail_path: str | None = None,
        project_id: int | None | object = UNSET,
    ) -> Session:
        now = utc_now()
        assignments: list[str] = ["title = ?", "recent_thumbnail_path = ?", "updated_at = ?"]
        parameters: list[object] = [title, recent_thumbnail_path, now]
        if project_id is not UNSET:
            assignments.append("project_id = ?")
            parameters.append(project_id)
        parameters.append(session_id)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE sessions SET {', '.join(assignments)} WHERE id = ? AND deleted_at IS NULL",
                parameters,
            )
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"Session {session_id} does not exist")
        return session

    def set_session_pinned(self, session_id: int, is_pinned: bool) -> Session:
        with self.connect() as connection:
            connection.execute(
                "UPDATE sessions SET is_pinned = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                (int(is_pinned), utc_now(), session_id),
            )
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"Session {session_id} does not exist")
        return session

    def delete_session(self, session_id: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                (utc_now(), utc_now(), session_id),
            )

    def create_generation_run(
        self,
        *,
        session_id: int,
        status: str,
        prompt: str,
        parameters: dict[str, Any],
        provider_id: int | None,
        provider_name: str,
        model: str,
        reference_image_path: str | None = None,
        error_message: str | None = None,
    ) -> GenerationRun:
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO generation_runs (
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    session_id,
                    status,
                    prompt,
                    json.dumps(parameters, ensure_ascii=False, sort_keys=True),
                    provider_id,
                    provider_name,
                    model,
                    reference_image_path,
                    error_message,
                    now,
                ),
            )
            run_id = int(cursor.lastrowid)
            connection.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
        run = self.get_generation_run(run_id)
        if run is None:
            raise RuntimeError("Created generation run could not be loaded")
        return run

    def get_generation_run(self, generation_run_id: int) -> GenerationRun | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM generation_runs WHERE id = ?",
                (generation_run_id,),
            ).fetchone()
        return row_to_generation_run(row) if row else None

    def list_generation_runs(self, session_id: int) -> list[GenerationRun]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM generation_runs
                WHERE session_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (session_id,),
            ).fetchall()
        return [row_to_generation_run(row) for row in rows]

    def finish_generation_run(
        self,
        generation_run_id: int,
        *,
        status: str,
        error_message: str | None,
    ) -> GenerationRun:
        completed_at = utc_now()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE generation_runs
                SET status = ?,
                    error_message = ?,
                    completed_at = ?
                WHERE id = ?
                """,
                (status, error_message, completed_at, generation_run_id),
            )
        run = self.get_generation_run(generation_run_id)
        if run is None:
            raise KeyError(f"Generation run {generation_run_id} does not exist")
        return run

    def add_image(
        self,
        *,
        generation_run_id: int,
        local_path: str,
        filename: str,
        mime_type: str,
        width: int | None = None,
        height: int | None = None,
    ) -> StoredImage:
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO images (
                    generation_run_id, local_path, filename, mime_type, width, height, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (generation_run_id, local_path, filename, mime_type, width, height, now),
            )
            image_id = int(cursor.lastrowid)
        image = self.get_image(image_id)
        if image is None:
            raise RuntimeError("Created image could not be loaded")
        return image

    def get_image(self, image_id: int) -> StoredImage | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        return row_to_image(row) if row else None

    def list_images(self, generation_run_id: int) -> list[StoredImage]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM images
                WHERE generation_run_id = ?
                ORDER BY id ASC
                """,
                (generation_run_id,),
            ).fetchall()
        return [row_to_image(row) for row in rows]


def row_to_provider(row: sqlite3.Row) -> Provider:
    return Provider(
        id=int(row["id"]),
        name=str(row["name"]),
        base_url=str(row["base_url"]),
        api_key=str(row["api_key"]),
        default_model=str(row["default_model"]),
        is_default=bool(row["is_default"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def row_to_session(row: sqlite3.Row) -> Session:
    return Session(
        id=int(row["id"]),
        title=str(row["title"]),
        recent_thumbnail_path=row["recent_thumbnail_path"],
        project_id=row["project_id"],
        is_pinned=bool(row["is_pinned"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def row_to_project(row: sqlite3.Row) -> Project:
    return Project(
        id=int(row["id"]),
        name=str(row["name"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def row_to_generation_run(row: sqlite3.Row) -> GenerationRun:
    return GenerationRun(
        id=int(row["id"]),
        session_id=int(row["session_id"]),
        status=str(row["status"]),
        prompt=str(row["prompt"]),
        parameters=json.loads(str(row["parameters_json"])),
        provider_id=row["provider_id"],
        provider_name=str(row["provider_name"]),
        model=str(row["model"]),
        reference_image_path=row["reference_image_path"],
        error_message=row["error_message"],
        created_at=str(row["created_at"]),
        completed_at=row["completed_at"],
    )


def row_to_image(row: sqlite3.Row) -> StoredImage:
    return StoredImage(
        id=int(row["id"]),
        generation_run_id=int(row["generation_run_id"]),
        local_path=str(row["local_path"]),
        filename=str(row["filename"]),
        mime_type=str(row["mime_type"]),
        width=row["width"],
        height=row["height"],
        created_at=str(row["created_at"]),
    )
