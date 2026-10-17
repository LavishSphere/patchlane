from datetime import datetime
from typing import Any

from pydantic import Field

from .base import CamelModel


class PatchlaneEvent(CamelModel):
    id: str
    incident_id: str
    type: str
    timestamp: datetime
    title: str
    detail: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
