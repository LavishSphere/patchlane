"""Droid smoke test: real Factory Droid fixing the ownership-check case in a real Daytona sandbox.

Prints every timeline event as it happens, then checks inside the sandbox that
the incident test passes, the regression suite passes, and the replay blocks
the attacks. Answers: does tool lockdown work, which tools does Droid see, and
how long does a fix take.

Usage (from the repo root):
    .venv/bin/python backend/spikes/droid_smoke.py [--model MODEL] [--keep]
"""

import argparse
import asyncio
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.integrations.daytona import create_sandbox  # noqa: E402
from app.integrations.factory import DroidRunFailed, DroidUnavailable, run_droid  # noqa: E402
from app.monitoring.detector import detect  # noqa: E402
from casekit import agent_tree, load_case  # noqa: E402

START = time.perf_counter()


def emit(type: str, title: str, detail=None, metadata=None) -> None:
    print(f"[{time.perf_counter() - START:6.1f}s] {type:<24} {title}", flush=True)
    if type in {"droid.isolation", "droid.tool.blocked"} and metadata:
        print(f"{'':33}{json.dumps(metadata)}", flush=True)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", help="Droid model id (defaults to DROID_MODEL or Factory's default)")
    parser.add_argument("--keep", action="store_true", help="leave the sandbox running for inspection")
    args = parser.parse_args()

    case = load_case("ownership-check")
    detection = detect(case)
    sandbox = None
    with tempfile.TemporaryDirectory() as tmp:
        tree = agent_tree(case, Path(tmp) / "tree")
        try:
            sandbox = await create_sandbox("agent")
            emit("sandbox.ready", f"Daytona sandbox {sandbox.id} (network: {sandbox.summary.network_policy})")
            await sandbox.upload_tree(tree)
            await sandbox.git_baseline()
            repro = await sandbox.exec("python -m pytest -q -p no:cacheprovider tests/test_incident.py")
            emit("incident.reproduced", f"repro exit code {repro.exit_code} (expected non-zero)")

            droid_start = time.perf_counter()
            remediation = await run_droid(
                sandbox=sandbox,
                case_meta=case.meta,
                alert=detection.alert,
                repro_output=repro.output,
                emit=emit,
                on_first_write=lambda: emit("state", "PATCHING"),
                model=args.model,
            )
            droid_seconds = time.perf_counter() - droid_start

            print("\n=== RemediationResult ===")
            print(remediation.model_dump_json(indent=2))
            diff = await sandbox.exec("git add -A && git diff --cached --stat baseline && git diff --cached baseline")
            print("\n=== Diff ===\n" + diff.output)

            print("=== Checks in the agent sandbox (verification sandbox comes later) ===")
            for name, command in [
                ("incident test", "python -m pytest -q -p no:cacheprovider tests/test_incident.py"),
                ("regression suite", "python -m pytest -q -p no:cacheprovider tests/test_transfers.py"),
                ("replay", "python scripts/replay.py --json"),
            ]:
                result = await sandbox.exec(command)
                last = result.output.strip().splitlines()[-1] if result.output.strip() else ""
                print(f"  {name:<17} exit={result.exit_code}  {last}")
            print(f"\nDroid time: {droid_seconds:.1f}s   total: {time.perf_counter() - START:.1f}s")
            print(f"Host tools blocked: {sandbox.summary.host_tools_blocked}   sandbox commands: {sandbox.summary.commands_executed}")
        except (DroidUnavailable, DroidRunFailed) as exc:
            print(f"\nDROID FAILED: {exc}")
            sys.exit(1)
        finally:
            if sandbox is not None and not args.keep:
                await sandbox.delete()
                emit("sandbox.destroyed", sandbox.id)
            elif sandbox is not None:
                print(f"Sandbox kept: {sandbox.id} (auto-deletes via TTL)")


if __name__ == "__main__":
    asyncio.run(main())
