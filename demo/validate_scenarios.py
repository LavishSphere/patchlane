"""Decide which sets of two or three bugs can run as one scenario, and write demo/cases/scenarios.json.

A scenario (two or three different cases, any variant of each) is allowed only when:
  - git merge-file combines every bug with no conflict and every changed file parses
  - with all the bugs in place, each case's incident test fails, and at least one
    held-out test of each case fails, so verification can see every bug
  - a case with a transfer replay still lets every attack through and blocks no
    legitimate transfer
  - nothing about any bug (labels, root causes, hidden tests, ground truth) is in
    the tree uploaded to the agent sandbox

A set of three that contains a refused pair is refused for the same reason
without running anything. Every refused scenario keeps its reason, so the
dashboard can tell the operator why. The clean service passing every test is
checked per case by validate_cases.py.

Usage: python demo/validate_scenarios.py [--workers 8]
"""

import argparse
import ast
import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from casekit import (  # noqa: E402
    MAX_BUGS,
    REPRO_NAMES,
    SCENARIOS_FILE,
    Bug,
    build_scenario_tree,
    combine,
    find_leaks,
    list_cases,
    scenario_key,
)

RESULT = re.compile(r"^(PASSED|FAILED|ERROR) (tests/[^:\s]+)")


def outcomes(tree: Path) -> dict[str, set[str]]:
    """Test file -> set of outcomes, from one pytest run over the whole tree."""
    run = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-rA", "-p", "no:cacheprovider"], cwd=tree, capture_output=True, text=True
    )
    found: dict[str, set[str]] = {}
    for line in run.stdout.splitlines():
        match = RESULT.match(line)
        if match:
            found.setdefault(match.group(2), set()).add(match.group(1))
    return found


def replay(tree: Path) -> dict:
    out = subprocess.run([sys.executable, "scripts/replay.py", "--json"], cwd=tree, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def safeguard(case) -> str:
    return case.safeguard[0].lower() + case.safeguard[1:]


def check(bugs: list[Bug]) -> str | None:
    """None when the scenario is allowed, otherwise the reason it isn't, in plain words."""
    try:
        files = combine(bugs)
    except ValueError as exc:
        return str(exc)
    for rel, content in files.items():
        try:
            ast.parse(content)
        except SyntaxError:
            return f"together these bugs leave {rel} unable to load"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        tree = build_scenario_tree(bugs, tmp / "verify", include_hidden=True)
        results = outcomes(tree)
        if any("ERROR" in r for r in results.values()):
            return "together these bugs stop the service from loading"
        for (case, _), name in zip(bugs, REPRO_NAMES):
            if "FAILED" not in results.get(f"tests/{name}", set()):
                return f"with these bugs together, the incident for \"{safeguard(case)}\" no longer shows"
        for case, _ in bugs:
            hidden = [f"tests/{t.name}" for t in case.hidden_tests]
            if not any("FAILED" in results.get(h, set()) for h in hidden):
                return f"with these bugs together, the held-out tests can't see the bug in \"{safeguard(case)}\""
        if any(case.meta.get("replay") for case, _ in bugs):
            r = replay(tree)
            if r["attacks_succeeded"] != r["attacks_total"] or r["legit_blocked"]:
                return "with these bugs together, the transfer replay no longer matches the incident"

        agent = build_scenario_tree(bugs, tmp / "agent", include_hidden=False)
        for case, _ in bugs:
            if find_leaks(case, agent):
                return f"the upload would leak {case.id}"
        secrets = [t for case, _ in bugs for t in (case.default_label, *(v.label for v in case.variants), *(v.root_cause for v in case.variants))]
        for path in agent.rglob("*"):
            if path.is_file() and path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
                if any(s and s in path.read_text() for s in secrets):
                    return f"the upload would contain case metadata in {path.relative_to(agent)}"
    return None


def candidates(size: int) -> list[list[Bug]]:
    bugs = [(case, option["id"]) for case in list_cases() for option in case.options()]
    return [list(combo) for combo in combinations(bugs, size) if len({c.id for c, _ in combo}) == size]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    allowed: list[tuple[str, ...]] = []
    refused: dict[tuple[str, ...], str] = {}
    checked: dict[str, int] = {}
    for size in range(2, MAX_BUGS + 1):
        scenarios = candidates(size)
        checked[str(size)] = len(scenarios)
        todo = []
        for bugs in scenarios:
            key = scenario_key(bugs)
            inherited = next((refused[sub] for sub in combinations(key, size - 1) if sub in refused), None) if size > 2 else None
            if inherited:
                refused[key] = inherited
            else:
                todo.append((key, bugs))
        print(f"size {size}: {len(scenarios)} scenarios, {len(todo)} to run", flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            verdicts = list(pool.map(lambda item: check(item[1]), todo))
        for (key, _), reason in zip(todo, verdicts):
            if reason is None:
                allowed.append(key)
            else:
                refused[key] = reason
        print(f"size {size}: allowed {sum(1 for k in allowed if len(k) == size)}", flush=True)

    SCENARIOS_FILE.write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "checked": checked,
                "allowed": [list(k) for k in sorted(allowed)],
                "refused": {"|".join(k): v for k, v in sorted(refused.items())},
            },
            indent=0,
        )
        + "\n"
    )
    kinds: dict[str, int] = {}
    for reason in refused.values():
        kind = re.sub(r"\"[^\"]*\"|bank_service/\S+", "*", reason)
        kinds[kind] = kinds.get(kind, 0) + 1
    print(f"allowed {len(allowed)}, refused {len(refused)} -> {SCENARIOS_FILE}")
    for kind, n in sorted(kinds.items(), key=lambda kv: -kv[1]):
        print(f"  refused {n:5d}: {kind}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
