import secrets

from fastapi import Header, HTTPException, Request

from ..services.demo_state import DemoState


def demo_state(request: Request) -> DemoState:
    return request.app.state.demo


def require_operator(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Mutating endpoints need the single shared operator token (SPEC §26)."""
    token = request.app.state.settings.operator_token
    if not token:
        raise HTTPException(503, "PATCHLANE_OPERATOR_TOKEN is not configured on the server")
    if not authorization or not secrets.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "operator token required")
