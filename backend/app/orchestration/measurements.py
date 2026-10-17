"""Run the incident test, regression suite and replay inside a sandbox."""

import json
import re

from ..integrations.daytona import SandboxHandle
from ..models.incident import Measurements, ReplayResult

PYTEST = "python -m pytest -q -p no:cacheprovider"
REPRO = f"{PYTEST} tests/test_incident.py"
SUITE = f"{PYTEST} tests/test_transfers.py"
REPLAY = "python scripts/replay.py --json"


def pytest_counts(output: str) -> tuple[int, int]:
    """(passed, total) from pytest's summary line; errors count as failures."""
    passed = sum(int(n) for n in re.findall(r"(\d+) passed", output))
    failed = sum(int(n) for n in re.findall(r"(\d+) (?:failed|errors?)\b", output))
    return passed, passed + failed


def parse_replay(output: str) -> ReplayResult | None:
    for line in reversed(output.strip().splitlines()):
        try:
            return ReplayResult.model_validate(json.loads(line))
        except ValueError:
            continue
    return None


async def measure(sandbox: SandboxHandle, replay: bool) -> tuple[Measurements, str]:
    """Returns the measurements plus the repro test output (shown to Droid)."""
    repro = await sandbox.exec(REPRO)
    suite = await sandbox.exec(SUITE)
    suite_passed, suite_total = pytest_counts(suite.output)
    replay_result = parse_replay((await sandbox.exec(REPLAY)).output) if replay else None
    return (
        Measurements(repro_passed=repro.ok, suite_passed=suite_passed, suite_total=suite_total, replay=replay_result),
        repro.output,
    )
