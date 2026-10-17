from ..models.incident import Incident, IncidentStatus as S

ALLOWED: dict[S, set[S]] = {
    S.DETECTED: {S.SANDBOX_CREATING},
    S.SANDBOX_CREATING: {S.REPRODUCING, S.INVESTIGATION_FAILED},
    S.REPRODUCING: {S.DIAGNOSING, S.INVESTIGATION_FAILED},
    S.DIAGNOSING: {S.PATCHING, S.VERIFYING, S.INVESTIGATION_FAILED},
    S.PATCHING: {S.VERIFYING, S.INVESTIGATION_FAILED},
    S.VERIFYING: {S.AWAITING_APPROVAL, S.VERIFICATION_FAILED, S.INVESTIGATION_FAILED},
    S.AWAITING_APPROVAL: {S.RESOLVED, S.REJECTED},
}

TERMINAL = {S.RESOLVED, S.REJECTED, S.INVESTIGATION_FAILED, S.VERIFICATION_FAILED}
RUNNING = {S.SANDBOX_CREATING, S.REPRODUCING, S.DIAGNOSING, S.PATCHING, S.VERIFYING}


class InvalidTransition(RuntimeError):
    pass


def transition(incident: Incident, new: S) -> None:
    if new not in ALLOWED.get(incident.status, set()):
        raise InvalidTransition(f"{incident.id}: {incident.status} -> {new} is not allowed")
    incident.status = new
