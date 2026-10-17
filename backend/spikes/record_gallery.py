"""Record one real run per case for the public replay gallery.

Drives a running Patchlane API (real Daytona sandboxes, real Droid): reset,
trigger the case, investigate, approve once verification passes, then copies
the event recording to frontend/public/recordings/<case>.jsonl and rebuilds
index.json. A run that does not reach approval is reported and not published.

    cd backend && PATCHLANE_OPERATOR_TOKEN=local-dev PATCHLANE_RUNS_DIR=/tmp/pl-runs \\
        ../.venv/bin/uvicorn app.main:app --port 8010
    PATCHLANE_OPERATOR_TOKEN=local-dev PATCHLANE_API=http://127.0.0.1:8010 \\
        .venv/bin/python backend/spikes/record_gallery.py --runs-dir /tmp/pl-runs --cases all
"""

import argparse
import json
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "demo"))

from casekit import list_cases, load_case  # noqa: E402

API = os.getenv("PATCHLANE_API", "http://127.0.0.1:8000")
AUTH = {"Authorization": f"Bearer {os.environ['PATCHLANE_OPERATOR_TOKEN']}"}
GALLERY = REPO / "frontend" / "public" / "recordings"
GOLDEN = "golden"
TERMINAL = {"awaiting_approval", "investigation_failed", "verification_failed", "resolved", "rejected"}


def post(path: str, body: dict | None = None) -> dict | None:
    response = requests.post(f"{API}{path}", headers=AUTH, json=body, timeout=120)
    response.raise_for_status()
    return response.json() if response.content else None


def current() -> dict | None:
    return requests.get(f"{API}/api/incidents/current", timeout=30).json()


def wait_for(statuses: set[str], timeout_s: float) -> dict:
    started = time.monotonic()
    while True:
        incident = current()
        if incident and incident["status"] in statuses:
            return incident
        if time.monotonic() - started > timeout_s:
            raise TimeoutError(f"no {sorted(statuses)} after {timeout_s:.0f}s (status {incident and incident['status']})")
        time.sleep(1)


def record(case_id: str, runs_dir: Path) -> Path:
    post("/api/demo/reset")
    incident = post("/api/demo/trigger", {"caseId": case_id})
    time.sleep(2)  # let the detection read on screen before the run starts
    post(f"/api/incidents/{incident['id']}/investigate")
    done = wait_for(TERMINAL, timeout_s=300)
    if done["status"] != "awaiting_approval":
        raise RuntimeError(f"{case_id}: ended {done['status']}: {done.get('failureReason')}")
    time.sleep(3)  # an operator reading the evidence
    post(f"/api/incidents/{incident['id']}/approve")
    wait_for({"resolved"}, timeout_s=60)
    time.sleep(1)  # the last events are flushed after the status changes
    [path] = sorted(runs_dir.glob(f"{incident['id']}-*.jsonl"))
    return path


def entry(name: str, path: Path) -> dict:
    lines = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    incidents = [line["data"] for line in lines if line["kind"] == "incident"]
    last = incidents[-1]
    case = load_case(last["caseId"])
    variant_id = last.get("variantId") or "default"
    first_at, last_at = datetime.fromisoformat(lines[0]["at"]), datetime.fromisoformat(lines[-1]["at"])
    return {
        "name": name,
        "caseId": case.id,
        "title": case.meta["title"],
        "severity": case.meta["severity"],
        "safeguard": case.safeguard,
        "variantLabel": case.label(variant_id),
        "recordedAt": lines[0]["at"],
        "durationS": round((last_at - first_at).total_seconds(), 1),
    }


def write_index() -> None:
    names = [GOLDEN] + sorted(p.stem for p in GALLERY.glob("*.jsonl") if p.stem != GOLDEN)
    index = [entry(name, GALLERY / f"{name}.jsonl") for name in names if (GALLERY / f"{name}.jsonl").exists()]
    (GALLERY / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"index.json: {len(index)} recordings")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs-dir", type=Path, required=True, help="the server's PATCHLANE_RUNS_DIR")
    parser.add_argument("--cases", default="all", help="'all' (every case but the golden one) or comma-separated ids")
    parser.add_argument("--index-only", action="store_true", help="rebuild index.json from the files already there")
    args = parser.parse_args()

    if not args.index_only:
        golden_case = entry(GOLDEN, GALLERY / f"{GOLDEN}.jsonl")["caseId"]
        ids = [c.id for c in list_cases() if c.id != golden_case] if args.cases == "all" else args.cases.split(",")
        failed = []
        for case_id in ids:
            started = time.monotonic()
            try:
                path = record(case_id, args.runs_dir)
            except Exception as exc:  # report and move on; a failed run is never published
                failed.append(case_id)
                print(f"{case_id}: NOT recorded: {exc}", flush=True)
                continue
            shutil.copyfile(path, GALLERY / f"{case_id}.jsonl")
            print(f"{case_id}: recorded in {time.monotonic() - started:.0f}s -> {case_id}.jsonl", flush=True)
        post("/api/demo/reset")
        if failed:
            print(f"failed: {', '.join(failed)}")
    write_index()
    return 0


if __name__ == "__main__":
    sys.exit(main())
