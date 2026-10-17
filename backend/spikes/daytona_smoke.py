"""Daytona smoke test: snapshot -> sandbox -> upload -> reproduce -> replay -> delete.

Proves the Daytona half of the Patchlane pipeline before Droid is wired in,
and answers two open questions: does network_block_all work on our tier, and
how long does each step take.

Usage (from the repo root):
    .venv/bin/python backend/spikes/daytona_smoke.py

Needs DAYTONA_API_KEY in backend/.env or the environment. The first run builds
the snapshot, which takes a few minutes; later runs reuse it.
"""

import json
import os
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "demo"))

from daytona import (  # noqa: E402
    CreateSandboxFromSnapshotParams,
    CreateSnapshotParams,
    Daytona,
    DaytonaError,
    DaytonaNotFoundError,
    FileUpload,
    Image,
)
from dotenv import load_dotenv  # noqa: E402

from casekit import agent_tree, load_case  # noqa: E402

load_dotenv(REPO / "backend" / ".env")

SNAPSHOT = os.getenv("DAYTONA_SNAPSHOT", "patchlane-bank-service")
WORKDIR = "workspace/bank-service"
REQUIREMENTS = (REPO / "demo" / "bank-service" / "requirements.txt").read_text().split()

timings: list[tuple[str, float]] = []
checks: list[tuple[str, bool, str]] = []


@contextmanager
def timed(step: str):
    start = time.perf_counter()
    print(f"-> {step}...", flush=True)
    yield
    elapsed = time.perf_counter() - start
    timings.append((step, elapsed))
    print(f"   {elapsed:.1f}s", flush=True)


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, ok, detail))
    print(f"   {'PASS' if ok else 'FAIL'} {name} {detail}".rstrip(), flush=True)


def ensure_snapshot(daytona: Daytona) -> None:
    try:
        snapshot = daytona.snapshot.get(SNAPSHOT)
        print(f"   snapshot {SNAPSHOT} exists (state: {snapshot.state})")
        return
    except DaytonaNotFoundError:
        pass
    image = (
        Image.debian_slim("3.12")
        .run_commands(
            "apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*",
            "git config --global user.email patchlane@local",
            "git config --global user.name Patchlane",
            "git config --global init.defaultBranch main",
        )
        .pip_install(REQUIREMENTS)
    )
    daytona.snapshot.create(CreateSnapshotParams(name=SNAPSHOT, image=image), on_logs=lambda line: print("   |", line))


def create_sandbox(daytona: Daytona):
    params = dict(
        snapshot=SNAPSHOT,
        labels={"app": "patchlane", "role": "smoke"},
        auto_stop_interval=15,
        ttl_minutes=30,
    )
    try:
        return daytona.create(CreateSandboxFromSnapshotParams(**params, network_block_all=True)), "none"
    except DaytonaError as exc:
        print(f"   network_block_all rejected: {exc}")
        return daytona.create(CreateSandboxFromSnapshotParams(**params)), "restricted"


def run(sandbox, command: str) -> tuple[int, str]:
    response = sandbox.process.exec(command, cwd=WORKDIR, timeout=120)
    return response.exit_code, response.result or ""


def main() -> None:
    if not os.getenv("DAYTONA_API_KEY"):
        sys.exit("DAYTONA_API_KEY is not set (add it to backend/.env)")
    daytona = Daytona()

    with timed("snapshot ready"):
        ensure_snapshot(daytona)

    with tempfile.TemporaryDirectory() as tmp:
        tree = agent_tree(load_case("ownership-check"), Path(tmp) / "tree")
        files = [p for p in sorted(tree.rglob("*")) if p.is_file()]

        with timed("sandbox created"):
            sandbox, network = create_sandbox(daytona)
        print(f"   sandbox {sandbox.id} state={sandbox.state} network={network}")

        try:
            with timed(f"uploaded {len(files)} files"):
                sandbox.fs.upload_files(
                    [FileUpload(source=str(p), destination=f"{WORKDIR}/{p.relative_to(tree).as_posix()}") for p in files]
                )

            with timed("git baseline"):
                code, out = run(sandbox, "git init -q && git add -A && git commit -qm baseline && git tag baseline")
                check("baseline commit", code == 0, out.strip()[-200:])
                code, out = run(sandbox, "git rev-list --count HEAD")
                check("single commit of history", out.strip() == "1", f"({out.strip()})")

            with timed("network probe"):
                code, _ = run(
                    sandbox,
                    "timeout 5 python -c \"import urllib.request; urllib.request.urlopen('https://pypi.org', timeout=3)\"",
                )
                if network == "none":
                    check("outbound network blocked", code != 0)
                else:
                    print(f"   pypi.org reachable: {code == 0} (tier egress allow-list)")

            with timed("reproduce incident"):
                code, out = run(sandbox, "python -m pytest -q -p no:cacheprovider tests/test_incident.py")
                check("repro test fails on buggy code", code != 0, out.strip().splitlines()[-1] if out.strip() else "")

            with timed("regression suite"):
                code, out = run(sandbox, "python -m pytest -q -p no:cacheprovider tests/test_transfers.py")
                check("regression suite passes", code == 0, out.strip().splitlines()[-1] if out.strip() else "")

            with timed("replay incident log"):
                code, out = run(sandbox, "python scripts/replay.py --json")
                try:
                    replay = json.loads(out.strip().splitlines()[-1])
                except (ValueError, IndexError):
                    replay = {}
                check(
                    "replay reproduces the attacks",
                    replay.get("attacks_succeeded") == replay.get("attacks_total", -1) and replay.get("legit_blocked") == 0,
                    json.dumps(replay) if replay else out.strip()[-200:],
                )
        finally:
            with timed("sandbox deleted"):
                sandbox.delete()

    print("\nTimings")
    for step, seconds in timings:
        print(f"  {seconds:6.1f}s  {step}")
    print(f"\nNetwork policy: {network}")
    failed = [name for name, ok, _ in checks if not ok]
    print("All checks passed." if not failed else f"FAILED: {', '.join(failed)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
