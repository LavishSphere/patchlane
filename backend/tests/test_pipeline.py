"""The incident pipeline and verification verdicts, with fake sandboxes and a fake Droid."""

import asyncio
import json

import pytest

from app.integrations.factory import DroidRunFailed
from app.models.incident import IncidentStatus as S
from app.models.remediation import RemediationResult, TestRun
from app.orchestration import incident_runner
from app.orchestration.verification import AGENT_PATCH, FULL_DIFF, AgentChanges, verify
from app.services.demo_state import DemoState

from fakes import (
    BUGGY,
    FIXED,
    REPLAY_ALL_BLOCKED,
    SOURCE_PATCH,
    FakeSandbox,
    failed,
    ok,
)

HIDDEN = ["tests/test_hidden_ownership.py"]


def run(coro):
    return asyncio.run(coro)


def changes(**overrides) -> AgentChanges:
    values = dict(full_diff="diff", source_patch=SOURCE_PATCH, source_files=["bank_service/transfers.py"])
    values.update(overrides)
    return AgentChanges(**values)


# --- verification verdicts -------------------------------------------------


def test_correct_fix_is_safe_to_review(tmp_path):
    result = run(verify(FakeSandbox("verification", FIXED), tmp_path, changes(), HIDDEN, replay=True))
    assert result.verdict == "safe_to_review"
    assert result.reasons == []
    assert (result.hidden_passed, result.hidden_total) == (10, 10)
    assert result.after.replay.attacks_succeeded == 0


def test_tampering_fails_even_when_every_test_passes(tmp_path):
    result = run(verify(FakeSandbox("verification", FIXED), tmp_path, changes(tampered=["tests/test_transfers.py"]), HIDDEN, replay=True))
    assert result.verdict == "failed"
    assert result.tampering is True
    assert any("outside bank_service/" in r for r in result.reasons)


def test_blocking_legitimate_customers_fails(tmp_path):
    sandbox = FakeSandbox("verification", {**FIXED, "replay.py": ok(REPLAY_ALL_BLOCKED), "test_hidden": failed("3 failed, 7 passed")})
    result = run(verify(sandbox, tmp_path, changes(), HIDDEN, replay=True))
    assert result.verdict == "failed"
    assert any("legitimate transfers blocked" in r for r in result.reasons)
    assert any("held-out tests: 7/10" in r for r in result.reasons)


def test_patch_that_does_not_apply_fails_before_running_tests(tmp_path):
    sandbox = FakeSandbox("verification", {**FIXED, "git apply": failed("error: patch failed")})
    result = run(verify(sandbox, tmp_path, changes(), HIDDEN, replay=True))
    assert result.verdict == "failed"
    assert result.after is None
    assert not any("pytest" in c for c in sandbox.commands)


def test_no_source_change_fails(tmp_path):
    sandbox = FakeSandbox("verification", {**FIXED, "tests/test_incident.py": failed("1 failed")})
    result = run(verify(sandbox, tmp_path, changes(source_patch=b"", source_files=[]), HIDDEN, replay=True))
    assert result.verdict == "failed"
    assert "no application source was changed" in result.reasons
    assert "incident test still fails" in result.reasons


# --- full pipeline -----------------------------------------------------------


def remediation() -> RemediationResult:
    return RemediationResult(
        root_cause="transfer() never checks that the requester owns the source account",
        changed_files=["bank_service/transfers.py"],
        patch_summary="Added the ownership check",
        tests_run=[TestRun(command="pytest", passed=True, summary="21 passed")],
        risk="low",
        confidence=0.95,
        human_summary="Unauthorized debits are now rejected.",
    )


@pytest.fixture
def pipeline(tmp_path, monkeypatch):
    """Patch Daytona and Droid out of the runner; return (state, sandboxes, setter)."""
    sandboxes = {
        "agent": FakeSandbox("agent", BUGGY, files={FULL_DIFF: b"diff --git ...", AGENT_PATCH: SOURCE_PATCH}),
        "verification": FakeSandbox("verification", FIXED),
    }
    created: list[str] = []

    async def fake_create(role, on_change=lambda: None):
        created.append(role)
        return sandboxes[role]

    async def fake_droid(*, on_first_write, **kwargs):
        on_first_write()
        return remediation()

    monkeypatch.setattr(incident_runner, "create_sandbox", fake_create)
    monkeypatch.setattr(incident_runner, "run_droid", fake_droid)
    state = DemoState(tmp_path)

    def set_droid(fn):
        monkeypatch.setattr(incident_runner, "run_droid", fn)

    return state, sandboxes, created, set_droid


def investigate(state):
    async def scenario():
        await incident_runner.trigger(state, "ownership-check")
        await incident_runner.investigate(state)

    run(scenario())
    return state.incident


def event_types(state):
    return [e.type for e in state.bus.history()]


def test_happy_path_reaches_approval_then_resolves(pipeline, tmp_path):
    state, sandboxes, _, _ = pipeline
    incident = investigate(state)

    assert incident.status == S.AWAITING_APPROVAL
    assert incident.before.replay.attacks_succeeded == 14
    assert incident.verification.verdict == "safe_to_review"
    assert incident.remediation.changed_files == ["bank_service/transfers.py"]
    for expected in ("sandbox.ready", "incident.reproduced", "verification.guard", "verification.passed", "approval.requested"):
        assert expected in event_types(state)
    assert not any(s.deleted for s in sandboxes.values())

    run(incident_runner.approve(state))
    assert incident.status == S.RESOLVED
    assert all(s.deleted for s in sandboxes.values())
    package = json.loads((tmp_path / "packages" / f"{incident.id}.json").read_text())
    assert len(package["reversalCandidates"]) == 14


def test_incident_that_does_not_reproduce_stops_before_droid(pipeline):
    state, sandboxes, created, set_droid = pipeline
    sandboxes["agent"].results["tests/test_incident.py"] = ok("1 passed")
    called = []

    async def droid_must_not_run(**kwargs):
        called.append(True)

    set_droid(droid_must_not_run)
    incident = investigate(state)

    assert incident.status == S.INVESTIGATION_FAILED
    assert "did not reproduce" in incident.failure_reason
    assert called == [] and created == ["agent"]
    assert sandboxes["agent"].deleted


def test_droid_failure_cleans_up_both_sandboxes(pipeline):
    state, sandboxes, _, set_droid = pipeline

    async def broken_droid(**kwargs):
        raise DroidRunFailed("model timed out")

    set_droid(broken_droid)
    incident = investigate(state)

    assert incident.status == S.INVESTIGATION_FAILED
    assert "model timed out" in incident.failure_reason
    assert all(s.deleted for s in sandboxes.values())  # the pre-warmed verifier too
    assert "integration.error" in event_types(state)


def test_failed_verification_is_reported_and_cleaned_up(pipeline):
    state, sandboxes, _, _ = pipeline
    sandboxes["verification"].results["replay.py"] = ok(REPLAY_ALL_BLOCKED)
    incident = investigate(state)

    assert incident.status == S.VERIFICATION_FAILED
    assert "legitimate transfers blocked" in incident.failure_reason
    assert all(s.deleted for s in sandboxes.values())


def test_reject_destroys_sandboxes(pipeline):
    state, sandboxes, _, _ = pipeline
    investigate(state)
    run(incident_runner.reject(state))
    assert state.incident.status == S.REJECTED
    assert all(s.deleted for s in sandboxes.values())
