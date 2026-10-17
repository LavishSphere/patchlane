import asyncio
from pathlib import Path
from typing import Any

from ..integrations.daytona import SandboxHandle
from ..models.incident import Incident
from ..orchestration.state_machine import RUNNING
from .event_bus import EventBus


class DemoState:
    """The single live incident. Patchlane runs one demo at a time."""

    def __init__(self, runs_dir: Path | None):
        self.runs_dir = runs_dir
        self.bus = EventBus(runs_dir)
        self.incident: Incident | None = None
        self.task: asyncio.Task | None = None
        self.sandboxes: list[SandboxHandle] = []
        self._next_number = 1042

    def next_incident_id(self) -> str:
        number = self._next_number
        self._next_number += 1
        return f"INC-{number}"

    @property
    def running(self) -> bool:
        return self.incident is not None and self.incident.status in RUNNING

    def emit(self, type: str, title: str, detail: str | None = None, metadata: dict[str, Any] | None = None) -> None:
        if self.incident is not None:
            self.bus.emit(self.incident.id, type, title, detail, metadata)

    def publish(self) -> None:
        if self.incident is not None:
            self.bus.publish(self.incident)
