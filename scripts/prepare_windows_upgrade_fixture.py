#!/usr/bin/env python3
"""Create and verify a redacted schema-v2 Windows upgrade workspace."""

from __future__ import annotations

import argparse
import binascii
import re
import shutil
import sqlite3
import struct
import sys
import zlib
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SENSITIVE_PATTERNS = (
    ("OpenAI-style API key", re.compile(rb"(?i)\bsk-[a-z0-9]")),
    ("Bearer credential", re.compile(rb"(?i)\bbearer\s+[a-z0-9._~+/=-]")),
)

SCHEMA_V2 = """
PRAGMA foreign_keys = ON;

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
"""

EXPECTED_COLUMNS = {
    "schema_migrations": ("version", "applied_at"),
    "providers": (
        "id",
        "name",
        "base_url",
        "api_key",
        "default_model",
        "is_default",
        "created_at",
        "updated_at",
    ),
    "projects": ("id", "name", "created_at", "updated_at", "deleted_at"),
    "sessions": (
        "id",
        "title",
        "recent_thumbnail_path",
        "created_at",
        "updated_at",
        "deleted_at",
        "project_id",
        "is_pinned",
    ),
    "generation_runs": (
        "id",
        "session_id",
        "status",
        "prompt",
        "parameters_json",
        "provider_id",
        "provider_name",
        "model",
        "reference_image_path",
        "error_message",
        "created_at",
        "completed_at",
    ),
    "images": (
        "id",
        "generation_run_id",
        "local_path",
        "filename",
        "mime_type",
        "width",
        "height",
        "created_at",
    ),
}


class FixtureError(Exception):
    """A validation error safe to print in CI."""


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = binascii.crc32(kind + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def one_pixel_png() -> bytes:
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    pixels = zlib.compress(b"\x00\x00\x00\x00\xff")
    return PNG_SIGNATURE + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", pixels) + png_chunk(b"IEND", b"")


def validate_png(payload: bytes) -> None:
    if not payload.startswith(PNG_SIGNATURE):
        raise FixtureError("result image does not have a PNG signature")

    offset = len(PNG_SIGNATURE)
    chunks: list[bytes] = []
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise FixtureError("result image has a truncated PNG chunk")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        end = offset + 12 + length
        if end > len(payload):
            raise FixtureError("result image has a truncated PNG payload")
        kind = payload[offset + 4 : offset + 8]
        data = payload[offset + 8 : offset + 8 + length]
        actual_crc = struct.unpack(">I", payload[offset + 8 + length : end])[0]
        expected_crc = binascii.crc32(kind + data) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise FixtureError("result image has an invalid PNG checksum")
        chunks.append(kind)
        offset = end

    if chunks[:1] != [b"IHDR"] or chunks[-1:] != [b"IEND"] or b"IDAT" not in chunks:
        raise FixtureError("result image has an invalid PNG chunk sequence")


def create_fixture(workspace: Path) -> None:
    workspace = workspace.resolve()
    if workspace.exists() and any(workspace.iterdir()):
        raise FixtureError("output workspace must not already contain files")

    created_workspace = not workspace.exists()
    workspace.mkdir(parents=True, exist_ok=True)
    database_path = workspace / "workbench.sqlite3"
    image_path = workspace / "images" / "result.png"

    try:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(one_pixel_png())

        with sqlite3.connect(database_path) as connection:
            connection.executescript(SCHEMA_V2)
            timestamp = "2026-07-15T00:00:00.000000+00:00"
            connection.executemany(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                ((1, timestamp), (2, timestamp)),
            )
            connection.execute(
                """INSERT INTO providers
                   (id, name, base_url, api_key, default_model, is_default, created_at, updated_at)
                   VALUES (1, 'Upgrade Fixture', 'https://api.example.invalid/v1',
                           'redacted', 'gpt-image-2', 1, ?, ?)""",
                (timestamp, timestamp),
            )
            connection.execute(
                """INSERT INTO projects (id, name, created_at, updated_at, deleted_at)
                   VALUES (1, 'Upgrade Project', ?, ?, NULL)""",
                (timestamp, timestamp),
            )
            connection.execute(
                """INSERT INTO sessions
                   (id, title, recent_thumbnail_path, created_at, updated_at,
                    deleted_at, project_id, is_pinned)
                   VALUES (1, 'Upgrade Session', 'images/result.png', ?, ?, NULL, 1, 1)""",
                (timestamp, timestamp),
            )
            connection.execute(
                """INSERT INTO generation_runs
                   (id, session_id, status, prompt, parameters_json, provider_id,
                    provider_name, model, reference_image_path, error_message,
                    created_at, completed_at)
                   VALUES (1, 1, 'succeeded', 'Upgrade fixture prompt',
                           '{"count":1,"quality":"high","ratio":"1:1"}', 1,
                           'Upgrade Fixture', 'gpt-image-2', NULL, NULL, ?, ?)""",
                (timestamp, timestamp),
            )
            connection.execute(
                """INSERT INTO images
                   (id, generation_run_id, local_path, filename, mime_type,
                    width, height, created_at)
                   VALUES (1, 1, 'images/result.png', 'result.png',
                           'image/png', 1, 1, ?)""",
                (timestamp,),
            )
            connection.commit()

        verify_fixture(workspace)
    except Exception:
        if created_workspace:
            shutil.rmtree(workspace, ignore_errors=True)
        raise


def assert_no_credentials(workspace: Path) -> None:
    for path in workspace.rglob("*"):
        if not path.is_file():
            continue
        payload = path.read_bytes()
        for label, pattern in SENSITIVE_PATTERNS:
            if pattern.search(payload):
                raise FixtureError(f"{label} pattern found in fixture file {path.name}")


def verify_fixture(workspace: Path) -> None:
    workspace = workspace.resolve()
    database_path = workspace / "workbench.sqlite3"
    if not database_path.is_file():
        raise FixtureError("workbench.sqlite3 is missing")

    with sqlite3.connect(f"file:{database_path.as_posix()}?mode=ro", uri=True) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        if connection.execute("PRAGMA foreign_keys").fetchone() != (1,):
            raise FixtureError("SQLite foreign key enforcement is disabled")
        if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise FixtureError("SQLite integrity check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise FixtureError("SQLite foreign key check failed")

        for table, expected in EXPECTED_COLUMNS.items():
            actual = tuple(row[1] for row in connection.execute(f"PRAGMA table_info({table})"))
            if actual != expected:
                raise FixtureError(f"schema-v2 columns do not match for table {table}")

        version = connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
        if version != 2:
            raise FixtureError("schema version is not 2")

        provider = connection.execute(
            "SELECT id, api_key, is_default FROM providers WHERE id = 1"
        ).fetchone()
        if provider is None or provider[1] not in ("", "redacted") or provider[2] != 1:
            raise FixtureError("redacted default Provider sample is missing")

        linked = connection.execute(
            """SELECT s.project_id, s.is_pinned, s.recent_thumbnail_path,
                      r.provider_id, r.status, i.local_path, i.mime_type
               FROM sessions AS s
               JOIN projects AS p ON p.id = s.project_id
               JOIN generation_runs AS r ON r.session_id = s.id
               JOIN images AS i ON i.generation_run_id = r.id
               WHERE s.id = 1 AND p.id = 1 AND r.id = 1 AND i.id = 1"""
        ).fetchone()
        expected_link = (1, 1, "images/result.png", 1, "succeeded", "images/result.png", "image/png")
        if linked != expected_link:
            raise FixtureError("linked project/session/run/image sample is missing or changed")

    relative_image = Path(linked[5])
    if relative_image.parts != ("images", "result.png"):
        raise FixtureError("image sample path is not the expected flat workspace path")
    image_path = workspace / relative_image
    if not image_path.is_file():
        raise FixtureError("result image file is missing")
    validate_png(image_path.read_bytes())
    assert_no_credentials(workspace)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create", "verify"):
        command = commands.add_parser(name, help=f"{name} the upgrade fixture")
        command.add_argument("workspace", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "create":
            create_fixture(args.workspace)
        else:
            verify_fixture(args.workspace)
    except (FixtureError, OSError, sqlite3.Error) as error:
        print(f"upgrade fixture error: {error}", file=sys.stderr)
        return 1
    print(f"Upgrade fixture {args.command} passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
