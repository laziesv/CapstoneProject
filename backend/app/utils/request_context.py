from fastapi import Request


def get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Return the originating IP address and user agent for an HTTP request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    ip_address = (
        forwarded_for.split(",", maxsplit=1)[0].strip()
        if forwarded_for
        else request.client.host if request.client else None
    )
    return ip_address, request.headers.get("user-agent")
