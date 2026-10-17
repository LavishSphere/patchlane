import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..models.incident import Incident, IncidentStatus as S
from ..orchestration import incident_runner as runner
from ..services.demo_state import DemoState
from .deps import demo_state, require_operator

router = APIRouter(prefix="/api/incidents")


def current(state: DemoState, incident_id: str) -> Incident:
    if state.incident is None or state.incident.id != incident_id:
        raise HTTPException(404, f"{incident_id} is not the current incident")
    return state.incident


def require_status(incident: Incident, status: S) -> None:
    if incident.status != status:
        raise HTTPException(409, f"{incident.id} is {incident.status.value}, expected {status.value}")


@router.get("/current", response_model=Incident | None)
async def get_current(state: DemoState = Depends(demo_state)):
    return state.incident


@router.get("/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str, state: DemoState = Depends(demo_state)):
    return current(state, incident_id)


@router.post("/{incident_id}/investigate", response_model=Incident, status_code=202, dependencies=[Depends(require_operator)])
async def investigate(incident_id: str, state: DemoState = Depends(demo_state)):
    incident = current(state, incident_id)
    if state.task is not None and not state.task.done():
        raise HTTPException(409, "an investigation is already running")
    require_status(incident, S.DETECTED)
    state.task = asyncio.create_task(runner.investigate(state))
    return incident


@router.post("/{incident_id}/approve", response_model=Incident, dependencies=[Depends(require_operator)])
async def approve(incident_id: str, state: DemoState = Depends(demo_state)):
    incident = current(state, incident_id)
    require_status(incident, S.AWAITING_APPROVAL)
    return await runner.approve(state)


@router.post("/{incident_id}/reject", response_model=Incident, dependencies=[Depends(require_operator)])
async def reject(incident_id: str, state: DemoState = Depends(demo_state)):
    incident = current(state, incident_id)
    require_status(incident, S.AWAITING_APPROVAL)
    return await runner.reject(state)


@router.get("/{incident_id}/events")
async def events(incident_id: str, state: DemoState = Depends(demo_state)):
    """SSE: the current incident snapshot and every past event, then live updates.

    Two event names: `incident` (full Incident JSON) and `event` (PatchlaneEvent JSON).
    """
    # Plain StreamingResponse on purpose: sse-starlette closes every stream when *any*
    # uvicorn server in the process stops, and droid-sdk runs its tool server on one.
    current(state, incident_id)
    queue = state.bus.subscribe()

    async def stream():
        try:
            while True:
                try:
                    name, data = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                if name == "end":
                    break
                yield f"event: {name}\ndata: {data}\n\n"
        finally:
            state.bus.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
