import json
import socket

import pytest

from scripts import run_desktop_dev_backend as launcher


def test_prepare_backend_publishes_new_token_before_rejecting_busy_port(tmp_path, monkeypatch):
    token_path = tmp_path / "desktop-dev-backend.json"
    monkeypatch.setattr(launcher, "TOKEN_PATH", token_path)
    busy_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    busy_socket.bind(("127.0.0.1", 0))
    monkeypatch.setattr(launcher, "PORT", busy_socket.getsockname()[1])

    try:
        with pytest.raises(OSError, match="already in use"):
            launcher.prepare_backend()
    finally:
        busy_socket.close()

    payload = json.loads(token_path.read_text())
    assert isinstance(payload["token"], str)
    assert payload["token"]
