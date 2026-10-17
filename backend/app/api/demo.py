from fastapi import APIRouter, Body, Depends, HTTPException

from ..models.base import CamelModel
from ..models.incident import Incident
from ..orchestration import incident_runner as runner
from ..services.demo_state import DemoState
from .deps import demo_state, require_operator

router = APIRouter(prefix="/api/demo", dependencies=[Depends(require_operator)])


class TriggerRequest(CamelModel):
    case_id: str | None = None


@router.post("/trigger", response_model=Incident)
async def trigger(body: TriggerRequest = Body(default_factory=TriggerRequest), state: DemoState = Depends(demo_state)):
    if state.running:
        raise HTTPException(409, "an investigation is in progress; reset first")
    try:
        return await runner.trigger(state, body.case_id)
    except FileNotFoundError:
        raise HTTPException(404, f"unknown case {body.case_id!r}")


@router.post("/reset", status_code=204)
async def reset(state: DemoState = Depends(demo_state)) -> None:
    await runner.reset(state)
