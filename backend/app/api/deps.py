import secrets
from contextlib import asynccontextmanager

from fastapi import Header, HTTPException, Request

from ..services.demo_state import DemoState


def demo_state(request: Request) -> DemoState:
    return request.app.state.demo


@asynccontextmanager
async def exclusive(state: DemoState):
    """Run an operator action alone. A second one that arrives meanwhile gets a 409 and changes nothing."""
    if state.lock.locked():
        raise HTTPException(409, "another operator action is still running")
    async with state.lock:
        yield


def require_operator(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Mutating endpoints need the single shared operator token (SPEC §26)."""
    token = request.app.state.settings.operator_token
    if not token:
        raise HTTPException(503, "PATCHLANE_OPERATOR_TOKEN is not configured on the server")
    if not authorization or not secrets.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "operator token required")
