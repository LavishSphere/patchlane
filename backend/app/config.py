import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
DEMO_DIR = REPO_ROOT / "demo"
RUNS_DIR = Path(os.getenv("PATCHLANE_RUNS_DIR", REPO_ROOT / "runs"))

load_dotenv(BACKEND_DIR / ".env")

# demo/casekit.py builds the sandbox trees; it is shared with demo/validate_cases.py.
if str(DEMO_DIR) not in sys.path:
    sys.path.insert(0, str(DEMO_DIR))


def _origins() -> tuple[str, ...]:
    raw = os.getenv("PATCHLANE_ALLOWED_ORIGINS", "http://localhost:5173")
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    operator_token: str = field(default_factory=lambda: os.getenv("PATCHLANE_OPERATOR_TOKEN", ""))
    allowed_origins: tuple[str, ...] = field(default_factory=_origins)
    daytona_snapshot: str = field(default_factory=lambda: os.getenv("DAYTONA_SNAPSHOT", "patchlane-bank-service"))
    factory_api_key: str = field(default_factory=lambda: os.getenv("FACTORY_API_KEY", ""))
    droid_model: str = field(default_factory=lambda: os.getenv("DROID_MODEL", ""))
    droid_timeout_s: float = field(default_factory=lambda: float(os.getenv("DROID_TIMEOUT_S", "240")))
    default_case: str = field(default_factory=lambda: os.getenv("PATCHLANE_DEFAULT_CASE", "ownership-check"))


settings = Settings()
