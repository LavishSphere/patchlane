from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import ConfigDict, Field

from ..models.base import CamelModel
from ..models.incident import Incident
from ..orchestration import incident_runner as runner
from ..services.demo_state import DemoState
from .deps import demo_state, exclusive, require_operator

router = APIRouter(prefix="/api/demo", dependencies=[Depends(require_operator)])


ID = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class TriggerRequest(CamelModel):
    """Only ids from GET /api/cases are accepted. No free text, no extra fields."""

    model_config = ConfigDict(extra="forbid", strict=True)

    case_id: str | None = Field(default=None, pattern=ID, max_length=64)
    variant_id: str | None = Field(default=None, pattern=ID, max_length=64)
    second_case_id: str | None = Field(default=None, pattern=ID, max_length=64)
    second_variant_id: str | None = Field(default=None, pattern=ID, max_length=64)


@router.get("/session", status_code=204)
async def session() -> None:
    """Checks the operator token and changes nothing. The router's dependency answers 401 for a wrong one."""


@router.post("/trigger", response_model=Incident)
async def trigger(body: TriggerRequest = Body(default_factory=TriggerRequest), state: DemoState = Depends(demo_state)):
    async with exclusive(state):
        if state.running:
            raise HTTPException(409, "an investigation is in progress; reset first")
        try:
            return await runner.trigger(state, body.case_id, body.variant_id, body.second_case_id, body.second_variant_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc))
        except KeyError:
            raise HTTPException(404, "unknown variant for this case")
        except runner.PairNotAllowed as exc:
            raise HTTPException(422, str(exc))


@router.post("/reset", status_code=204)
async def reset(state: DemoState = Depends(demo_state)) -> None:
    async with exclusive(state):
        await runner.reset(state)
