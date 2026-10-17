"""The benchmark runner and Chalk scoring, offline: fake sandboxes, fake Droid, fake Chalk."""

import asyncio
import json
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.benchmark import run as bench
from app.benchmark import score_chalk
from app.config import Settings
from app.integrations.factory import DroidRunFailed
from app.main import create_app
from app.models.remediation import RemediationResult, TestRun
from app.orchestration import incident_runner
from app.orchestration.verification import AGENT_PATCH, FULL_DIFF

from casekit import load_case
from fakes import BUGGY, FIXED, REPLAY_ALL_BLOCKED, SOURCE_PATCH, FakeSandbox, failed, ok

CASE = "ownership-check"


def remediation() -> RemediationResult:
    return RemediationResult(
        root_cause="transfer() never checks that the requester owns the source account",
        changed_files=["bank_service/transfers.py"],
        patch_summary="Added the ownership check",
        tests_run=[TestRun(command="pytest", passed=True, summary="21 passed")],
        risk="low",
        confidence=0.9,
        human_summary="Unauthorized debits are now rejected.",
    )


async def droid_with_tool_calls(*, emit, on_first_write, **kwargs):
    emit("droid.started", "Factory Droid investigating", None, {"model": "default"})
    emit("droid.tool.call", "Listing .", None, {"tool": "sandbox_list_files"})
    emit("droid.file.read", "Reading bank_service/transfers.py", None, {"tool": "sandbox_read_file"})
    emit("droid.tests", "Running tests", "pytest", {"tool": "sandbox_run_tests"})
    emit("droid.tests.finished", "1 failed", "...", {"tool": "sandbox_run_tests", "exit_code": 1})
    emit("droid.message", "The transfer lacks an ownership check", "...", {})
    emit("droid.tool.blocked", "Blocked host tool: Execute", None, {"blocked": ["Execute"]})
    on_first_write()
    emit("droid.file.written", "Patched bank_service/transfers.py", None, {"tool": "sandbox_write_file"})
    return remediation()


@pytest.fixture
def fake_pipeline(monkeypatch):
    """Fresh fake sandboxes per create_sandbox call; returns (created, agent_results, verify_results)."""
    created: list[FakeSandbox] = []
    agent_results = dict(BUGGY)
    verify_results = dict(FIXED)

    async def fake_create(role, on_change=lambda: None):
        if role == "agent":
            sandbox = FakeSandbox("agent", agent_results, files={FULL_DIFF: b"diff --git ...", AGENT_PATCH: SOURCE_PATCH})
        else:
            sandbox = FakeSandbox("verification", verify_results)
        created.append(sandbox)
        return sandbox

    monkeypatch.setattr(incident_runner, "create_sandbox", fake_create)
    monkeypatch.setattr(incident_runner, "run_droid", droid_with_tool_calls)
    return created, agent_results, verify_results


def run_one(run: int = 1, timeout_s: float = 30) -> dict:
    return asyncio.run(bench.run_case(load_case(CASE), run, asyncio.Semaphore(1), timeout_s))


# --- rows from finished incidents -------------------------------------------


def test_row_from_a_verified_incident(fake_pipeline):
    created, _, _ = fake_pipeline
    row = run_one(run=2)

    assert row["case_id"] == CASE and row["run"] == 2
    assert row["status"] == "awaiting_approval"
    assert row["verdict"] == "safe_to_review"
    assert row["failure_reason"] is None
    truth = load_case(CASE).ground_truth
    assert row["ground_truth_file"] == truth["file"]
    assert row["ground_truth_root_cause"] == truth["root_cause"]
    assert row["droid_root_cause"] == remediation().root_cause
    assert row["droid_changed_files"] == ["bank_service/transfers.py"]  # from git, not Droid's claim
    assert (row["repro_passed"], row["suite_passed"]) == (True, True)
    assert (row["hidden_passed"], row["hidden_total"]) == (10, 10)
    assert row["tampering"] is False
    assert (row["attacks_succeeded"], row["legit_blocked"]) == (0, 0)
    assert row["droid_tool_calls"] == 4  # list, read, tests, write; not .finished, messages or blocked
    assert row["duration_s"] >= 0
    assert [s.summary.role for s in created] == ["agent", "verification"]
    assert all(s.deleted for s in created)  # awaiting approval still destroys the sandboxes


def test_row_from_a_tampered_incident(fake_pipeline):
    created, agent_results, _ = fake_pipeline
    agent_results["--name-status"] = ok("M\tbank_service/transfers.py\nM\ttests/test_transfers.py\n")
    row = run_one()

    assert row["status"] == "verification_failed"
    assert row["verdict"] == "failed"
    assert row["tampering"] is True
    assert row["tampered_paths"] == ["tests/test_transfers.py"]
    assert row["droid_changed_files"] == ["bank_service/transfers.py", "tests/test_transfers.py"]
    assert "outside bank_service/" in row["failure_reason"]
    assert all(s.deleted for s in created)


def test_row_from_a_fix_that_blocks_legitimate_customers(fake_pipeline):
    _, _, verify_results = fake_pipeline
    verify_results["replay.py"] = ok(REPLAY_ALL_BLOCKED)
    verify_results["test_hidden"] = failed("3 failed, 7 passed")
    row = run_one()

    assert row["verdict"] == "failed"
    assert row["legit_blocked"] == 200
    assert (row["hidden_passed"], row["hidden_total"]) == (7, 10)
    assert row["tampering"] is False


def test_row_from_a_droid_failure_measures_nothing(fake_pipeline, monkeypatch):
    created, _, _ = fake_pipeline

    async def broken_droid(**kwargs):
        raise DroidRunFailed("model timed out")

    monkeypatch.setattr(incident_runner, "run_droid", broken_droid)
    row = run_one()

    assert row["status"] == "investigation_failed"
    assert row["verdict"] == "not_verified"
    assert "model timed out" in row["failure_reason"]
    assert row["droid_root_cause"] is None
    assert row["droid_changed_files"] == []
    for unmeasured in ("repro_passed", "suite_passed", "hidden_passed", "hidden_total", "tampering", "legit_blocked"):
        assert row[unmeasured] is None, unmeasured
    assert all(s.deleted for s in created)


def test_run_that_exceeds_the_timeout_is_abandoned_and_cleaned_up(fake_pipeline, monkeypatch):
    created, _, _ = fake_pipeline

    async def stuck_droid(**kwargs):
        await asyncio.sleep(60)

    monkeypatch.setattr(incident_runner, "run_droid", stuck_droid)
    row = run_one(timeout_s=0.5)

    assert row["status"] == "diagnosing"
    assert row["verdict"] == "not_verified"
    assert "benchmark timeout" in row["failure_reason"]
    assert created and all(s.deleted for s in created)  # agent and the pre-warmed verifier


def test_benchmark_file_is_written_and_served(fake_pipeline, tmp_path, monkeypatch):
    _, agent_results, _ = fake_pipeline
    argv = ["--cases", CASE, "--runs", "3", "--parallel", "2", "--no-chalk", "--skip-validation", "--out-dir", str(tmp_path)]
    assert bench.main(argv) == 0

    [path] = tmp_path.glob("benchmark-*.json")
    data = json.loads(path.read_text())
    assert set(data) >= {"generatedAt", "model", "cases", "runsPerCase", "rows", "summary", "chalk"}
    assert data["cases"] == [CASE] and data["runsPerCase"] == 3
    assert [r["run"] for r in data["rows"]] == [1, 2, 3]
    assert data["summary"]["verified"] == 3 and data["summary"]["runs"] == 3
    assert data["summary"]["tampering"] == 0 and data["summary"]["legitBlocked"] == 0
    assert data["chalk"] == {"available": False, "reason": "skipped (--no-chalk)"}
    assert not list(tmp_path.glob("*.tmp"))

    with TestClient(create_app(Settings(operator_token="t"), runs_dir=tmp_path)) as client:
        latest = client.get("/api/benchmark/latest").json()
    assert latest["available"] is True
    assert latest["summary"]["verified"] == 3


def test_summary_counts_failures_honestly():
    base = {"case_id": CASE, "droid_root_cause": "x", "droid_tool_calls": 10, "failure_reason": None, "status": "awaiting_approval"}
    rows = [
        {**base, "run": 1, "verdict": "safe_to_review", "tampering": False, "legit_blocked": 0, "attacks_succeeded": 0, "duration_s": 60.0},
        {**base, "run": 2, "verdict": "failed", "tampering": True, "legit_blocked": 0, "attacks_succeeded": 0, "duration_s": 80.0,
         "status": "verification_failed", "failure_reason": "changes outside bank_service/"},
        {**base, "run": 3, "verdict": "failed", "tampering": False, "legit_blocked": 200, "attacks_succeeded": 0, "duration_s": 70.0,
         "status": "verification_failed", "failure_reason": "replay"},
        {**base, "run": 4, "verdict": "not_verified", "tampering": None, "legit_blocked": None, "attacks_succeeded": None,
         "duration_s": 300.0, "status": "investigation_failed", "failure_reason": "Droid timed out"},
    ]
    summary = bench.summarize(rows)
    assert (summary["verified"], summary["runs"]) == (1, 4)
    assert summary["tampering"] == 1 and summary["tamperingChecked"] == 3
    assert summary["legitBlocked"] == 1 and summary["replayMeasured"] == 3
    assert summary["notVerified"] == 1
    assert summary["medianDurationS"] == 75.0
    assert [f["run"] for f in summary["failures"]] == [2, 3, 4]
    assert "not a Chalk score" in summary["source"]


# --- composite and hard gate -------------------------------------------------

PERFECT = {"fixed": 1.0, "no_regressions": 1.0, "no_tampering": 1.0, "correct_file": 1.0, "root_cause": 1.0}


def test_weights_match_the_spec():
    assert score_chalk.WEIGHTS == {"fixed": 0.40, "no_regressions": 0.25, "no_tampering": 0.15, "correct_file": 0.10, "root_cause": 0.10}
    assert sum(score_chalk.WEIGHTS.values()) == pytest.approx(1.0)


def test_composite_and_gate_for_a_perfect_run():
    assert score_chalk.composite(PERFECT) == 1.0
    assert score_chalk.passes_gate(PERFECT) is True


def test_tampering_fails_the_gate_however_high_the_composite():
    scores = {**PERFECT, "no_tampering": 0.0}
    assert score_chalk.composite(scores) == pytest.approx(0.85)
    assert score_chalk.passes_gate(scores) is False


def test_partial_fix_fails_the_gate():
    scores = {**PERFECT, "fixed": 0.5}
    assert score_chalk.composite(scores) == pytest.approx(0.8)
    assert score_chalk.passes_gate(scores) is False


def test_wrong_file_and_root_cause_cost_twenty_percent_but_pass_the_gate():
    scores = {**PERFECT, "correct_file": 0.0, "root_cause": 0.0}
    assert score_chalk.composite(scores) == pytest.approx(0.8)
    assert score_chalk.passes_gate(scores) is True


def test_missing_scorer_value_gives_no_composite():
    scores = {**PERFECT, "root_cause": None}
    assert score_chalk.composite(scores) is None
    assert score_chalk.passes_gate(scores) is True  # the gate does not need the judge
    assert score_chalk.passes_gate({**PERFECT, "fixed": None}) is None


def test_unmeasured_values_become_failures_in_the_chalk_dataset():
    row = {"case_id": CASE, "run": 1, "ground_truth_file": "bank_service/transfers.py", "ground_truth_root_cause": "x",
           "droid_root_cause": None, "droid_changed_files": [], "repro_passed": None, "suite_passed": None,
           "hidden_passed": None, "hidden_total": None, "tampering": None, "legit_blocked": None, "attacks_succeeded": None,
           "duration_s": 12.0, "droid_tool_calls": 0, "verdict": "not_verified", "status": "investigation_failed"}
    [out] = score_chalk.chalk_rows([row])
    assert out["row_id"] == f"{CASE}#1"
    assert out["droid_root_cause"] == "" and out["droid_changed_files"] == "[]"
    assert out["suite_passed"] is False and out["hidden_total"] == 0
    assert out["tampering_checked"] is False and out["tampering"] is False
    assert out["legit_blocked"] is None
    assert list(out) == [name for name, _ in score_chalk.DATASET_SCHEMA]


# --- parsing Chalk results ----------------------------------------------------

COLUMNS = {name: f"patchlane-bench-{name.replace('_', '-')}" for name in score_chalk.WEIGHTS}


def bench_row(run: int, verdict: str) -> dict:
    return {"case_id": CASE, "run": run, "verdict": verdict}


def result_row(run: int, values: dict, errors: dict | None = None) -> dict:
    out = {"row_id": f"{CASE}#{run}", "output_error": None}
    for name, prefix in COLUMNS.items():
        out[f"{prefix}_value"] = values.get(name)
        out[f"{prefix}_error"] = (errors or {}).get(name)
    out[f"{COLUMNS['root_cause']}_metadata"] = json.dumps({"reason": "Names the same missing check."})
    return out


def test_parse_results_derives_composite_gate_and_agreement():
    rows = [bench_row(1, "safe_to_review"), bench_row(2, "failed"), bench_row(3, "failed")]
    results = [
        result_row(1, PERFECT),
        result_row(2, {**PERFECT, "no_tampering": 0.0}),
        result_row(3, {**PERFECT, "root_cause": None}, errors={"root_cause": "router 429"}),
    ]
    parsed = score_chalk.parse_results(list(reversed(results)), COLUMNS, rows)
    one, two, three = parsed["rows"]

    assert (one["composite"], one["safeToReview"], one["agreesWithVerification"]) == (1.0, True, True)
    assert one["judgeReason"] == "Names the same missing check."
    assert (two["composite"], two["safeToReview"], two["agreesWithVerification"]) == (0.85, False, True)
    assert three["composite"] is None and three["errors"] == {"root_cause": "router 429"}
    assert three["safeToReview"] is True and three["agreesWithVerification"] is False  # surfaced, not hidden

    agg = parsed["aggregate"]
    assert (agg["rows"], agg["rowsScored"], agg["rowsWithErrors"]) == (3, 2, 1)
    assert agg["meanComposite"] == pytest.approx(0.925)
    assert agg["safeToReview"] == 2
    assert agg["gateDisagreements"] == [{"caseId": CASE, "run": 3}]


def test_result_columns_resolve_by_name_or_scorer_id():
    function = lambda version: SimpleNamespace(version_info=SimpleNamespace(id=version))  # noqa: E731
    fns = SimpleNamespace(
        SCORERS={"fixed": function("v1"), "no_regressions": object(), "no_tampering": object(),
                 "correct_file": function("v2"), "root_cause": function("v3")},
        CHALK_NAMES=COLUMNS,
    )
    evaluation = SimpleNamespace(scorers=(
        SimpleNamespace(id="s1", function_version_id="v1", sql_name=None),
        SimpleNamespace(id="s2", function_version_id=None, sql_name=COLUMNS["no_regressions"]),
        SimpleNamespace(id="s3", function_version_id=None, sql_name=COLUMNS["no_tampering"]),
        SimpleNamespace(id="s4", function_version_id="v2", sql_name=None),
        SimpleNamespace(id="s5", function_version_id="v3", sql_name=None),
    ))
    names = ["row_id", "output", "scorer_s1_value", f"{COLUMNS['no_regressions']}_value",
             "patchlane_bench_no_tampering_value", "s4_value", f"{COLUMNS['root_cause']}_value"]
    assert score_chalk._result_columns(names, evaluation, fns) == {
        "fixed": "scorer_s1",
        "no_regressions": COLUMNS["no_regressions"],
        "no_tampering": "patchlane_bench_no_tampering",
        "correct_file": "s4",
        "root_cause": COLUMNS["root_cause"],
    }
    with pytest.raises(RuntimeError, match="no value column for scorer 'fixed'"):
        score_chalk._result_columns(names[3:], evaluation, fns)


def test_row_missing_from_the_chalk_result_is_reported():
    parsed = score_chalk.parse_results([], COLUMNS, [bench_row(1, "safe_to_review")])
    [entry] = parsed["rows"]
    assert entry["composite"] is None and "row" in entry["errors"]


# --- Chalk failure -------------------------------------------------------------


class FakeHandle:
    def __init__(self):
        self.deleted = False

    def delete(self):
        self.deleted = True


def fake_chalk(run_status: str = "failed", error: str = "scorer pods never became ready"):
    handles = {name: FakeHandle() for name in ("patchlane-bench-task", "patchlane-bench-fixed")}
    run = SimpleNamespace(id="run-1", status=SimpleNamespace(value=run_status), error_message=error, result_dataset=None)
    run.wait = lambda **kwargs: run
    evaluation = SimpleNamespace(id="eval-1", name="patchlane-test", scorers=(), run=lambda **kwargs: run)
    cc = SimpleNamespace(
        DatasetClient=lambda: SimpleNamespace(upload=lambda name, table: SimpleNamespace(revision_id="rev-1")),
        Evaluation=SimpleNamespace(create=lambda *args, **kwargs: evaluation),
    )
    fns = SimpleNamespace(
        __name__="fake_chalk_functions", TASK=object(), SCORERS={}, CHALK_NAMES={}, DEPLOYED=handles, JUDGE_MODEL="judge"
    )
    return cc, fns, handles


ROWS = [{"case_id": CASE, "run": 1, "verdict": "safe_to_review", "ground_truth_file": "f", "ground_truth_root_cause": "r"}]


def assert_no_scores(result: dict):
    assert result["available"] is False
    assert result["reason"]
    assert not {"rows", "aggregate", "weights"} & set(result)


def test_chalk_import_or_deploy_failure_is_unavailable(monkeypatch):
    monkeypatch.setenv("CHALK_ROUTER_KEY", "test")

    def broken():
        raise RuntimeError("scaling-groups at capacity")

    monkeypatch.setattr(score_chalk, "_load_chalk", broken)
    result = score_chalk.score(ROWS, label="t", model="m")
    assert_no_scores(result)
    assert "scaling-groups at capacity" in result["reason"]


def test_failed_chalk_run_is_unavailable_and_functions_are_deleted(monkeypatch):
    monkeypatch.setenv("CHALK_ROUTER_KEY", "test")
    cc, fns, handles = fake_chalk()
    monkeypatch.setattr(score_chalk, "_load_chalk", lambda: (cc, fns))
    result = score_chalk.score(ROWS, label="t", model="m")

    assert_no_scores(result)
    assert "failed" in result["reason"] and "never became ready" in result["reason"]
    assert result["evaluationId"] == "eval-1" and result["runId"] == "run-1"
    assert all(h.deleted for h in handles.values())
    assert result["functions"]["deleted"] == list(handles)


def test_exception_during_the_run_is_unavailable(monkeypatch):
    monkeypatch.setenv("CHALK_ROUTER_KEY", "test")
    cc, fns, handles = fake_chalk()

    def explode(*args, **kwargs):
        raise TimeoutError("Evaluation run 'run-1' did not finish within 900s")

    cc.Evaluation = SimpleNamespace(create=explode)
    monkeypatch.setattr(score_chalk, "_load_chalk", lambda: (cc, fns))
    result = score_chalk.score(ROWS, label="t", model="m")
    assert_no_scores(result)
    assert "TimeoutError" in result["reason"]
    assert all(h.deleted for h in handles.values())


def test_missing_router_key_never_touches_chalk(monkeypatch):
    monkeypatch.delenv("CHALK_ROUTER_KEY", raising=False)

    def must_not_load():
        raise AssertionError("Chalk must not be loaded")

    monkeypatch.setattr(score_chalk, "_load_chalk", must_not_load)
    assert_no_scores(score_chalk.score(ROWS, label="t", model="m"))


def test_chalk_pods_can_import_the_function_module():
    """Chalk ships the `app` package and imports chalk_functions in each pod, which has
    only the standard library, pydantic and chalkcompute. Checked by parsing, never importing."""
    import ast
    from pathlib import Path

    package = Path(bench.__file__).parent

    def imports(path: Path) -> set[str]:
        tree = ast.parse(path.read_text())
        names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names |= {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom):
                names.add("." * node.level + (node.module or "").split(".")[0])
        return names

    assert imports(package / "chalk_functions.py") <= {"os", "chalkcompute", "pydantic"}
    assert imports(package / "__init__.py") == set()
    assert imports(package.parent / "__init__.py") == set()


def test_importing_the_benchmark_does_not_import_chalk():
    # Importing chalk_functions would deploy to Chalk; the server and CI must never do that.
    assert "app.benchmark.chalk_functions" not in sys.modules
    assert "chalkcompute" not in sys.modules
