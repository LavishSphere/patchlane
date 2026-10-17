"""Score benchmark rows with a Chalk evaluation (SPEC §10.2).

Each benchmark run uploads its rows as a Chalk dataset and runs a new, immutable
evaluation: a pass-through task plus five scorers (see chalk_functions.py).
Chalk computes every per-row scorer value. Patchlane then derives two things
from those values, and labels them as derived:

  composite  40% fixed + 25% no_regressions + 15% no_tampering
             + 10% correct_file + 10% root_cause
  gate       safe_to_review needs fixed == 1, no_regressions == 1 and
             no_tampering == 1. Weights never override the gate.

If Chalk fails at any step the result is {"available": false, "reason": ...}
with no scores. A locally computed score is never put in a Chalk score's place.

chalkcompute and pyarrow are imported lazily, so the API server and CI never
need them. Importing chalk_functions deploys the functions, so it happens only
inside score().

Re-score an existing benchmark file (no Daytona or Droid needed):
    cd backend && ../.venv/bin/python -m app.benchmark.score_chalk ../runs/benchmark-<ts>.json
"""

import argparse
import json
import logging
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from .. import config  # noqa: F401  (loads backend/.env, which holds CHALK_ROUTER_KEY)

log = logging.getLogger("patchlane.benchmark")

WEIGHTS = {
    "fixed": 0.40,
    "no_regressions": 0.25,
    "no_tampering": 0.15,
    "correct_file": 0.10,
    "root_cause": 0.10,
}
GATE = ("fixed", "no_regressions", "no_tampering")
EPSILON = 1e-9

SCORER_INFO = {
    "fixed": {
        "type": "custom function",
        "measures": "share of held-out hidden tests that pass in the clean verification sandbox",
    },
    "no_regressions": {
        "type": "Chalk SQL",
        "measures": "regression suite passes and the incident replay blocks no legitimate transfer",
    },
    "no_tampering": {
        "type": "Chalk SQL",
        "measures": "the path guard ran and found no edits outside bank_service/",
    },
    "correct_file": {
        "type": "contains (built-in)",
        "measures": "files changed in the agent sandbox, per git, include the ground-truth file",
    },
    "root_cause": {
        "type": "llm_judge",
        "measures": "Droid's stated root cause matches the ground-truth sentence (1, 0.5 or 0)",
    },
}

DERIVED_NOTE = (
    "Per-row scorer values come from Chalk. Patchlane computes the weighted composite "
    "and the safe_to_review gate from those values."
)

# Column order and types of the dataset uploaded to Chalk.
DATASET_SCHEMA = (
    ("row_id", "string"),
    ("case_id", "string"),
    ("run", "int64"),
    ("status", "string"),
    ("verdict", "string"),
    ("ground_truth_file", "string"),
    ("ground_truth_root_cause", "string"),
    ("droid_root_cause", "string"),
    ("droid_changed_files", "string"),  # JSON list: built-in scorer inputs are str
    ("repro_passed", "bool"),
    ("suite_passed", "bool"),
    ("hidden_passed", "int64"),
    ("hidden_total", "int64"),
    ("tampering_checked", "bool"),
    ("tampering", "bool"),
    ("attacks_succeeded", "int64"),  # NULL when the case has no replay or it never ran
    ("legit_blocked", "int64"),  # NULL when the case has no replay or it never ran
    ("duration_s", "float64"),
    ("droid_tool_calls", "int64"),
)


# --- pure scoring math -------------------------------------------------------


def composite(scores: dict[str, float | None]) -> float | None:
    """Weighted composite, or None if any scorer has no value for the row."""
    if any(scores.get(name) is None for name in WEIGHTS):
        return None
    return round(sum(weight * scores[name] for name, weight in WEIGHTS.items()), 4)


def passes_gate(scores: dict[str, float | None]) -> bool | None:
    """The hard gate, or None if a gated scorer has no value for the row."""
    if any(scores.get(name) is None for name in GATE):
        return None
    return all(scores[name] >= 1.0 - EPSILON for name in GATE)


def row_id(row: dict) -> str:
    return f"{row['case_id']}#{row['run']}"


def chalk_rows(rows: list[dict]) -> list[dict]:
    """Benchmark rows as typed dataset rows. Unmeasured values become failures, never passes."""
    out = []
    for row in rows:
        out.append(
            {
                "row_id": row_id(row),
                "case_id": row["case_id"],
                "run": int(row["run"]),
                "status": row.get("status") or "",
                "verdict": row.get("verdict") or "",
                "ground_truth_file": row.get("ground_truth_file") or "",
                "ground_truth_root_cause": row.get("ground_truth_root_cause") or "",
                "droid_root_cause": row.get("droid_root_cause") or "",
                "droid_changed_files": json.dumps(row.get("droid_changed_files") or []),
                "repro_passed": row.get("repro_passed") is True,
                "suite_passed": row.get("suite_passed") is True,
                "hidden_passed": int(row.get("hidden_passed") or 0),
                "hidden_total": int(row.get("hidden_total") or 0),
                "tampering_checked": row.get("tampering") is not None,
                "tampering": row.get("tampering") is True,
                "attacks_succeeded": row.get("attacks_succeeded"),
                "legit_blocked": row.get("legit_blocked"),
                "duration_s": float(row.get("duration_s") or 0.0),
                "droid_tool_calls": int(row.get("droid_tool_calls") or 0),
            }
        )
    return out


def _number(value: Any) -> float | None:
    if isinstance(value, dict):  # tolerate a {score, metadata} struct
        value = value.get("score")
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _metadata(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except ValueError:
            return {}
    return {}


def parse_results(result_rows: list[dict], columns: dict[str, str], rows: list[dict]) -> dict:
    """Per-row Chalk scores plus the derived composite and gate.

    `columns` maps each logical scorer name to its result-column prefix, so its
    value is `<prefix>_value` and its error `<prefix>_error`. Rows that errored
    in Chalk keep None for that scorer and are listed, never dropped.
    """
    by_id = {r.get("row_id"): r for r in result_rows}
    entries = []
    for row in rows:
        result = by_id.get(row_id(row))
        scores: dict[str, float | None] = {name: None for name in WEIGHTS}
        errors: dict[str, str] = {}
        judge_reason = None
        if result is None:
            errors["row"] = "missing from the Chalk result dataset"
        else:
            if result.get("output_error"):
                errors["task"] = str(result["output_error"])[:300]
            for name, prefix in columns.items():
                error = result.get(f"{prefix}_error")
                if error:
                    errors[name] = str(error)[:300]
                    continue
                scores[name] = _number(result.get(f"{prefix}_value"))
                if scores[name] is None:
                    errors[name] = "no value"
            reason = _metadata(result.get(f"{columns['root_cause']}_metadata")).get("reason")
            judge_reason = str(reason)[:400] if reason else None
        gate = passes_gate(scores)
        verified = row.get("verdict") == "safe_to_review"
        entries.append(
            {
                "caseId": row["case_id"],
                "run": row["run"],
                "scores": scores,
                "composite": composite(scores),
                "safeToReview": gate,
                "verdict": row.get("verdict"),
                "agreesWithVerification": None if gate is None else gate == verified,
                "judgeReason": judge_reason,
                "errors": errors,
            }
        )
    return {"rows": entries, "aggregate": aggregate(entries)}


def aggregate(entries: list[dict]) -> dict:
    composites = [e["composite"] for e in entries if e["composite"] is not None]
    means = {}
    for name in WEIGHTS:
        values = [e["scores"][name] for e in entries if e["scores"][name] is not None]
        means[name] = round(statistics.fmean(values), 4) if values else None
    return {
        "rows": len(entries),
        "rowsScored": len(composites),
        "rowsWithErrors": sum(1 for e in entries if e["errors"]),
        "meanComposite": round(statistics.fmean(composites), 4) if composites else None,
        "scorerMeans": means,
        "safeToReview": sum(1 for e in entries if e["safeToReview"] is True),
        "gateAgreesWithVerification": sum(1 for e in entries if e["agreesWithVerification"] is True),
        "gateDisagreements": [
            {"caseId": e["caseId"], "run": e["run"]} for e in entries if e["agreesWithVerification"] is False
        ],
    }


def unavailable(reason: str, **extra: Any) -> dict:
    return {"available": False, "reason": reason, **extra}


# --- Chalk -------------------------------------------------------------------


def _load_chalk():
    """Import chalkcompute and deploy the benchmark functions (patched out in tests)."""
    import chalkcompute

    from . import chalk_functions

    assert set(chalk_functions.SCORERS) == set(WEIGHTS), "scorers and weights disagree"
    return chalkcompute, chalk_functions


def _to_arrow(rows: list[dict]):
    import pyarrow as pa

    types = {"string": pa.string(), "int64": pa.int64(), "bool": pa.bool_(), "float64": pa.float64()}
    schema = pa.schema([pa.field(name, types[kind]) for name, kind in DATASET_SCHEMA])
    return pa.Table.from_pylist(chalk_rows(rows), schema=schema)


def _status(run: Any) -> str:
    status = getattr(run, "status", None)
    return str(getattr(status, "value", status))


def _result_columns(column_names: list[str], evaluation: Any, fns: Any) -> dict[str, str]:
    """Logical scorer name -> result-column prefix, checked against the real columns."""
    names = set(column_names)
    by_version: dict[str, str] = {}
    for name, scorer in fns.SCORERS.items():
        info = getattr(scorer, "version_info", None)
        if info is not None:
            by_version[info.id] = name
    by_scorer_id: dict[str, list[str]] = {}
    for scorer in getattr(evaluation, "scorers", ()) or ():
        name = by_version.get(getattr(scorer, "function_version_id", None) or "")
        if name is None:
            sql_name = getattr(scorer, "sql_name", None)
            name = next((n for n, chalk_name in fns.CHALK_NAMES.items() if chalk_name == sql_name), None)
        if name is not None:
            by_scorer_id.setdefault(name, []).extend([scorer.id, f"scorer_{scorer.id}"])

    columns = {}
    for name, chalk_name in fns.CHALK_NAMES.items():
        candidates = [chalk_name, chalk_name.replace("-", "_"), *by_scorer_id.get(name, [])]
        prefix = next((c for c in candidates if f"{c}_value" in names), None)
        if prefix is None:  # a sanitized variant of the name, if exactly one column has it
            loose = [c[: -len("_value")] for c in names if c.endswith("_value") and chalk_name.replace("-", "_") in c.replace("-", "_")]
            prefix = loose[0] if len(loose) == 1 else None
        if prefix is None:
            raise RuntimeError(f"Chalk result has no value column for scorer {name!r}; columns: {sorted(names)}")
        columns[name] = prefix
    return columns


def _cleanup(cc: Any, fns: Any) -> dict:
    """Delete the deployed functions so nothing keeps running between benchmarks."""
    deleted, failed = [], {}
    for name, handle in fns.DEPLOYED.items():
        try:
            handle.delete()
            deleted.append(name)
        except Exception as first:
            try:
                cc.RemoteFunction.from_name(name).delete()
                deleted.append(name)
            except Exception as second:
                failed[name] = f"{type(first).__name__}: {str(first)[:120]} / {type(second).__name__}: {str(second)[:120]}"
    # The handles are stale now; a later score() in this process must re-import, which redeploys.
    sys.modules.pop(fns.__name__, None)
    package, _, child = fns.__name__.rpartition(".")
    parent = sys.modules.get(package)
    if parent is not None and getattr(parent, child, None) is fns:
        delattr(parent, child)
    return {"deleted": deleted, "deleteFailed": failed}


def _evaluate(cc: Any, fns: Any, rows: list[dict], *, label: str, prefix: str, metadata: dict, timeout_s: float, ids: dict) -> dict:
    ids["datasetName"] = f"{prefix}-benchmark-{label}"
    dataset = cc.DatasetClient().upload(ids["datasetName"], _to_arrow(rows))
    ids["datasetRevisionId"] = getattr(dataset, "revision_id", None)
    evaluation = cc.Evaluation.create(
        f"{prefix}-{label}",
        dataset=dataset,
        task=fns.TASK,
        scorers=list(fns.SCORERS.values()),
        metadata=metadata,
    )
    ids["evaluationId"] = evaluation.id
    ids["evaluationName"] = evaluation.name
    run = evaluation.run(metadata=metadata)
    ids["runId"] = run.id
    run = run.wait(timeout=timeout_s, raise_on_failure=False)
    ids["runStatus"] = _status(run)
    if ids["runStatus"] != "succeeded" or run.result_dataset is None:
        detail = getattr(run, "error_message", None) or "no result dataset"
        return unavailable(f"Chalk evaluation run {ids['runStatus']}: {detail}", **ids)
    ids["resultDatasetRevisionId"] = run.result_dataset.revision_id
    table = cc.DatasetClient().read(run.result_dataset)
    columns = _result_columns(list(table.column_names), evaluation, fns)
    parsed = parse_results(table.to_pylist(), columns, rows)
    return {
        "available": True,
        **ids,
        "judgeModel": fns.JUDGE_MODEL,
        "weights": WEIGHTS,
        "gate": list(GATE),
        "scorers": {name: {**SCORER_INFO[name], "chalkName": fns.CHALK_NAMES[name]} for name in WEIGHTS},
        "derived": DERIVED_NOTE,
        **parsed,
    }


def score(
    rows: list[dict],
    *,
    label: str,
    model: str,
    metadata: dict | None = None,
    prefix: str = "patchlane",
    cleanup: bool = True,
    timeout_s: float = 900.0,
) -> dict:
    """Score benchmark rows in Chalk. Returns the `chalk` block of the benchmark file."""
    started = time.monotonic()
    if not rows:
        return unavailable("no benchmark rows to score")
    if not os.getenv("CHALK_ROUTER_KEY"):
        return unavailable("CHALK_ROUTER_KEY is not set in backend/.env, so the root_cause judge cannot run")
    try:
        cc, fns = _load_chalk()
    except Exception as exc:
        return unavailable(f"Chalk SDK unavailable: {type(exc).__name__}: {str(exc)[:300]}")

    ids: dict[str, Any] = {}
    run_metadata = {"source": "patchlane-benchmark", "model": model, "label": label, **(metadata or {})}
    try:
        result = _evaluate(cc, fns, rows, label=label, prefix=prefix, metadata=run_metadata, timeout_s=timeout_s, ids=ids)
    except Exception as exc:
        log.exception("Chalk scoring failed")
        result = unavailable(f"{type(exc).__name__}: {str(exc)[:300]}", **ids)
    if cleanup:
        result["functions"] = _cleanup(cc, fns)
    result["durationS"] = round(time.monotonic() - started, 1)
    return result


# --- CLI: (re)score an existing benchmark file --------------------------------


def print_scores(chalk: dict) -> None:
    if not chalk.get("available"):
        print(f"Chalk evaluation unavailable: {chalk.get('reason')}")
        return
    print(f"Chalk evaluation {chalk['evaluationId']} (run {chalk['runId']}, {chalk['durationS']}s)")
    header = f"{'case':<24}{'run':>4}  " + "  ".join(f"{n[:9]:>9}" for n in WEIGHTS) + f"  {'composite':>9}  gate"
    print(header)
    for e in chalk["rows"]:
        values = "  ".join(f"{'-' if e['scores'][n] is None else format(e['scores'][n], '.2f'):>9}" for n in WEIGHTS)
        comp = "-" if e["composite"] is None else f"{e['composite']:.3f}"
        print(f"{e['caseId']:<24}{e['run']:>4}  {values}  {comp:>9}  {e['safeToReview']}")
        if e["errors"]:
            print(f"    errors: {e['errors']}")
    agg = chalk["aggregate"]
    print(f"mean composite {agg['meanComposite']}, safe_to_review {agg['safeToReview']}/{agg['rows']}, "
          f"gate agrees with verification on {agg['gateAgreesWithVerification']}/{agg['rows']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score a benchmark file's rows in Chalk and write the result back.")
    parser.add_argument("path", type=Path, help="runs/benchmark-<ts>.json")
    parser.add_argument("--prefix", default="patchlane", help="name prefix for the Chalk dataset and evaluation")
    parser.add_argument("--keep-functions", action="store_true", help="do not delete the Chalk functions afterwards")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)

    data = json.loads(args.path.read_text())
    # Evaluations are immutable, so every scoring attempt gets its own name.
    label = f"{args.path.stem.removeprefix('benchmark-').lower()}-rescore-{time.strftime('%H%M%S')}"
    chalk = score(
        data["rows"],
        label=label,
        model=data.get("model", "unknown"),
        metadata={"benchmarkFile": args.path.name},
        prefix=args.prefix,
        cleanup=not args.keep_functions,
    )
    data["chalk"] = chalk
    args.path.write_text(json.dumps(data, indent=2) + "\n")
    print_scores(chalk)
    return 0 if chalk.get("available") else 1


if __name__ == "__main__":
    sys.exit(main())
