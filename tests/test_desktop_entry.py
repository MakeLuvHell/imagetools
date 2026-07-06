from backend import desktop_entry


def test_desktop_host_defaults_to_loopback(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_HOST", raising=False)

    assert desktop_entry.desktop_host() == "127.0.0.1"


def test_desktop_host_uses_non_empty_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_HOST", "0.0.0.0")

    assert desktop_entry.desktop_host() == "0.0.0.0"


def test_desktop_port_defaults_to_7860(monkeypatch):
    monkeypatch.delenv("IMAGE_TOOLS_PORT", raising=False)

    assert desktop_entry.desktop_port() == 7860


def test_desktop_port_uses_valid_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_PORT", "49321")

    assert desktop_entry.desktop_port() == 49321


def test_desktop_port_rejects_invalid_environment_value(monkeypatch):
    monkeypatch.setenv("IMAGE_TOOLS_PORT", "not-a-port")

    try:
        desktop_entry.desktop_port()
    except ValueError as exc:
        assert "IMAGE_TOOLS_PORT" in str(exc)
    else:
        raise AssertionError("Expected invalid IMAGE_TOOLS_PORT to raise ValueError")
