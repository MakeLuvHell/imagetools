from __future__ import annotations

import json
import os
import secrets
import socket
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 7860
TOKEN_PATH = ROOT_DIR / "build" / "desktop-dev-backend.json"


def publish_token(token: str) -> None:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = TOKEN_PATH.with_suffix(".tmp")
    temporary_path.write_text(json.dumps({"token": token}), encoding="utf-8")
    temporary_path.replace(TOKEN_PATH)


def prepare_backend() -> tuple[socket.socket, str]:
    token = secrets.token_urlsafe(32)
    # Publish before binding so a stale server can never satisfy this launch attempt.
    publish_token(token)
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind((HOST, PORT))
        listener.listen(socket.SOMAXCONN)
    except OSError as error:
        listener.close()
        raise OSError(f"Desktop development backend port {HOST}:{PORT} is already in use.") from error
    listener.set_inheritable(True)
    return listener, token


def main() -> None:
    listener, token = prepare_backend()
    environment = os.environ.copy()
    environment["IMAGE_TOOLS_DESKTOP_DEV_TOKEN"] = token
    arguments = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--fd",
        str(listener.fileno()),
        "--reload",
    ]
    os.execvpe(sys.executable, arguments, environment)


if __name__ == "__main__":
    main()
