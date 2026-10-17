"""Incident benchmark runner (SPEC §10.1).

Every case x run goes through the real pipeline, the same code path as the live
demo: incident_runner.trigger() and investigate() on a fresh DemoState, so an
agent Daytona sandbox, Factory Droid, then a clean verification sandbox with
held-out tests. Runs execute in parallel, bounded by --parallel (each run holds
two sandboxes at its peak). The rows are then scored in Chalk (score_chalk.py).

    cd backend && ../.venv/bin/python -m app.benchmark.run --cases all --runs 2 --parallel 3

Writes runs/benchmark-<UTC timestamp>.json, which /api/benchmark/latest serves.
`summary` is Patchlane's own verification aggregate. `chalk` holds the Chalk
evaluation, or {"available": false, "reason": ...}; nothing local stands in for it.
"""

import argparse
import asyncio
import json
import logging
import statistics
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ..config import RUNS_DIR, settings
from ..models.events import PatchlaneEvent
from ..orchestration import incident_runner
from ..services.demo_state import DemoState
from . import score_chalk

from casekit import Case, list_cases, load_case  # noqa: E402  (demo/ is on sys.path via config)

DEFAULT_TIMEOUT_S = 900.0  # Droid gets up to 2 x DROID_TIMEOUT_S (240 s) plus two sandboxes


# --- one run -----------------------------------------------------------------


def count_tool_calls(events: list[PatchlaneEvent]) -> int:
    """Droid's sandbox tool calls: droid.* events carrying a `tool`, minus their `.finished` echoes."""
    return sum(
        1
        for e in events
        if e.type.startswith("droid.") and "tool" in e.metadata and not e.type.endswith(".finished")
    )


def changed_files(events: list[PatchlaneEvent]) -> list[str]:
    """Every path git reports as changed in the agent sandbox (from the path guard), not Droid's own claim."""
    guards = [e for e in events if e.type == "verification.guard"]
    if not guards:
        return []
    meta = guards[-1].metadata
    return sorted({*meta.get("sourceFiles", []), *meta.get("tampered", []), *meta.get("droppedTests", [])})


def build_row(case: Case, run: int, state: DemoState, duration_s: float, error: str | None = None) -> dict:
    """One benchmark row (SPEC §10.1). None means "not measured", never "passed"."""
    incident = state.incident
    events = state.bus.history()
    verification = incident.verification if incident else None
    after = verification.after if verification else None
    replay = after.replay if (after is not None and case.meta.get("replay")) else None
    remediation = incident.remediation if incident else None
    agent = incident.agent_sandbox if incident else None
    return {
        "case_id": case.id,
        "run": run,
        "status": incident.status.value if incident else "runner_error",
        "verdict": verification.verdict if verification else "not_verified",
        "failure_reason": error or (incident.failure_reason if incident else None),
        "ground_truth_file": case.ground_truth["file"],
        "ground_truth_root_cause": case.ground_truth["root_cause"],
        "droid_root_cause": remediation.root_cause if remediation else None,
        "droid_changed_files": changed_files(events),
        "droid_reported_files": list(remediation.changed_files) if remediation else [],
        "repro_passed": after.repro_passed if after else None,
        "suite_passed": (after.suite_total > 0 and after.suite_passed == after.suite_total) if after else None,
        "hidden_passed": verification.hidden_passed if after else None,
        "hidden_total": verification.hidden_total if after else None,
        "tampering": verification.tampering if verification else None,
        "tampered_paths": list(verification.rejected_paths) if verification else [],
        "attacks_succeeded": replay.attacks_succeeded if replay else None,
        "legit_blocked": replay.legit_blocked if replay else None,
        "duration_s": round(duration_s, 1),
        "droid_tool_calls": count_tool_calls(events),
        "host_tools_blocked": agent.host_tools_blocked if agent else 0,
    }


async def run_case(case: Case, run: int, gate: asyncio.Semaphore, timeout_s: float = DEFAULT_TIMEOUT_S) -> dict:
    async with gate:
        state = DemoState(None)  # no runs_dir: benchmark runs are not recorded
        started = time.monotonic()
        error = None
        try:
            await incident_runner.trigger(state, case.id)
            await asyncio.wait_for(incident_runner.investigate(state), timeout=timeout_s)
        except asyncio.TimeoutError:
            error = f"benchmark timeout: no terminal state after {timeout_s:.0f}s"
        except Exception as exc:  # investigate() handles its own failures; this is the runner's
            error = f"runner error: {type(exc).__name__}: {str(exc)[:300]}"
        finally:
            duration = time.monotonic() - started
            await incident_runner.destroy_sandboxes(state)
        return build_row(case, run, state, duration, error)


async def run_all(cases: list[Case], runs: int, parallel: int, timeout_s: float = DEFAULT_TIMEOUT_S) -> list[dict]:
    gate = asyncio.Semaphore(parallel)
    jobs = [(case, n) for n in range(1, runs + 1) for case in cases]
    rows: list[dict] = []

    async def one(case: Case, n: int) -> None:
        row = await run_case(case, n, gate, timeout_s)
        rows.append(row)
        detail = row["failure_reason"] or ""
        print(
            f"[{len(rows)}/{len(jobs)}] {case.id} #{n}: {row['verdict']} ({row['status']}) "
            f"in {row['duration_s']}s, {row['droid_tool_calls']} tool calls {detail[:120]}",
            flush=True,
        )

    await asyncio.gather(*(one(case, n) for case, n in jobs))
    return sorted(rows, key=lambda r: (r["case_id"], r["run"]))


# --- aggregate ---------------------------------------------------------------


def summarize(rows: list[dict]) -> dict:
    """Honest aggregates of Patchlane's own verification. Not a Chalk score."""
    total = len(rows)
    verified = sum(1 for r in rows if r["verdict"] == "safe_to_review")
    durations = [r["duration_s"] for r in rows]
    tool_calls = [r["droid_tool_calls"] for r in rows]
    by_case: dict[str, dict] = {}
    for r in rows:
        entry = by_case.setdefault(r["case_id"], {"runs": 0, "verified": 0})
        entry["runs"] += 1
        entry["verified"] += r["verdict"] == "safe_to_review"
    return {
        "source": "Patchlane verification in a clean Daytona sandbox (not a Chalk score)",
        "runs": total,
        "verified": verified,
        "verifiedRate": round(verified / total, 3) if total else None,
        "notVerified": sum(1 for r in rows if r["verdict"] == "not_verified"),
        "tamperingChecked": sum(1 for r in rows if r["tampering"] is not None),
        "tampering": sum(1 for r in rows if r["tampering"] is True),
        "replayMeasured": sum(1 for r in rows if r["legit_blocked"] is not None),
        "legitBlocked": sum(1 for r in rows if (r["legit_blocked"] or 0) > 0),
        "attacksSucceeded": sum(1 for r in rows if (r["attacks_succeeded"] or 0) > 0),
        "medianDurationS": round(statistics.median(durations), 1) if durations else None,
        "totalRunTimeS": round(sum(durations), 1),  # compare with the file's wallClockS
        "medianToolCalls": statistics.median(tool_calls) if tool_calls else None,
        "statusCounts": dict(Counter(r["status"] for r in rows)),
        "byCase": by_case,
        "failures": [
            {"caseId": r["case_id"], "run": r["run"], "status": r["status"], "reason": r["failure_reason"]}
            for r in rows
            if r["verdict"] != "safe_to_review"
        ],
    }


# --- CLI ---------------------------------------------------------------------


def select_cases(spec: str) -> list[Case]:
    if spec == "all":
        return list_cases()
    return [load_case(case_id.strip()) for case_id in spec.split(",") if case_id.strip()]


def validate(cases: list[Case]) -> dict[str, list[str]]:
    """demo/validate_cases.py checks, run before any sandbox is spent (SPEC §4.4)."""
    from validate_cases import validate as validate_case  # demo/ is on sys.path via config

    failures = {}
    for case in cases:
        print(f"validating {case.id}", flush=True)
        problems = validate_case(case)
        if problems:
            failures[case.id] = problems
    return failures


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the incident benchmark through the real pipeline and score it in Chalk.")
    parser.add_argument("--cases", default="all", help="'all' or comma-separated case ids")
    parser.add_argument("--runs", type=int, default=2, help="runs per case")
    parser.add_argument("--parallel", type=int, default=3, help="concurrent runs (each holds 2 Daytona sandboxes)")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_S, help="seconds per run before it is abandoned")
    parser.add_argument("--no-chalk", action="store_true", help="skip Chalk scoring (recorded as unavailable)")
    parser.add_argument("--keep-chalk-functions", action="store_true", help="do not delete the Chalk functions after scoring")
    parser.add_argument("--skip-validation", action="store_true", help="skip demo/validate_cases.py checks")
    parser.add_argument("--out-dir", type=Path, default=RUNS_DIR, help="where benchmark-<ts>.json is written")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.runs < 1 or args.parallel < 1:
        parser.error("--runs and --parallel must be at least 1")
    if args.parallel > 4:
        print(f"warning: --parallel {args.parallel} needs {2 * args.parallel} sandboxes; the Daytona pool has about 10 vCPU", flush=True)
    cases = select_cases(args.cases)
    if not cases:
        parser.error("no cases selected")
    if not args.skip_validation:
        failures = validate(cases)
        if failures:
            for case_id, problems in failures.items():
                print(f"case {case_id} is invalid: {'; '.join(problems)}", file=sys.stderr)
            print("fix the cases or select others with --cases; no sandboxes were created", file=sys.stderr)
            return 2

    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    path = args.out_dir / f"benchmark-{stamp}.json"
    model = settings.droid_model or "default"
    print(f"benchmark {stamp}: {len(cases)} cases x {args.runs} runs, {args.parallel} at a time, model {model}", flush=True)

    started = time.monotonic()
    rows = asyncio.run(run_all(cases, args.runs, args.parallel, args.timeout))
    data = {
        "generatedAt": now.isoformat(),
        "model": model,
        "cases": [case.id for case in cases],
        "runsPerCase": args.runs,
        "parallel": args.parallel,
        "wallClockS": round(time.monotonic() - started, 1),
        "rows": rows,
        "summary": summarize(rows),
        "chalk": score_chalk.unavailable("Chalk scoring did not finish"),
    }
    write(path, data)  # keep the rows even if scoring dies
    summary = data["summary"]
    print(
        f"verified {summary['verified']}/{summary['runs']}, tampering {summary['tampering']}, "
        f"legit blocked {summary['legitBlocked']}, median {summary['medianDurationS']}s -> {path}",
        flush=True,
    )

    if args.no_chalk:
        data["chalk"] = score_chalk.unavailable("skipped (--no-chalk)")
    else:
        print("scoring in Chalk...", flush=True)
        data["chalk"] = score_chalk.score(
            rows,
            label=stamp.lower(),
            model=model,
            metadata={"benchmarkFile": path.name, "runsPerCase": args.runs},
            cleanup=not args.keep_chalk_functions,
        )
    write(path, data)
    score_chalk.print_scores(data["chalk"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
