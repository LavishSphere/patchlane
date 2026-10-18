"""Read-only endpoints: cases, benchmark results, recorded runs."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from ..config import RUNS_DIR
from ..services.demo_state import DemoState
from .deps import demo_state

from casekit import MAX_BUGS, allowed_pairs, list_cases, load_case, scenario_key, scenario_status  # noqa: E402

router = APIRouter(prefix="/api")

NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


@router.get("/cases")
async def cases() -> list[dict]:
    return [
        {
            "id": c.id,
            "title": c.meta["title"],
            "severity": c.meta["severity"],
            "endpoint": c.meta["endpoint"],
            "safeguard": c.safeguard,
            "variants": c.options(),
        }
        for c in list_cases()
    ]


@router.get("/pairs")
async def pairs() -> dict:
    """Every two-bug combination the operator may choose, each side written case@variant."""
    return {"pairs": [list(p) for p in sorted(allowed_pairs())]}


BUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*@[a-z0-9]+(?:-[a-z0-9]+)*$")


@router.get("/scenarios/check")
async def check_scenario(bugs: str = Query(max_length=300)) -> dict:
    """Whether a set of bugs (case@variant, comma-separated) can run as one scenario, and why not."""
    items = bugs.split(",")
    if not 1 <= len(items) <= MAX_BUGS or not all(BUG.match(item) for item in items):
        raise HTTPException(422, f"bugs must be 1 to {MAX_BUGS} items written case@variant")
    chosen = []
    for item in items:
        case_id, variant_id = item.split("@")
        try:
            case = load_case(case_id)
            case.variant(variant_id)
        except (FileNotFoundError, KeyError):
            raise HTTPException(404, f"unknown bug {item!r}")
        chosen.append((case, variant_id))
    if len({case.id for case, _ in chosen}) != len(chosen):
        return {"allowed": False, "reason": "each safeguard can be chosen once"}
    if len(chosen) == 1:
        return {"allowed": True, "reason": None}
    allowed, reason = scenario_status(scenario_key(chosen))
    return {"allowed": allowed, "reason": reason}


@router.get("/benchmark/latest")
async def benchmark_latest(state: DemoState = Depends(demo_state)) -> dict:
    runs_dir = state.runs_dir or RUNS_DIR
    results = sorted(runs_dir.glob("benchmark-*.json")) if runs_dir.exists() else []
    if not results:
        return {"available": False}
    return {"available": True, **json.loads(results[-1].read_text())}


@router.get("/recordings/{name}")
async def recording(name: str, state: DemoState = Depends(demo_state)):
    if not NAME.match(name):
        raise HTTPException(400, "invalid recording name")
    path = (state.runs_dir or RUNS_DIR) / f"{name}.jsonl"
    if not path.is_file():
        raise HTTPException(404, f"no recording named {name!r}")
    return FileResponse(path, media_type="application/x-ndjson")
