"""The incident lifecycle: trigger, investigate, verify, approve, reject, reset."""

import asyncio
import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from ..config import settings
from ..integrations.daytona import SandboxHandle, create_sandbox
from ..integrations.factory import DroidRunFailed, DroidUnavailable, run_droid
from ..models.incident import ApprovalRecord, Incident, IncidentStatus as S
from ..monitoring.detector import detect, dollars
from ..services.demo_state import DemoState
from .measurements import measure
from .state_machine import TERMINAL, transition
from .verification import AgentChanges, extract_changes, verify

from casekit import agent_tree, load_case, verification_tree  # noqa: E402  (demo/ is on sys.path via config)

log = logging.getLogger("patchlane")


def now() -> datetime:
    return datetime.now(timezone.utc)


def _set(state: DemoState, status: S) -> None:
    transition(state.incident, status)
    state.publish()


def _fail(state: DemoState, status: S, reason: str) -> None:
    state.incident.failure_reason = reason
    _set(state, status)
    state.emit("incident.failed", reason)


async def destroy_sandboxes(state: DemoState) -> None:
    for sandbox in state.sandboxes:
        if sandbox.summary.destroyed_at is not None:
            continue
        try:
            await sandbox.delete()
            state.emit(
                "sandbox.destroyed",
                f"Sandbox destroyed ({sandbox.summary.role})",
                metadata={"sandboxId": sandbox.id, "role": sandbox.summary.role},
            )
        except Exception as exc:  # cleanup must never take the dashboard down
            state.emit("integration.error", f"Could not delete sandbox {sandbox.id}", str(exc), {"provider": "daytona"})
    state.publish()


async def trigger(state: DemoState, case_id: str | None = None) -> Incident:
    await destroy_sandboxes(state)
    state.sandboxes = []
    case = load_case(case_id or settings.default_case)
    detection = detect(case)
    incident = Incident(
        id=state.next_incident_id(),
        case_id=case.id,
        status=S.DETECTED,
        severity=case.meta["severity"],
        service=case.meta["service"],
        endpoint=case.meta["endpoint"],
        symptom=case.meta["symptom"],
        alert=detection.alert,
        created_at=now(),
        impact=detection.impact,
    )
    state.incident = incident
    state.bus.start(incident.id)
    state.publish()
    impact = detection.impact
    title = (
        f"{impact.unauthorized_transfers} unauthorized transfers, {dollars(impact.amount_moved_cents)} moved"
        if impact.unauthorized_transfers
        else case.meta["title"]
    )
    state.emit("incident.detected", title, detection.alert, {"severity": incident.severity, "caseId": case.id})
    return incident


def _guard_title(changes: AgentChanges) -> str:
    if changes.tampered:
        return f"Rejected changes outside bank_service/: {', '.join(changes.tampered)}"
    files = ", ".join(changes.source_files) or "none"
    return f"Source-only patch extracted: {files}"


async def _settle(task: asyncio.Task) -> SandboxHandle | None:
    try:
        return await task
    except Exception:
        return None


async def investigate(state: DemoState) -> None:
    incident = state.incident
    case = load_case(incident.case_id)
    replay = bool(case.meta.get("replay"))
    hidden_tests = [f"tests/{t.name}" for t in case.hidden_tests]
    verifier_task: asyncio.Task | None = None

    with tempfile.TemporaryDirectory(prefix="patchlane-") as tmp:
        try:
            _set(state, S.SANDBOX_CREATING)
            state.emit("sandbox.creating", "Creating isolated Daytona sandbox")
            agent = await create_sandbox("agent", on_change=state.publish)
            state.sandboxes.append(agent)
            incident.agent_sandbox = agent.summary
            state.emit(
                "sandbox.ready",
                "Daytona sandbox ready",
                metadata={"sandboxId": agent.id, "role": "agent", "network": agent.summary.network_policy},
            )
            count = await agent.upload_tree(agent_tree(case, Path(tmp) / "agent"))
            await agent.git_baseline()
            state.emit("repository.uploaded", f"Loaded {incident.service} into the sandbox ({count} files)", metadata={"sandboxId": agent.id})

            _set(state, S.REPRODUCING)
            before, repro_output = await measure(agent, replay)
            incident.before = before
            state.publish()
            if before.repro_passed:
                _fail(state, S.INVESTIGATION_FAILED, "The incident did not reproduce in the sandbox")
                return
            title = (
                f"Exploit reproduced: {before.replay.attacks_succeeded}/{before.replay.attacks_total} unauthorized transfers succeed"
                if before.replay
                else "Incident reproduced: the incident test fails"
            )
            state.emit("incident.reproduced", title, repro_output[-2_000:], before.model_dump(by_alias=True))

            # Warm the clean sandbox while Droid works.
            verifier_task = asyncio.create_task(create_sandbox("verification", on_change=state.publish))

            _set(state, S.DIAGNOSING)
            incident.remediation = await run_droid(
                sandbox=agent,
                case_meta=case.meta,
                alert=incident.alert,
                repro_output=repro_output,
                emit=state.emit,
                on_first_write=lambda: _set(state, S.PATCHING),
            )
            state.publish()

            _set(state, S.VERIFYING)
            changes = await extract_changes(agent)
            incident.diff = changes.full_diff
            verifier = await verifier_task
            verifier_task = None
            state.sandboxes.append(verifier)
            incident.verification_sandbox = verifier.summary
            state.emit(
                "verification.started",
                "Verifying in a clean Daytona sandbox with held-out tests",
                metadata={"sandboxId": verifier.id, "role": "verification"},
            )
            state.emit(
                "verification.guard",
                _guard_title(changes),
                metadata={"sourceFiles": changes.source_files, "tampered": changes.tampered, "droppedTests": changes.dropped_tests},
            )
            result = await verify(verifier, verification_tree(case, Path(tmp) / "verify"), changes, hidden_tests, replay)
            incident.verification = result
            state.publish()
            if result.verdict != "safe_to_review":
                state.emit("verification.failed", "Verification failed", "\n".join(result.reasons))
                _fail(state, S.VERIFICATION_FAILED, "; ".join(result.reasons))
                return
            state.emit("verification.passed", "Remediation verified: safe to review", metadata=result.model_dump(by_alias=True))
            incident.approval = ApprovalRecord(status="pending")
            _set(state, S.AWAITING_APPROVAL)
            state.emit("approval.requested", "Waiting for operator approval")
        except asyncio.CancelledError:
            raise
        except (DroidUnavailable, DroidRunFailed) as exc:
            state.emit("integration.error", f"Factory Droid: {exc}", None, {"provider": "factory"})
            _fail(state, S.INVESTIGATION_FAILED, str(exc))
        except Exception as exc:
            log.exception("investigation failed")
            state.emit("integration.error", f"{type(exc).__name__}: {str(exc)[:200]}", None, {})
            if incident.status not in TERMINAL:
                _fail(state, S.INVESTIGATION_FAILED, f"{type(exc).__name__}: {exc}")
        finally:
            if verifier_task is not None:
                verifier = await _settle(verifier_task)
                if verifier is not None:
                    state.sandboxes.append(verifier)
            if incident.status in TERMINAL:
                await destroy_sandboxes(state)


def _write_package(state: DemoState) -> Path | None:
    if state.runs_dir is None:
        return None
    incident = state.incident
    detection = detect(load_case(incident.case_id))
    package = {
        "incident": json.loads(incident.to_json()),
        "reversalCandidates": detection.unauthorized,
    }
    path = state.runs_dir / "packages" / f"{incident.id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(package, indent=2))
    return path


async def approve(state: DemoState) -> Incident:
    incident = state.incident
    incident.approval = ApprovalRecord(status="approved", received_at=now())
    state.emit("approval.received", "Approved by operator", metadata={"channel": "dashboard"})
    path = _write_package(state)
    reversal = incident.impact.unauthorized_transfers
    state.emit(
        "remediation.packaged",
        "Patch package ready" + (f" with {reversal} transactions flagged for reversal" if reversal else ""),
        metadata={"package": path.name if path else None},
    )
    await destroy_sandboxes(state)
    incident.resolved_at = now()
    _set(state, S.RESOLVED)
    state.emit("incident.resolved", f"{incident.id} resolved")
    return incident


async def reject(state: DemoState) -> Incident:
    incident = state.incident
    incident.approval = ApprovalRecord(status="rejected", received_at=now())
    state.emit("approval.received", "Rejected by operator", metadata={"channel": "dashboard"})
    await destroy_sandboxes(state)
    _set(state, S.REJECTED)
    return incident


async def reset(state: DemoState) -> None:
    if state.task is not None and not state.task.done():
        state.task.cancel()
        try:
            await asyncio.wait_for(state.task, timeout=30)
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            pass
    state.task = None
    await destroy_sandboxes(state)
    state.sandboxes = []
    state.incident = None
    state.bus.clear()
