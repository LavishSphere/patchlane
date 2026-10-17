from typing import Literal

from pydantic import Field

from .base import CamelModel


class TestRun(CamelModel):
    __test__ = False  # not a pytest test class

    command: str
    passed: bool
    summary: str


class RemediationResult(CamelModel):
    """Droid's structured final answer."""

    root_cause: str = Field(description="One sentence naming the defect and where it is.")
    changed_files: list[str] = Field(description="Paths relative to the repository root.")
    patch_summary: str
    tests_run: list[TestRun]
    risk: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    human_summary: str = Field(description="Two sentences for the on-call engineer.")
