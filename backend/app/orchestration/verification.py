"""Independent verification: the agent doesn't grade its own homework.

The agent sandbox is untrusted. We take Droid's changes out of it, keep only
application source under bank_service/, and apply them in a fresh sandbox
built from the original tree plus hidden tests Droid never saw.
"""

from dataclasses import dataclass, field
from pathlib import Path

from ..integrations.daytona import SandboxHandle
from ..models.incident import VerificationResult
from .measurements import PYTEST, measure, pytest_counts

SOURCE_DIR = "bank_service/"
AGENT_PATCH = "/tmp/patchlane-source.patch"
FULL_DIFF = "/tmp/patchlane-full.diff"


@dataclass
class AgentChanges:
    full_diff: str
    source_patch: bytes
    source_files: list[str] = field(default_factory=list)
    tampered: list[str] = field(default_factory=list)
    dropped_tests: list[str] = field(default_factory=list)


def classify(name_status: str) -> tuple[list[str], list[str], list[str]]:
    """Split `git diff --name-status` output into (source, tampered, dropped agent tests)."""
    source, tampered, dropped = [], [], []
    for line in name_status.strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status, paths = parts[0], parts[1:]
        if all("__pycache__/" in p or p.endswith(".pyc") for p in paths):
            continue  # bytecode from running tests, not a change
        if all(p.startswith(SOURCE_DIR) for p in paths) and status[0] in "MAR":
            source.append(paths[-1])
        elif status == "A" and paths[0].startswith("tests/"):
            dropped.append(paths[0])
        else:
            tampered.extend(paths)
    return source, tampered, dropped


async def extract_changes(agent: SandboxHandle) -> AgentChanges:
    await agent.exec(
        f"git add -A && git diff --cached baseline > {FULL_DIFF} "
        f"&& git diff --cached --binary baseline -- {SOURCE_DIR} > {AGENT_PATCH}"
    )
    name_status = await agent.exec("git -c core.quotepath=off diff --cached --name-status baseline")
    source, tampered, dropped = classify(name_status.output)
    return AgentChanges(
        full_diff=(await agent.download_raw(FULL_DIFF)).decode("utf-8", errors="replace"),
        source_patch=await agent.download_raw(AGENT_PATCH),
        source_files=source,
        tampered=tampered,
        dropped_tests=dropped,
    )


async def verify(
    verifier: SandboxHandle, verification_tree: Path, changes: AgentChanges, hidden_tests: list[str], replay: bool
) -> VerificationResult:
    reasons: list[str] = []
    result = VerificationResult(
        verdict="failed",
        tampering=bool(changes.tampered),
        rejected_paths=changes.tampered,
        dropped_agent_tests=changes.dropped_tests,
    )
    if changes.tampered:
        reasons.append(f"changes outside {SOURCE_DIR}: {', '.join(changes.tampered)}")
    if not changes.source_files:
        reasons.append("no application source was changed")

    await verifier.upload_tree(verification_tree)
    await verifier.git_baseline()
    if changes.source_patch.strip():
        await verifier.upload_raw(changes.source_patch, AGENT_PATCH)
        applied = await verifier.exec(f"git apply --whitespace=nowarn {AGENT_PATCH}")
        if not applied.ok:
            reasons.append(f"patch did not apply cleanly: {applied.output.strip()[-200:]}")
            result.reasons = reasons
            return result

    after, _ = await measure(verifier, replay)
    result.after = after
    if hidden_tests:
        hidden = await verifier.exec(f"{PYTEST} {' '.join(hidden_tests)}")
        result.hidden_passed, result.hidden_total = pytest_counts(hidden.output)
        if not hidden.ok:
            reasons.append(f"held-out tests: {result.hidden_passed}/{result.hidden_total} passed")

    if not after.repro_passed:
        reasons.append("incident test still fails")
    if after.suite_passed != after.suite_total or after.suite_total == 0:
        reasons.append(f"regression suite: {after.suite_passed}/{after.suite_total} passed")
    if after.replay is not None:
        if after.replay.attacks_succeeded:
            reasons.append(f"replay: {after.replay.attacks_succeeded}/{after.replay.attacks_total} attacks still succeed")
        if after.replay.legit_blocked:
            reasons.append(f"replay: {after.replay.legit_blocked}/{after.replay.legit_total} legitimate transfers blocked")

    result.reasons = reasons
    result.verdict = "failed" if reasons else "safe_to_review"
    return result
