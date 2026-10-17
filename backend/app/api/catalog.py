"""Read-only endpoints: cases, benchmark results, recorded runs."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..config import RUNS_DIR
from ..services.demo_state import DemoState
from .deps import demo_state

from casekit import list_cases  # noqa: E402  (demo/ is on sys.path via config)

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
