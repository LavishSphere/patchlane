"""Build bank-service trees for incident cases.

Three kinds of tree, all built on the host from demo/bank-service:
  agent         buggy service + visible repro test (uploaded to the agent sandbox)
  verification  buggy service + repro test + hidden tests (verification sandbox)
  clean         correct service + repro test + hidden tests (case validation only)

A case's bug comes either from buggy_files/ (the "default" variant) or from one
of the alternative variants in variants.json, each a set of exact text edits to
one clean source file. ground_truth.json and variants.json are never copied
into any tree.
"""

import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent
SERVICE_DIR = DEMO_DIR / "bank-service"
CASES_DIR = DEMO_DIR / "cases"

HINT_PATTERN = re.compile(r"\b(BUG|TODO|FIXME|HACK|XXX)\b|fix me", re.IGNORECASE)
IGNORED = shutil.ignore_patterns("__pycache__", ".pytest_cache", "*.pyc")
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DEFAULT_VARIANT = "default"


@dataclass(frozen=True)
class Variant:
    id: str
    label: str
    file: str
    function: str
    root_cause: str
    edits: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class Case:
    id: str
    dir: Path
    meta: dict
    ground_truth: dict
    safeguard: str = ""
    default_label: str = ""
    variants: tuple[Variant, ...] = ()

    @property
    def hidden_tests(self) -> list[Path]:
        return sorted((self.dir / "hidden_tests").glob("test_*.py"))

    def options(self) -> list[dict]:
        """Every way this case can be broken, the default (buggy_files/) first."""
        return [{"id": DEFAULT_VARIANT, "label": self.default_label}] + [{"id": v.id, "label": v.label} for v in self.variants]

    def variant(self, variant_id: str | None) -> Variant | None:
        """None for the default bug. Raises KeyError for an id this case doesn't define."""
        if variant_id in (None, DEFAULT_VARIANT):
            return None
        for v in self.variants:
            if v.id == variant_id:
                return v
        raise KeyError(f"case {self.id!r} has no variant {variant_id!r}")

    def truth(self, variant_id: str | None = None) -> dict:
        """file, function and root_cause for the chosen variant."""
        v = self.variant(variant_id)
        if v is None:
            return dict(self.ground_truth)
        return {"file": v.file, "function": v.function, "root_cause": v.root_cause}

    def label(self, variant_id: str | None = None) -> str:
        v = self.variant(variant_id)
        return self.default_label if v is None else v.label


def case_ids() -> list[str]:
    return [p.name for p in sorted(CASES_DIR.iterdir()) if (p / "case.json").exists() and ID_PATTERN.match(p.name)]


def load_case(case_id: str) -> Case:
    """Only ids of existing case folders are accepted; anything else raises FileNotFoundError."""
    if not isinstance(case_id, str) or not ID_PATTERN.match(case_id) or case_id not in case_ids():
        raise FileNotFoundError(f"unknown case {case_id!r}")
    case_dir = CASES_DIR / case_id
    variants_file = case_dir / "variants.json"
    spec = json.loads(variants_file.read_text()) if variants_file.exists() else {}
    variants = tuple(
        Variant(
            id=v["id"],
            label=v["label"],
            file=v["file"],
            function=v["function"],
            root_cause=v["root_cause"],
            edits=tuple((e["find"], e["replace"]) for e in v["edits"]),
        )
        for v in spec.get("variants", [])
    )
    meta = json.loads((case_dir / "case.json").read_text())
    return Case(
        id=case_id,
        dir=case_dir,
        meta=meta,
        ground_truth=json.loads((case_dir / "ground_truth.json").read_text()),
        safeguard=spec.get("safeguard", meta.get("title", "")),
        default_label=spec.get("default_label", "Seeded bug"),
        variants=variants,
    )


def apply_variant(variant: Variant, clean_source: str) -> str:
    """Apply a variant's edits to the clean file. Each find string must occur exactly once."""
    source = clean_source
    for find, replace in variant.edits:
        count = source.count(find)
        if count != 1:
            raise ValueError(f"variant {variant.id!r}: edit target found {count} times in {variant.file}")
        source = source.replace(find, replace)
    return source


def list_cases() -> list[Case]:
    return [load_case(p.name) for p in sorted(CASES_DIR.iterdir()) if (p / "case.json").exists()]


def build_tree(
    case: Case, dest: Path, *, buggy: bool = True, include_hidden: bool = False, variant_id: str | None = None
) -> Path:
    variant = case.variant(variant_id)  # raises KeyError before anything is written
    shutil.copytree(SERVICE_DIR, dest, ignore=IGNORED)
    if buggy and variant is None:
        overrides = case.dir / "buggy_files"
        for src in overrides.rglob("*"):
            if src.is_file():
                target = dest / src.relative_to(overrides)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
    elif buggy:
        target = dest / variant.file
        target.write_text(apply_variant(variant, target.read_text()))
    shutil.copy2(case.dir / "repro_test.py", dest / "tests" / "test_incident.py")
    if include_hidden:
        for test in case.hidden_tests:
            shutil.copy2(test, dest / "tests" / test.name)
    return dest


# --- Scenarios: up to three bugs at once -----------------------------------------

MAX_BUGS = 3
SCENARIOS_FILE = CASES_DIR / "scenarios.json"
REPRO_NAMES = ("test_incident.py", "test_incident_2.py", "test_incident_3.py")
Bug = tuple[Case, str | None]


def bug_key(case: Case, variant_id: str | None) -> str:
    return f"{case.id}@{variant_id or DEFAULT_VARIANT}"


def scenario_key(bugs: list[Bug]) -> tuple[str, ...]:
    """Order-independent key for a set of bugs."""
    return tuple(sorted(bug_key(*bug) for bug in bugs))


def pair_key(first: Bug, second: Bug) -> tuple[str, str]:
    return scenario_key([first, second])


def bug_files(case: Case, variant_id: str | None = None) -> dict[str, str]:
    """Every source file this bug changes, relative path -> full broken content."""
    variant = case.variant(variant_id)
    if variant is None:
        overrides = case.dir / "buggy_files"
        return {p.relative_to(overrides).as_posix(): p.read_text() for p in sorted(overrides.rglob("*")) if p.is_file()}
    return {variant.file: apply_variant(variant, (SERVICE_DIR / variant.file).read_text())}


def three_way(rel: str, ours: str, theirs: str) -> str:
    """Merge two broken versions of one clean file with git. Raises ValueError on any conflict."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "ours").write_text(ours)
        (tmp / "base").write_text((SERVICE_DIR / rel).read_text())
        (tmp / "theirs").write_text(theirs)
        result = subprocess.run(["git", "merge-file", "-p", "ours", "base", "theirs"], cwd=tmp, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValueError(f"these bugs change the same lines in {rel}")
    return result.stdout


def combine(bugs: list[Bug]) -> dict[str, str]:
    files: dict[str, str] = {}
    for case, variant_id in bugs:
        for rel, content in bug_files(case, variant_id).items():
            files[rel] = three_way(rel, files[rel], content) if rel in files else content
    return files


def build_scenario_tree(bugs: list[Bug], dest: Path, *, include_hidden: bool) -> Path:
    """Every chosen bug in one service, each case's repro test as its own incident test."""
    if not 2 <= len(bugs) <= MAX_BUGS:
        raise ValueError(f"a scenario has 2 to {MAX_BUGS} bugs")
    if len({case.id for case, _ in bugs}) != len(bugs):
        raise ValueError("each safeguard can be chosen once")
    files = combine(bugs)  # raises before anything is written
    shutil.copytree(SERVICE_DIR, dest, ignore=IGNORED)
    for rel, content in files.items():
        (dest / rel).write_text(content)
    for (case, _), name in zip(bugs, REPRO_NAMES):
        shutil.copy2(case.dir / "repro_test.py", dest / "tests" / name)
    if include_hidden:
        for case, _ in bugs:
            for test in case.hidden_tests:
                shutil.copy2(test, dest / "tests" / test.name)
    return dest


def build_pair_tree(first: Bug, second: Bug, dest: Path, *, include_hidden: bool) -> Path:
    return build_scenario_tree([first, second], dest, include_hidden=include_hidden)


_scenarios_cache: dict = {}


def _scenarios() -> dict:
    """demo/cases/scenarios.json, written by demo/validate_scenarios.py, cached until it changes."""
    if not SCENARIOS_FILE.exists():
        return {"allowed": set(), "refused": {}}
    mtime = SCENARIOS_FILE.stat().st_mtime
    if _scenarios_cache.get("mtime") != mtime:
        data = json.loads(SCENARIOS_FILE.read_text())
        _scenarios_cache.update(
            mtime=mtime,
            allowed={tuple(sorted(s)) for s in data["allowed"]},
            refused={tuple(sorted(k.split("|"))): v for k, v in data["refused"].items()},
        )
    return _scenarios_cache


def scenario_status(keys: tuple[str, ...]) -> tuple[bool, str | None]:
    """(allowed, reason) for a set of 2 or 3 bugs, from the validated list."""
    keys = tuple(sorted(keys))
    data = _scenarios()
    if keys in data["allowed"]:
        return True, None
    return False, data["refused"].get(keys, "this combination has not been validated")


def allowed_pairs() -> set[tuple[str, str]]:
    return {s for s in _scenarios()["allowed"] if len(s) == 2}


def merged_meta(*cases: Case) -> dict:
    """What Droid is told about several incidents at once: their symptoms and evidence, nothing else."""
    metas = [c.meta for c in cases]
    endpoints = list(dict.fromkeys(m["endpoint"] for m in metas))
    endpoint = endpoints[0] if len(endpoints) == 1 else ", ".join(endpoints[:-1]) + f" and {endpoints[-1]}"
    return {
        **metas[0],
        "title": "; ".join(m["title"] for m in metas),
        "severity": "SEV-1" if any(m["severity"] == "SEV-1" for m in metas) else "SEV-2",
        "endpoint": endpoint,
        "symptom": " ".join(m["symptom"] for m in metas),
        "evidence": [line for m in metas for line in m.get("evidence", [])],
        "repro_command": "python -m pytest -q " + " ".join(f"tests/{n}" for n in REPRO_NAMES[: len(metas)]),
        "replay": any(m.get("replay") for m in metas),
    }


def _extras(second: "Bug | list[Bug] | None") -> list[Bug]:
    if second is None:
        return []
    return [second] if isinstance(second, tuple) else list(second)


def agent_tree(case: Case, dest: Path, variant_id: str | None = None, second: "Bug | list[Bug] | None" = None) -> Path:
    extras = _extras(second)
    if extras:
        return build_scenario_tree([(case, variant_id), *extras], dest, include_hidden=False)
    return build_tree(case, dest, buggy=True, include_hidden=False, variant_id=variant_id)


def verification_tree(case: Case, dest: Path, variant_id: str | None = None, second: "Bug | list[Bug] | None" = None) -> Path:
    extras = _extras(second)
    if extras:
        return build_scenario_tree([(case, variant_id), *extras], dest, include_hidden=True)
    return build_tree(case, dest, buggy=True, include_hidden=True, variant_id=variant_id)


def find_leaks(case: Case, tree: Path) -> list[str]:
    """Problems that would hand the agent the answer if this tree were uploaded."""
    problems = []
    hidden_names = {t.name for t in case.hidden_tests}
    for path in tree.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(tree).as_posix()
        if path.name in ("ground_truth.json", "variants.json") or path.name in hidden_names:
            problems.append(f"{rel}: must not be in the agent tree")
        elif path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
            for lineno, line in enumerate(path.read_text().splitlines(), start=1):
                if HINT_PATTERN.search(line):
                    problems.append(f"{rel}:{lineno}: hint keyword: {line.strip()}")
    return problems
