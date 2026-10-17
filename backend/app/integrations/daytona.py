"""Async wrapper around the Daytona SDK for Patchlane's two sandbox roles.

The SDK is synchronous; every call runs in a worker thread so the event loop
(SSE, Droid's tool server) never blocks.
"""

import asyncio
import shlex
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal

from daytona import CreateSandboxFromSnapshotParams, Daytona, DaytonaError, FileUpload

from ..config import settings
from ..models.incident import SandboxSummary

WORKDIR = "workspace/bank-service"
OUTPUT_LIMIT = 20_000

Role = Literal["agent", "verification"]

_client: Daytona | None = None


def client() -> Daytona:
    global _client
    if _client is None:
        _client = Daytona()  # reads DAYTONA_API_KEY
    return _client


def truncate(text: str, limit: int = OUTPUT_LIMIT) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated {len(text) - limit} characters]"


@dataclass
class ExecResult:
    exit_code: int
    output: str

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


class SandboxHandle:
    """One Daytona sandbox plus the summary the UI shows for it."""

    def __init__(self, sandbox, summary: SandboxSummary, on_change: Callable[[], None] = lambda: None):
        self.sandbox = sandbox
        self.summary = summary
        self._on_change = on_change

    @property
    def id(self) -> str:
        return self.summary.id

    def workspace_path(self, relative: str) -> str:
        """Map a repo-relative path to the sandbox path, refusing escapes."""
        rel = relative.strip()
        if f"{WORKDIR}/" in rel:  # tolerate paths copied from command output
            rel = rel.split(f"{WORKDIR}/", 1)[1]
        if rel.startswith("/"):
            raise ValueError(f"use a path relative to the repository root, not {relative!r}")
        parts = [p for p in Path(rel).parts if p not in ("", ".")]
        if ".." in parts:
            raise ValueError(f"path must stay inside the repository: {relative!r}")
        return "/".join([WORKDIR, *parts])

    async def exec(self, command: str, timeout: int = 120) -> ExecResult:
        response = await asyncio.to_thread(self.sandbox.process.exec, command, cwd=WORKDIR, timeout=timeout)
        self.summary.commands_executed += 1
        self._on_change()
        return ExecResult(exit_code=int(response.exit_code), output=response.result or "")

    async def upload_tree(self, tree: Path) -> int:
        files = [p for p in sorted(tree.rglob("*")) if p.is_file()]
        uploads = [FileUpload(source=str(p), destination=f"{WORKDIR}/{p.relative_to(tree).as_posix()}") for p in files]
        await asyncio.to_thread(self.sandbox.fs.upload_files, uploads)
        return len(files)

    async def git_baseline(self) -> ExecResult:
        return await self.exec("git init -q && git add -A && git commit -qm baseline && git tag baseline")

    async def read_text(self, relative: str) -> str:
        data = await asyncio.to_thread(self.sandbox.fs.download_file, self.workspace_path(relative))
        return (data or b"").decode("utf-8", errors="replace")

    async def write_text(self, relative: str, content: str) -> None:
        await asyncio.to_thread(self.sandbox.fs.upload_file, content.encode(), self.workspace_path(relative))

    async def download_raw(self, path: str) -> bytes:
        return await asyncio.to_thread(self.sandbox.fs.download_file, path) or b""

    async def upload_raw(self, content: bytes, path: str) -> None:
        await asyncio.to_thread(self.sandbox.fs.upload_file, content, path)

    async def delete(self) -> None:
        if self.summary.destroyed_at is not None:
            return
        try:
            await asyncio.to_thread(self.sandbox.delete)
        finally:
            self.summary.destroyed_at = datetime.now(timezone.utc)
            self.summary.state = "destroyed"
            self._on_change()


async def create_sandbox(role: Role, on_change: Callable[[], None] = lambda: None) -> SandboxHandle:
    params = dict(
        snapshot=settings.daytona_snapshot,
        labels={"app": "patchlane", "role": role},
        auto_stop_interval=15,
        ttl_minutes=30,
    )
    network: Literal["none", "restricted"] = "none"
    try:
        sandbox = await asyncio.to_thread(client().create, CreateSandboxFromSnapshotParams(**params, network_block_all=True))
    except DaytonaError:
        network = "restricted"
        sandbox = await asyncio.to_thread(client().create, CreateSandboxFromSnapshotParams(**params))
    summary = SandboxSummary(
        id=sandbox.id,
        role=role,
        state="running",
        created_at=datetime.now(timezone.utc),
        network_policy=network,
    )
    return SandboxHandle(sandbox, summary, on_change)


def quote(text: str) -> str:
    return shlex.quote(text)
