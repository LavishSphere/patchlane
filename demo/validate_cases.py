"""Check every incident case before it is used in a demo or benchmark.

For each case in demo/cases/:
  - the clean service passes the repro test and every hidden test
  - the buggy service fails the repro test and at least one hidden test
  - the agent upload tree contains no hidden tests, ground truth, or hint keywords
  - cases with "replay": true block all attacks when clean and let all through when buggy

Every variant in variants.json goes through the same buggy-tree checks, plus:
  - a well-formed, unique id, a label, a function and a root cause
  - it edits exactly one existing file under bank_service/, each edit target
    occurs exactly once, and the edited file still parses
  - it differs from the clean file and from every other variant of the case
  - no label, root cause or variants.json text reaches the agent tree

Usage: python demo/validate_cases.py [case_id ...]
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ast  # noqa: E402

from casekit import (  # noqa: E402
    DEFAULT_VARIANT,
    ID_PATTERN,
    SERVICE_DIR,
    Case,
    agent_tree,
    apply_variant,
    build_tree,
    find_leaks,
    list_cases,
    load_case,
)

DASHES = ("\u2014", "\u2013")


def pytest(tree: Path, *targets: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *targets],
        cwd=tree,
        capture_output=True,
        text=True,
    )


def replay(tree: Path) -> dict:
    out = subprocess.run(
        [sys.executable, "scripts/replay.py", "--json"], cwd=tree, capture_output=True, text=True, check=True
    )
    return json.loads(out.stdout)


def summary(result: subprocess.CompletedProcess) -> str:
    lines = result.stdout.strip().splitlines()
    return lines[-1] if lines else result.stderr.strip()[-200:]


def check_variant_spec(case: Case) -> list[str]:
    failures = []
    if not case.safeguard or not case.default_label:
        failures.append("variants.json needs a safeguard and a default_label")
    seen = {DEFAULT_VARIANT}
    sources = {}
    for v in case.variants:
        where = f"variant {v.id!r}"
        if not ID_PATTERN.match(v.id) or len(v.id) > 40:
            failures.append(f"{where}: id must be lowercase words joined by hyphens")
        if v.id in seen:
            failures.append(f"{where}: duplicate id (or reuses 'default')")
        seen.add(v.id)
        for field, value in (("label", v.label), ("function", v.function), ("root_cause", v.root_cause)):
            if not value or not value.strip():
                failures.append(f"{where}: missing {field}")
        if len(v.label) > 80:
            failures.append(f"{where}: label longer than 80 characters")
        if not v.file.startswith("bank_service/") or not v.file.endswith(".py") or ".." in v.file:
            failures.append(f"{where}: file must be a .py file under bank_service/")
            continue
        clean_path = SERVICE_DIR / v.file
        if not clean_path.is_file():
            failures.append(f"{where}: {v.file} does not exist in the clean service")
            continue
        if not v.edits:
            failures.append(f"{where}: no edits")
            continue
        clean = clean_path.read_text()
        try:
            edited = apply_variant(v, clean)
        except ValueError as exc:
            failures.append(str(exc))
            continue
        if edited == clean:
            failures.append(f"{where}: edits leave the file unchanged")
        try:
            ast.parse(edited)
        except SyntaxError as exc:
            failures.append(f"{where}: edited file does not parse: {exc}")
        default_override = case.dir / "buggy_files" / v.file
        if default_override.is_file() and default_override.read_text() == edited:
            failures.append(f"{where}: identical to the default bug")
        if (v.file, edited) in sources.values():
            failures.append(f"{where}: identical to another variant")
        sources[v.id] = (v.file, edited)
    for text in [case.safeguard, case.default_label] + [t for v in case.variants for t in (v.label, v.root_cause)]:
        if any(d in text for d in DASHES):
            failures.append(f"em or en dash in {text!r}")
    return failures


def validate_bug(case: Case, variant_id: str, tmp: Path, hidden: list[str]) -> list[str]:
    """Buggy-tree checks for one way of breaking the case."""
    failures = []
    tag = "" if variant_id == DEFAULT_VARIANT else f"[{variant_id}] "
    buggy = build_tree(case, tmp / f"buggy-{variant_id}", buggy=True, include_hidden=True, variant_id=variant_id)
    repro = pytest(buggy, "tests/test_incident.py")
    if repro.returncode == 0:
        failures.append(f"{tag}buggy service passes the repro test (incident does not reproduce)")
    if hidden and pytest(buggy, *hidden).returncode == 0:
        failures.append(f"{tag}buggy service passes every hidden test")
    suite = pytest(buggy, "tests/test_transfers.py")
    if variant_id == DEFAULT_VARIANT and case.meta.get("suite_green_when_buggy") and suite.returncode != 0:
        failures.append(f"regression suite should pass on the buggy service: {summary(suite)}")

    agent = agent_tree(case, tmp / f"agent-{variant_id}", variant_id=variant_id)
    failures.extend(f"{tag}{leak}" for leak in find_leaks(case, agent))
    secret_texts = [case.default_label] + [t for v in case.variants for t in (v.label, v.root_cause)]
    for path in agent.rglob("*"):
        if path.is_file() and path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
            text = path.read_text()
            for secret in secret_texts:
                if secret and secret in text:
                    failures.append(f"{tag}{path.relative_to(agent)} contains case metadata: {secret[:50]!r}")

    if case.meta.get("replay"):
        buggy_replay = replay(buggy)
        if buggy_replay["attacks_succeeded"] != buggy_replay["attacks_total"] or buggy_replay["legit_blocked"]:
            failures.append(f"{tag}buggy replay does not reproduce the incident: {buggy_replay}")
        print(f"  {tag}replay buggy: {buggy_replay}")

    print(f"  {tag}buggy repro: {summary(repro)}")
    print(f"  {tag}buggy suite: {summary(suite)}")
    return failures


def validate(case: Case) -> list[str]:
    failures = []
    hidden = [f"tests/{t.name}" for t in case.hidden_tests]
    if not hidden:
        failures.append("no hidden tests")
    for field in ("file", "function", "root_cause"):
        if not case.ground_truth.get(field):
            failures.append(f"ground_truth.json missing {field!r}")
    if case.meta.get("severity") not in ("SEV-1", "SEV-2"):
        failures.append(f"severity must be SEV-1 or SEV-2 (the Incident model allows no other): {case.meta.get('severity')!r}")
    spec_failures = check_variant_spec(case)
    failures.extend(spec_failures)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        clean = build_tree(case, tmp / "clean", buggy=False, include_hidden=True)
        result = pytest(clean)
        if result.returncode != 0:
            failures.append(f"clean service fails its tests: {summary(result)}")
        if case.meta.get("replay"):
            clean_replay = replay(clean)
            if clean_replay["attacks_succeeded"] or clean_replay["legit_blocked"]:
                failures.append(f"clean replay is not clean: {clean_replay}")
            print(f"  replay clean: {clean_replay}")

        variant_ids = [DEFAULT_VARIANT] + ([] if spec_failures else [v.id for v in case.variants])
        for variant_id in variant_ids:
            failures.extend(validate_bug(case, variant_id, tmp, hidden))
    return failures


def main() -> None:
    cases = [load_case(c) for c in sys.argv[1:]] or list_cases()
    if not cases:
        sys.exit("no cases found in demo/cases/")
    failed = False
    for case in cases:
        print(f"{case.id}")
        failures = validate(case)
        for failure in failures:
            print(f"  FAIL {failure}")
        print("  OK" if not failures else "")
        failed = failed or bool(failures)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
