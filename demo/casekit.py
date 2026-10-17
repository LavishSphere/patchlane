"""Build bank-service trees for incident cases.

Three kinds of tree, all built on the host from demo/bank-service:
  agent         buggy service + visible repro test (uploaded to the agent sandbox)
  verification  buggy service + repro test + hidden tests (verification sandbox)
  clean         correct service + repro test + hidden tests (case validation only)

ground_truth.json is never copied into any tree.
"""

import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent
SERVICE_DIR = DEMO_DIR / "bank-service"
CASES_DIR = DEMO_DIR / "cases"

HINT_PATTERN = re.compile(r"\b(BUG|TODO|FIXME|HACK|XXX)\b|fix me", re.IGNORECASE)
IGNORED = shutil.ignore_patterns("__pycache__", ".pytest_cache", "*.pyc")


@dataclass(frozen=True)
class Case:
    id: str
    dir: Path
    meta: dict
    ground_truth: dict

    @property
    def hidden_tests(self) -> list[Path]:
        return sorted((self.dir / "hidden_tests").glob("test_*.py"))


def load_case(case_id: str) -> Case:
    case_dir = CASES_DIR / case_id
    return Case(
        id=case_id,
        dir=case_dir,
        meta=json.loads((case_dir / "case.json").read_text()),
        ground_truth=json.loads((case_dir / "ground_truth.json").read_text()),
    )


def list_cases() -> list[Case]:
    return [load_case(p.name) for p in sorted(CASES_DIR.iterdir()) if (p / "case.json").exists()]


def build_tree(case: Case, dest: Path, *, buggy: bool = True, include_hidden: bool = False) -> Path:
    shutil.copytree(SERVICE_DIR, dest, ignore=IGNORED)
    if buggy:
        overrides = case.dir / "buggy_files"
        for src in overrides.rglob("*"):
            if src.is_file():
                target = dest / src.relative_to(overrides)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
    shutil.copy2(case.dir / "repro_test.py", dest / "tests" / "test_incident.py")
    if include_hidden:
        for test in case.hidden_tests:
            shutil.copy2(test, dest / "tests" / test.name)
    return dest


def agent_tree(case: Case, dest: Path) -> Path:
    return build_tree(case, dest, buggy=True, include_hidden=False)


def verification_tree(case: Case, dest: Path) -> Path:
    return build_tree(case, dest, buggy=True, include_hidden=True)


def find_leaks(case: Case, tree: Path) -> list[str]:
    """Problems that would hand the agent the answer if this tree were uploaded."""
    problems = []
    hidden_names = {t.name for t in case.hidden_tests}
    for path in tree.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(tree).as_posix()
        if path.name == "ground_truth.json" or path.name in hidden_names:
            problems.append(f"{rel}: must not be in the agent tree")
        elif path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
            for lineno, line in enumerate(path.read_text().splitlines(), start=1):
                if HINT_PATTERN.search(line):
                    problems.append(f"{rel}:{lineno}: hint keyword: {line.strip()}")
    return problems
