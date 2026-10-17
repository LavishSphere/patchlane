"""Run the full pipeline N times through the real API and report reliability.

Each run: reset -> trigger -> investigate -> wait for a terminal state -> approve.
The fastest successful run's recording is copied to runs/golden.jsonl for replay mode.

    cd backend && PATCHLANE_OPERATOR_TOKEN=local-dev ../.venv/bin/uvicorn app.main:app --port 8000
    PATCHLANE_OPERATOR_TOKEN=local-dev .venv/bin/python backend/spikes/reliability.py --runs 10
"""

import argparse
import os
import shutil
import statistics
import time
from pathlib import Path

import requests

API = os.getenv("PATCHLANE_API", "http://127.0.0.1:8000")
AUTH = {"Authorization": f"Bearer {os.environ['PATCHLANE_OPERATOR_TOKEN']}"}
RUNS_DIR = Path(__file__).resolve().parents[2] / "runs"
TERMINAL = {"awaiting_approval", "investigation_failed", "verification_failed"}


def post(path: str) -> requests.Response:
    response = requests.post(f"{API}{path}", headers=AUTH, timeout=60)
    response.raise_for_status()
    return response


def one_run(number: int) -> dict:
    post("/api/demo/reset")
    incident = post("/api/demo/trigger").json()
    started = time.perf_counter()
    post(f"/api/incidents/{incident['id']}/investigate")
    while True:
        current = requests.get(f"{API}/api/incidents/current", timeout=30).json()
        if current["status"] in TERMINAL or time.perf_counter() - started > 300:
            break
        time.sleep(1)
    seconds = time.perf_counter() - started
    result = {"run": number, "id": incident["id"], "status": current["status"], "seconds": round(seconds, 1)}
    if current["status"] == "awaiting_approval":
        verification = current["verification"]
        after = verification["after"]
        result.update(
            hidden=f"{verification['hiddenPassed']}/{verification['hiddenTotal']}",
            attacks=f"{after['replay']['attacksSucceeded']}/{after['replay']['attacksTotal']}",
            legit_blocked=after["replay"]["legitBlocked"],
            changed=current["remediation"]["changedFiles"],
        )
        post(f"/api/incidents/{incident['id']}/approve")
        time.sleep(1)
    else:
        result["reason"] = current.get("failureReason")
    recordings = sorted(RUNS_DIR.glob(f"{incident['id']}-*.jsonl"), key=lambda p: p.stat().st_mtime)
    result["recording"] = str(recordings[-1]) if recordings else None
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=10)
    args = parser.parse_args()

    results = []
    for number in range(1, args.runs + 1):
        try:
            result = one_run(number)
        except Exception as exc:  # keep going; a crash is a failed run
            result = {"run": number, "status": "error", "reason": f"{type(exc).__name__}: {exc}", "seconds": None}
        results.append(result)
        print({k: v for k, v in result.items() if k != "recording"}, flush=True)

    ok = [r for r in results if r["status"] == "awaiting_approval"]
    times = [r["seconds"] for r in ok]
    print(f"\n{len(ok)}/{len(results)} runs reached approval with a verified fix")
    if times:
        print(f"seconds: min {min(times)}  median {statistics.median(times)}  max {max(times)}")
        best = min(ok, key=lambda r: r["seconds"])
        if best.get("recording"):
            shutil.copy(best["recording"], RUNS_DIR / "golden.jsonl")
            print(f"golden recording: run {best['run']} ({best['seconds']}s) -> runs/golden.jsonl")
    post("/api/demo/reset")


if __name__ == "__main__":
    main()
