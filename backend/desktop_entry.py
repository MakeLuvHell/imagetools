from __future__ import annotations

import os

import uvicorn


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7860


def desktop_host() -> str:
    return os.getenv("IMAGE_TOOLS_HOST", "").strip() or DEFAULT_HOST


def desktop_port() -> int:
    raw = os.getenv("IMAGE_TOOLS_PORT", "").strip()
    if not raw:
        return DEFAULT_PORT
    try:
        port = int(raw)
    except ValueError as exc:
        raise ValueError("IMAGE_TOOLS_PORT must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("IMAGE_TOOLS_PORT must be between 1 and 65535")
    return port


def main() -> None:
    uvicorn.run("backend.main:app", host=desktop_host(), port=desktop_port(), log_level="info")


if __name__ == "__main__":
    main()
