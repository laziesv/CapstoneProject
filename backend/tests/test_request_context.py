from types import SimpleNamespace

from starlette.datastructures import Headers

from app.utils.request_context import get_client_info


def make_request(headers: dict[str, str] | None = None, client_host: str | None = None):
    return SimpleNamespace(
        headers=Headers(headers or {}),
        client=SimpleNamespace(host=client_host) if client_host else None,
    )


def test_get_client_info_prefers_first_forwarded_for_ip():
    request = make_request(
        {
            "x-forwarded-for": "203.0.113.10, 172.18.0.1",
            "x-real-ip": "198.51.100.20",
            "user-agent": "browser",
        },
        client_host="172.18.0.2",
    )

    ip_address, user_agent = get_client_info(request)

    assert ip_address == "203.0.113.10"
    assert user_agent == "browser"


def test_get_client_info_falls_back_to_real_ip():
    request = make_request(
        {"x-real-ip": "198.51.100.20"},
        client_host="172.18.0.2",
    )

    ip_address, _ = get_client_info(request)

    assert ip_address == "198.51.100.20"


def test_get_client_info_falls_back_to_connection_host():
    request = make_request(client_host="172.18.0.2")

    ip_address, _ = get_client_info(request)

    assert ip_address == "172.18.0.2"
