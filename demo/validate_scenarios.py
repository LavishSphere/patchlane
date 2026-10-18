"""Decide which two bugs can be combined in one incident, and write demo/cases/pairs.json.

A pair (two different cases, any variant of each) is allowed only when:
  - git merge-file combines both bugs with no conflict and every changed file parses
  - with both bugs in place, each case's incident test fails, and at least one
    held-out test of each case fails, so verification can see both bugs
  - a case with a transfer replay still lets every attack through and blocks no
    legitimate transfer
  - nothing about either bug (labels, root causes, hidden tests, ground truth)
    is in the tree uploaded to the agent sandbox

The clean service passing every test is checked per case by validate_cases.py.

Usage: python demo/validate_pairs.py [--workers 8]
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
    PAIRS_FILE,
    REPRO_NAMES,
    Bug,
    bug_key,
    build_pair_tree,
    combine,
    find_leaks,
    list_cases,
    pair_key,
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


def check(first: Bug, second: Bug) -> str | None:
    """None when the pair is allowed, otherwise the reason it isn't."""
    try:
        files = combine([first, second])
    except ValueError as exc:
        return str(exc)
    for rel, content in files.items():
        try:
            ast.parse(content)
        except SyntaxError:
            return f"merged {rel} does not parse"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        tree = build_pair_tree(first, second, tmp / "verify", include_hidden=True)
        results = outcomes(tree)
        if any("ERROR" in r for r in results.values()):
            return "a test errors with both bugs in place"
        for name in REPRO_NAMES:
            if "FAILED" not in results.get(f"tests/{name}", set()):
                return f"{name} does not fail with both bugs in place"
        for case, _ in (first, second):
            hidden = [f"tests/{t.name}" for t in case.hidden_tests]
            if not any("FAILED" in results.get(h, set()) for h in hidden):
                return f"no held-out test of {case.id} fails with both bugs in place"
        if any(case.meta.get("replay") for case, _ in (first, second)):
            r = replay(tree)
            if r["attacks_succeeded"] != r["attacks_total"] or r["legit_blocked"]:
                return f"replay changes with both bugs in place: {r}"

        agent = build_pair_tree(first, second, tmp / "agent", include_hidden=False)
        for case, _ in (first, second):
            if find_leaks(case, agent):
                return f"agent tree leaks {case.id}"
        secrets = [t for case, _ in (first, second) for t in (case.default_label, *(v.label for v in case.variants), *(v.root_cause for v in case.variants))]
        for path in agent.rglob("*"):
            if path.is_file() and path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
                text = path.read_text()
                if any(s and s in text for s in secrets):
                    return f"agent tree contains case metadata in {path.relative_to(agent)}"
    return None


def candidates() -> list[tuple[Bug, Bug]]:
    bugs = [(case, option["id"]) for case in list_cases() for option in case.options()]
    return [(a, b) for a, b in combinations(bugs, 2) if a[0].id != b[0].id]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    pairs = candidates()
    print(f"checking {len(pairs)} pairs with {args.workers} workers", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        verdicts = list(pool.map(lambda p: check(*p), pairs))

    allowed = sorted(pair_key(a, b) for (a, b), reason in zip(pairs, verdicts) if reason is None)
    reasons: dict[str, int] = {}
    for reason in verdicts:
        if reason is not None:
            kind = re.sub(r"[a-z_]+\.py|\{.*\}|[a-z]+(-[a-z0-9]+)+", "*", reason)
            reasons[kind] = reasons.get(kind, 0) + 1
    PAIRS_FILE.write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "checked": len(pairs),
                "pairs": [list(p) for p in allowed],
            },
            indent=1,
        )
        + "\n"
    )
    print(f"allowed {len(allowed)} of {len(pairs)} -> {PAIRS_FILE}")
    for kind, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  rejected {n:4d}: {kind}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
