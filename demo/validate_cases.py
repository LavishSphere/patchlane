"""Check every incident case before it is used in a demo or benchmark.

For each case in demo/cases/:
  - the clean service passes the repro test and every hidden test
  - the buggy service fails the repro test and at least one hidden test
  - the agent upload tree contains no hidden tests, ground truth, or hint keywords
  - cases with "replay": true block all attacks when clean and let all through when buggy

Usage: python demo/validate_cases.py [case_id ...]
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from casekit import Case, agent_tree, build_tree, find_leaks, list_cases, load_case  # noqa: E402


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

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        clean = build_tree(case, tmp / "clean", buggy=False, include_hidden=True)
        result = pytest(clean)
        if result.returncode != 0:
            failures.append(f"clean service fails its tests: {summary(result)}")

        buggy = build_tree(case, tmp / "buggy", buggy=True, include_hidden=True)
        repro = pytest(buggy, "tests/test_incident.py")
        if repro.returncode == 0:
            failures.append("buggy service passes the repro test (incident does not reproduce)")
        if hidden and pytest(buggy, *hidden).returncode == 0:
            failures.append("buggy service passes every hidden test")
        suite = pytest(buggy, "tests/test_transfers.py")
        if case.meta.get("suite_green_when_buggy") and suite.returncode != 0:
            failures.append(f"regression suite should pass on the buggy service: {summary(suite)}")

        agent = agent_tree(case, tmp / "agent")
        failures.extend(find_leaks(case, agent))

        if case.meta.get("replay"):
            clean_replay, buggy_replay = replay(clean), replay(buggy)
            if clean_replay["attacks_succeeded"] or clean_replay["legit_blocked"]:
                failures.append(f"clean replay is not clean: {clean_replay}")
            if buggy_replay["attacks_succeeded"] != buggy_replay["attacks_total"] or buggy_replay["legit_blocked"]:
                failures.append(f"buggy replay does not reproduce the incident: {buggy_replay}")
            print(f"  replay clean: {clean_replay}")
            print(f"  replay buggy: {buggy_replay}")

        print(f"  buggy repro: {summary(repro)}")
        print(f"  buggy suite: {summary(suite)}")
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
