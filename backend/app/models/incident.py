from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field

from .base import CamelModel
from .remediation import RemediationResult


class IncidentStatus(StrEnum):
    DETECTED = "detected"
    SANDBOX_CREATING = "sandbox_creating"
    REPRODUCING = "reproducing"
    DIAGNOSING = "diagnosing"
    PATCHING = "patching"
    VERIFYING = "verifying"
    AWAITING_APPROVAL = "awaiting_approval"
    RESOLVED = "resolved"
    INVESTIGATION_FAILED = "investigation_failed"
    VERIFICATION_FAILED = "verification_failed"
    REJECTED = "rejected"


class AffectedCustomer(CamelModel):
    customer_id: str
    display_name: str
    masked_account: str
    amount_moved_cents: int


class IncidentImpact(CamelModel):
    unauthorized_transfers: int = 0
    amount_moved_cents: int = 0
    affected_customers: list[AffectedCustomer] = Field(default_factory=list)
    legit_transfers_in_window: int = 0
    first_seen: str | None = None


class ReplayResult(CamelModel):
    attacks_total: int
    attacks_succeeded: int
    legit_total: int
    legit_blocked: int


class Measurements(CamelModel):
    """One pass of repro test, regression suite and replay in a sandbox."""

    repro_passed: bool
    suite_passed: int
    suite_total: int
    replay: ReplayResult | None = None


class SandboxSummary(CamelModel):
    id: str
    role: Literal["agent", "verification"]
    provider: Literal["daytona"] = "daytona"
    state: str
    created_at: datetime
    commands_executed: int = 0
    network_policy: Literal["none", "restricted"]
    host_tools_blocked: int = 0
    destroyed_at: datetime | None = None


class VerificationResult(CamelModel):
    after: Measurements | None = None
    hidden_passed: int = 0
    hidden_total: int = 0
    tampering: bool = False
    rejected_paths: list[str] = Field(default_factory=list)
    dropped_agent_tests: list[str] = Field(default_factory=list)
    verdict: Literal["safe_to_review", "failed"]
    reasons: list[str] = Field(default_factory=list)


class ApprovalRecord(CamelModel):
    status: Literal["pending", "approved", "rejected"]
    channel: Literal["dashboard"] = "dashboard"
    received_at: datetime | None = None


class BugChoice(CamelModel):
    """The second bug of a two-bug incident, as the operator chose it."""

    case_id: str
    variant_id: str
    variant_label: str
    safeguard: str
    title: str
    severity: Literal["SEV-1", "SEV-2"]
    endpoint: str


class Incident(CamelModel):
    id: str
    case_id: str
    variant_id: str = "default"
    variant_label: str = ""
    safeguard: str = ""
    second_bug: BugChoice | None = None  # the first of extra_bugs, kept for older clients
    extra_bugs: list[BugChoice] = Field(default_factory=list)
    title: str = ""
    status: IncidentStatus
    severity: Literal["SEV-1", "SEV-2"]
    service: str
    endpoint: str
    symptom: str
    alert: str
    created_at: datetime
    resolved_at: datetime | None = None
    failure_reason: str | None = None
    impact: IncidentImpact
    before: Measurements | None = None
    agent_sandbox: SandboxSummary | None = None
    verification_sandbox: SandboxSummary | None = None
    remediation: RemediationResult | None = None
    diff: str | None = None
    verification: VerificationResult | None = None
    approval: ApprovalRecord | None = None
