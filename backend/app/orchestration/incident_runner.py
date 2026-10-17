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
from ..models.incident import ApprovalRecord, BugChoice, Incident, IncidentStatus as S
from ..monitoring.detector import detect, dollars
from ..services.demo_state import DemoState
from .measurements import measure
from .state_machine import TERMINAL, transition
from .verification import AgentChanges, extract_changes, verify

from casekit import (  # noqa: E402  (demo/ is on sys.path via config)
    REPRO_NAMES,
    agent_tree,
    allowed_pairs,
    load_case,
    merged_meta,
    pair_key,
    verification_tree,
)

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


class PairNotAllowed(ValueError):
    """The two chosen bugs are not on the validated list of pairs."""


async def trigger(
    state: DemoState,
    case_id: str | None = None,
    variant_id: str | None = None,
    second_case_id: str | None = None,
    second_variant_id: str | None = None,
) -> Incident:
    # Every check happens before anything changes, so a bad request leaves the current incident alone.
    case = load_case(case_id or settings.default_case)  # FileNotFoundError for an unknown case
    variant = case.variant(variant_id)  # KeyError for an unknown variant
    second = None
    if second_case_id is not None or second_variant_id is not None:
        if second_case_id is None:
            raise PairNotAllowed("a second variant needs a second case")
        second = load_case(second_case_id)
        second_variant = second.variant(second_variant_id)
        if second.id == case.id:
            raise PairNotAllowed("the two bugs must break different safeguards")
        key = pair_key((case, variant_id), (second, second_variant_id))
        if key not in allowed_pairs():
            raise PairNotAllowed("these two bugs can't be combined")
    await destroy_sandboxes(state)
    state.sandboxes = []
    # The transfer replay, when either case has one, sets the impact numbers.
    detected = [detect(c) for c in (case, second) if c is not None]
    detection = next((d for d, c in zip(detected, (case, second)) if c is not None and c.meta.get("replay")), detected[0])
    alert = " ".join(d.alert for d in detected)
    meta = merged_meta(case, second) if second else case.meta
    incident = Incident(
        id=state.next_incident_id(),
        case_id=case.id,
        variant_id=variant.id if variant else "default",
        variant_label=case.label(variant_id),
        safeguard=case.safeguard,
        second_bug=BugChoice(
            case_id=second.id,
            variant_id=second_variant.id if second_variant else "default",
            variant_label=second.label(second_variant_id),
            safeguard=second.safeguard,
            title=second.meta["title"],
            severity=second.meta["severity"],
            endpoint=second.meta["endpoint"],
        )
        if second
        else None,
        title=case.meta["title"],
        status=S.DETECTED,
        severity=meta["severity"],
        service=case.meta["service"],
        endpoint=case.meta["endpoint"],
        symptom=meta["symptom"],
        alert=alert,
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
    state.emit(
        "incident.detected",
        title,
        detection.alert,
        {"severity": incident.severity, "caseId": case.id, "variantId": incident.variant_id},
    )
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
    second = None
    if incident.second_bug is not None:
        second_case = load_case(incident.second_bug.case_id)
        second = (second_case, incident.second_bug.variant_id)
    cases = [case] + ([second[0]] if second else [])
    meta = merged_meta(case, second[0]) if second else case.meta
    replay = any(bool(c.meta.get("replay")) for c in cases)
    hidden_tests = [f"tests/{t.name}" for c in cases for t in c.hidden_tests]
    repro_files = [f"tests/{name}" for name in REPRO_NAMES] if second else None
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
            count = await agent.upload_tree(agent_tree(case, Path(tmp) / "agent", incident.variant_id, second))
            await agent.git_baseline()
            state.emit("repository.uploaded", f"Loaded {incident.service} into the sandbox ({count} files)", metadata={"sandboxId": agent.id})

            _set(state, S.REPRODUCING)
            before, repro_output = await measure(agent, replay, repro_files)
            incident.before = before
            state.publish()
            if before.repro_passed:
                _fail(state, S.INVESTIGATION_FAILED, "The incident did not reproduce in the sandbox")
                return
            title = (
                f"Exploit reproduced: {before.replay.attacks_succeeded}/{before.replay.attacks_total} unauthorized transfers succeed"
                if before.replay
                else ("Incidents reproduced: both incident tests fail" if second else "Incident reproduced: the incident test fails")
            )
            state.emit("incident.reproduced", title, repro_output[-2_000:], before.model_dump(by_alias=True))

            # Warm the clean sandbox while Droid works, and show it as soon as it exists.
            verifier_task = asyncio.create_task(create_sandbox("verification", on_change=state.publish))

            def show_verifier(task: asyncio.Task) -> None:
                if not task.cancelled() and task.exception() is None and incident.status not in TERMINAL:
                    incident.verification_sandbox = task.result().summary
                    state.publish()

            verifier_task.add_done_callback(show_verifier)

            _set(state, S.DIAGNOSING)
            incident.remediation = await run_droid(
                sandbox=agent,
                case_meta=meta,
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
            result = await verify(
                verifier,
                verification_tree(case, Path(tmp) / "verify", incident.variant_id, second),
                changes,
                hidden_tests,
                replay,
                repro_files,
            )
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
