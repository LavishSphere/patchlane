"""Event history for the current incident.

Every event and incident snapshot is kept in memory (so a new SSE client gets
the full story), pushed to live subscribers, and appended to a recording in
runs/ that the frontend can replay later.
"""

import asyncio
import itertools
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..models.events import PatchlaneEvent
from ..models.incident import Incident

Message = tuple[str, str]  # (SSE event name, JSON payload)


class EventBus:
    def __init__(self, runs_dir: Path | None = None):
        self._runs_dir = runs_dir
        self._recording: Path | None = None
        self._events: list[PatchlaneEvent] = []
        self._snapshot: str | None = None
        self._subscribers: set[asyncio.Queue[Message]] = set()
        self._ids = itertools.count(1)

    def start(self, incident_id: str) -> None:
        self.clear()
        if self._runs_dir is not None:
            self._runs_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            self._recording = self._runs_dir / f"{incident_id}-{stamp}.jsonl"

    def clear(self) -> None:
        # Close streams that belong to the previous incident.
        for queue in self._subscribers:
            queue.put_nowait(("end", "{}"))
        self._subscribers.clear()
        self._events.clear()
        self._snapshot = None
        self._recording = None
        self._ids = itertools.count(1)

    @property
    def recording(self) -> Path | None:
        return self._recording

    def emit(
        self, incident_id: str, type: str, title: str, detail: str | None = None, metadata: dict[str, Any] | None = None
    ) -> PatchlaneEvent:
        event = PatchlaneEvent(
            id=f"evt_{next(self._ids)}",
            incident_id=incident_id,
            type=type,
            timestamp=datetime.now(timezone.utc),
            title=title,
            detail=detail,
            metadata=metadata or {},
        )
        self._events.append(event)
        self._broadcast(("event", event.to_json()))
        return event

    def publish(self, incident: Incident) -> None:
        self._snapshot = incident.to_json()
        self._broadcast(("incident", self._snapshot))

    def history(self) -> list[PatchlaneEvent]:
        return list(self._events)

    def subscribe(self) -> asyncio.Queue[Message]:
        queue: asyncio.Queue[Message] = asyncio.Queue()
        if self._snapshot is not None:
            queue.put_nowait(("incident", self._snapshot))
        for event in self._events:
            queue.put_nowait(("event", event.to_json()))
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Message]) -> None:
        self._subscribers.discard(queue)

    def _broadcast(self, message: Message) -> None:
        for queue in self._subscribers:
            queue.put_nowait(message)
        if self._recording is not None:
            line = {"kind": message[0], "at": datetime.now(timezone.utc).isoformat(), "data": json.loads(message[1])}
            with self._recording.open("a") as f:
                f.write(json.dumps(line) + "\n")
