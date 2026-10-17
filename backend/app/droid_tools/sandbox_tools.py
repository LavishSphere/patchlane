"""The only tools Factory Droid gets. Every one of them acts inside the agent sandbox.

Paths are relative to the repository root inside the sandbox. Each call emits a
timeline event so the dashboard shows what Droid is doing as it happens.
"""

from typing import Any, Callable

from daytona import DaytonaError
from droid_sdk.mcp import ToolResponse, tool

from ..integrations.daytona import WORKDIR, SandboxHandle, quote, truncate

Emit = Callable[[str, str, str | None, dict[str, Any] | None], object]


def build_sandbox_tools(sandbox: SandboxHandle, emit: Emit, on_first_write: Callable[[], None]) -> list:
    wrote = False

    def relative(path: str) -> str:
        return sandbox.workspace_path(path)[len(WORKDIR) :].lstrip("/") or "."

    def meta(name: str, **extra: Any) -> dict[str, Any]:
        return {"tool": name, "sandbox": sandbox.id, "provider": "daytona", **extra}

    def fail(message: str) -> ToolResponse:
        return ToolResponse(content=message, is_error=True)

    @tool("sandbox_list_files", "List files under a directory of the incident repository. Use '.' for the repository root.")
    async def sandbox_list_files(path: str) -> ToolResponse:
        try:
            rel = relative(path)
        except ValueError as exc:
            return fail(str(exc))
        emit("droid.tool.call", "Listing the repository" if rel == "." else f"Listing {rel}", None, meta("sandbox_list_files"))
        result = await sandbox.exec(
            f"find {quote(rel)} -maxdepth 3 -not -path '*/.git*' -not -path '*/__pycache__*' -not -path '*/.pytest_cache*' | sort"
        )
        return ToolResponse(content=truncate(result.output) or "(empty)", is_error=not result.ok)

    @tool("sandbox_read_file", "Read a text file from the incident repository.")
    async def sandbox_read_file(path: str) -> ToolResponse:
        try:
            rel = relative(path)
            emit("droid.file.read", f"Reading {rel}", None, meta("sandbox_read_file", path=rel))
            return ToolResponse(content=truncate(await sandbox.read_text(rel)))
        except (ValueError, DaytonaError) as exc:
            return fail(f"could not read {path}: {exc}")

    @tool(
        "sandbox_write_file",
        "Write a text file in the incident repository, replacing its contents. Send the complete file.",
    )
    async def sandbox_write_file(path: str, content: str) -> ToolResponse:
        nonlocal wrote
        try:
            rel = relative(path)
            await sandbox.write_text(rel, content)
        except (ValueError, DaytonaError) as exc:
            return fail(f"could not write {path}: {exc}")
        if not wrote:
            wrote = True
            on_first_write()
        emit("droid.file.written", f"Patched {rel}", None, meta("sandbox_write_file", path=rel, bytes=len(content)))
        return ToolResponse(content=f"wrote {len(content)} characters to {rel}")

    @tool("sandbox_search", "Search file contents in the incident repository with a regular expression (grep -E).")
    async def sandbox_search(pattern: str, path: str) -> ToolResponse:
        try:
            rel = relative(path)
        except ValueError as exc:
            return fail(str(exc))
        emit("droid.search", f"Searching for {pattern!r}", None, meta("sandbox_search", pattern=pattern, path=rel))
        result = await sandbox.exec(
            f"grep -rnIE --exclude-dir=.git --exclude-dir=__pycache__ -e {quote(pattern)} {quote(rel)} | head -200"
        )
        return ToolResponse(content=truncate(result.output) or "no matches")

    @tool("sandbox_exec", "Run a shell command in the incident repository root. The sandbox has no network access.")
    async def sandbox_exec(command: str) -> ToolResponse:
        emit("droid.command", f"$ {command[:120]}", command, meta("sandbox_exec"))
        result = await sandbox.exec(command, timeout=60)
        emit("droid.command.finished", f"Exit code {result.exit_code}", truncate(result.output, 4_000), meta("sandbox_exec", exit_code=result.exit_code))
        return ToolResponse(content=f"exit code {result.exit_code}\n{truncate(result.output)}")

    @tool("sandbox_run_tests", "Run pytest in the incident repository. Pass a test path, or '.' for the whole suite.")
    async def sandbox_run_tests(target: str) -> ToolResponse:
        try:
            rel = relative(target)
        except ValueError as exc:
            return fail(str(exc))
        command = f"python -m pytest -q -p no:cacheprovider {quote(rel) if rel != '.' else ''}".strip()
        emit("droid.tests", f"Running tests: {rel}", command, meta("sandbox_run_tests"))
        result = await sandbox.exec(command, timeout=120)
        summary = result.output.strip().splitlines()[-1] if result.output.strip() else ""
        emit("droid.tests.finished", summary or f"Exit code {result.exit_code}", truncate(result.output, 4_000), meta("sandbox_run_tests", exit_code=result.exit_code, passed=result.ok))
        return ToolResponse(content=f"exit code {result.exit_code}\n{truncate(result.output)}")

    @tool("sandbox_git_diff", "Show every change made in the repository since the incident baseline.")
    async def sandbox_git_diff() -> ToolResponse:
        emit("droid.tool.call", "Reviewing the diff", None, meta("sandbox_git_diff"))
        result = await sandbox.exec("git add -A && git diff --cached baseline")
        return ToolResponse(content=truncate(result.output) or "no changes")

    return [
        sandbox_list_files,
        sandbox_read_file,
        sandbox_write_file,
        sandbox_search,
        sandbox_exec,
        sandbox_run_tests,
        sandbox_git_diff,
    ]
