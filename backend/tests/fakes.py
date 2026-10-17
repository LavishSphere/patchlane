"""Offline stand-ins for Daytona sandboxes, so the pipeline can be tested without network or keys."""

from datetime import datetime, timezone
from pathlib import Path

from app.integrations.daytona import ExecResult, SandboxHandle
from app.models.incident import SandboxSummary

REPLAY_ATTACKED = '{"attacks_total": 14, "attacks_succeeded": 14, "legit_total": 200, "legit_blocked": 0}'
REPLAY_CLEAN = '{"attacks_total": 14, "attacks_succeeded": 0, "legit_total": 200, "legit_blocked": 0}'
REPLAY_ALL_BLOCKED = '{"attacks_total": 14, "attacks_succeeded": 0, "legit_total": 200, "legit_blocked": 200}'

SOURCE_PATCH = b"diff --git a/bank_service/transfers.py b/bank_service/transfers.py\n+    ledger.require_owner(source, requester_id)\n"


def ok(output: str = "") -> ExecResult:
    return ExecResult(0, output)


def failed(output: str = "") -> ExecResult:
    return ExecResult(1, output)


# Command substrings -> results. The first matching key wins.
BUGGY = {
    "tests/test_incident.py": failed("1 failed in 0.03s"),
    "tests/test_transfers.py": ok("20 passed in 0.10s"),
    "replay.py": ok(REPLAY_ATTACKED),
    "--name-status": ok("M\tbank_service/transfers.py\n"),
}
FIXED = {
    "git apply": ok(),
    "tests/test_incident.py": ok("1 passed in 0.01s"),
    "tests/test_transfers.py": ok("20 passed in 0.10s"),
    "test_hidden": ok("10 passed in 0.05s"),
    "replay.py": ok(REPLAY_CLEAN),
}


class FakeSandbox(SandboxHandle):
    def __init__(self, role: str = "agent", results: dict[str, ExecResult] | None = None, files: dict[str, bytes] | None = None):
        summary = SandboxSummary(
            id=f"fake-{role}", role=role, state="running", created_at=datetime.now(timezone.utc), network_policy="none"
        )
        super().__init__(None, summary)
        self.results = dict(results or {})
        self.files = dict(files or {})
        self.commands: list[str] = []

    async def exec(self, command: str, timeout: int = 120) -> ExecResult:
        self.commands.append(command)
        self.summary.commands_executed += 1
        for key, result in self.results.items():
            if key in command:
                return result
        return ok()

    async def upload_tree(self, tree: Path) -> int:
        return sum(1 for p in tree.rglob("*") if p.is_file())

    async def upload_raw(self, content: bytes, path: str) -> None:
        self.files[path] = content

    async def download_raw(self, path: str) -> bytes:
        return self.files.get(path, b"")

    async def delete(self) -> None:
        self.summary.destroyed_at = datetime.now(timezone.utc)
        self.summary.state = "destroyed"

    @property
    def deleted(self) -> bool:
        return self.summary.destroyed_at is not None
