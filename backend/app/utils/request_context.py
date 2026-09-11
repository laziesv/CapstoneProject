from fastapi import Request


def get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Return the originating IP address and user agent for an HTTP request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    real_ip = request.headers.get("x-real-ip")
    ip_address = None

    if forwarded_for:
        # X-Forwarded-For can contain "client, proxy1, proxy2"; the left-most
        # value is the original client as set by our trusted reverse proxy.
        ip_address = forwarded_for.split(",", maxsplit=1)[0].strip() or None

    if ip_address is None and real_ip:
        ip_address = real_ip.strip() or None

    if ip_address is None and request.client:
        ip_address = request.client.host

    return ip_address, request.headers.get("user-agent")
