"""End-to-end run through the real API: trigger -> investigate -> verify -> approve.

Follows the SSE stream exactly like the frontend will and prints the timeline.
Needs a running backend with the same operator token:

    cd backend && PATCHLANE_OPERATOR_TOKEN=local-e2e ../.venv/bin/uvicorn app.main:app --port 8000
    PATCHLANE_OPERATOR_TOKEN=local-e2e .venv/bin/python backend/spikes/api_e2e.py
"""

import json
import os
import sys
import threading
import time

import requests

API = os.getenv("PATCHLANE_API", "http://127.0.0.1:8000")
AUTH = {"Authorization": f"Bearer {os.environ['PATCHLANE_OPERATOR_TOKEN']}"}
START = time.perf_counter()
state: dict = {"incident": None, "events": 0}


def follow(incident_id: str) -> None:
    with requests.get(f"{API}/api/incidents/{incident_id}/events", stream=True, timeout=(5, 300)) as response:
        name = None
        for raw in response.iter_lines(decode_unicode=True):
            if raw.startswith("event:"):
                name = raw.split(":", 1)[1].strip()
            elif raw.startswith("data:") and name:
                data = json.loads(raw.split(":", 1)[1])
                if name == "incident":
                    if state["incident"] is None or state["incident"]["status"] != data["status"]:
                        print(f"[{time.perf_counter() - START:6.1f}s] STATUS {data['status']}", flush=True)
                    state["incident"] = data
                elif name == "event":
                    state["events"] += 1
                    print(f"[{time.perf_counter() - START:6.1f}s]   {data['type']:<24} {data['title']}", flush=True)


def wait_for(statuses: set[str], timeout: float) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        incident = state["incident"]
        if incident and incident["status"] in statuses:
            return incident["status"]
        time.sleep(0.2)
    raise TimeoutError(f"no status in {statuses} after {timeout}s")


def main() -> None:
    requests.post(f"{API}/api/demo/reset", headers=AUTH, timeout=60).raise_for_status()
    incident = requests.post(f"{API}/api/demo/trigger", headers=AUTH, timeout=30).json()
    print(f"triggered {incident['id']}: {incident['alert']}")
    threading.Thread(target=follow, args=(incident["id"],), daemon=True).start()
    time.sleep(0.5)

    investigate_at = time.perf_counter()
    requests.post(f"{API}/api/incidents/{incident['id']}/investigate", headers=AUTH, timeout=30).raise_for_status()
    status = wait_for({"awaiting_approval", "investigation_failed", "verification_failed"}, timeout=240)
    pipeline = time.perf_counter() - investigate_at
    final = state["incident"]
    if status != "awaiting_approval":
        print(f"\nFAILED: {status}: {final.get('failureReason')}")
        sys.exit(1)

    before, after = final["before"], final["verification"]["after"]
    print(f"\nPipeline (investigate -> awaiting approval): {pipeline:.1f}s")
    print(f"Before: repro passed={before['reproPassed']} suite {before['suitePassed']}/{before['suiteTotal']} replay {before['replay']}")
    print(f"After:  repro passed={after['reproPassed']} suite {after['suitePassed']}/{after['suiteTotal']} "
          f"hidden {final['verification']['hiddenPassed']}/{final['verification']['hiddenTotal']} replay {after['replay']}")
    print(f"Root cause: {final['remediation']['rootCause']}")

    requests.post(f"{API}/api/incidents/{incident['id']}/approve", headers=AUTH, timeout=60).raise_for_status()
    wait_for({"resolved"}, timeout=30)
    time.sleep(0.5)
    final = state["incident"]
    destroyed = [s for s in (final["agentSandbox"], final["verificationSandbox"]) if s and s["destroyedAt"]]
    print(f"\nRESOLVED in {time.perf_counter() - START:.1f}s total, {state['events']} events, {len(destroyed)}/2 sandboxes destroyed")


if __name__ == "__main__":
    main()
