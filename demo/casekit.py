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


def agent_tree(case: Case, dest: Path, variant_id: str | None = None) -> Path:
    return build_tree(case, dest, buggy=True, include_hidden=False, variant_id=variant_id)


def verification_tree(case: Case, dest: Path, variant_id: str | None = None) -> Path:
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
