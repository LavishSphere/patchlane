"""Security boundaries: sandbox path handling and the Droid isolation check."""

import asyncio
from types import SimpleNamespace

import pytest

from app.integrations.factory import DroidRunFailed, _check_isolation

from fakes import FakeSandbox

SANDBOX_TOOLS = [f"daytona___sandbox_{name}" for name in ("read_file", "write_file", "exec")]


@pytest.mark.parametrize(
    "path, expected",
    [
        ("bank_service/transfers.py", "workspace/bank-service/bank_service/transfers.py"),
        ("./tests/test_incident.py", "workspace/bank-service/tests/test_incident.py"),
        (".", "workspace/bank-service"),
        ("workspace/bank-service/bank_service/api.py", "workspace/bank-service/bank_service/api.py"),
    ],
)
def test_workspace_paths_stay_in_the_repository(path, expected):
    assert FakeSandbox().workspace_path(path) == expected


@pytest.mark.parametrize("path", ["../secrets", "/etc/passwd", "bank_service/../../escape", "tests/../../.."])
def test_escaping_the_repository_is_refused(path):
    with pytest.raises(ValueError):
        FakeSandbox().workspace_path(path)


class FakeSession:
    def __init__(self, allowed: list[str], skills: list[tuple[str, str]] = ()):
        self._allowed = allowed
        self._skills = skills

    async def list_skills(self):
        return SimpleNamespace(skills=[SimpleNamespace(name=n, location=loc) for n, loc in self._skills])

    async def list_tools(self):
        return [SimpleNamespace(id=t, allowed=True) for t in self._allowed] + [SimpleNamespace(id="Execute", allowed=False)]


def check(session):
    events = []
    asyncio.run(_check_isolation(session, lambda *args: events.append(args)))
    return events


def test_isolated_session_passes():
    events = check(FakeSession(SANDBOX_TOOLS + ["TodoWrite", "ToolSearch", "Script"]))
    assert events[0][0] == "droid.isolation"
    assert events[0][3]["hostToolsEnabled"] == []


@pytest.mark.parametrize("host_tool", ["Execute", "Read", "Task", "ConnectApp"])
def test_any_enabled_host_tool_refuses_to_run(host_tool):
    with pytest.raises(DroidRunFailed, match="host tools"):
        check(FakeSession(SANDBOX_TOOLS + ["Script", host_tool]))


def test_project_skills_refuse_to_run():
    with pytest.raises(DroidRunFailed, match="project skills"):
        check(FakeSession(SANDBOX_TOOLS, skills=[("daytona-sandboxes", "project")]))


def test_missing_sandbox_tools_refuses_to_run():
    with pytest.raises(DroidRunFailed, match="cannot see"):
        check(FakeSession(["TodoWrite", "ToolSearch", "Script"]))
