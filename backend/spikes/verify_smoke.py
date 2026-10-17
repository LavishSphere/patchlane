"""Verification smoke test with hand-written patches, using real Daytona sandboxes.

Tests the verification sandbox and path guard on their own, without Droid.
These patches are a test harness; the product only ever verifies Droid's own patch.

  correct    adds the ownership check            -> expect safe_to_review
  lazy       blocks every transfer               -> expect failed (legit blocked, hidden tests fail)
  tampered   correct fix + edits a regression test -> expect failed (tampering)

Usage (from the repo root): .venv/bin/python backend/spikes/verify_smoke.py
"""

import asyncio
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.integrations.daytona import create_sandbox  # noqa: E402
from app.orchestration.verification import extract_changes, verify  # noqa: E402
from casekit import SERVICE_DIR, agent_tree, load_case, verification_tree  # noqa: E402

CLEAN = (SERVICE_DIR / "bank_service" / "transfers.py").read_text()
LAZY = CLEAN.replace(
    "    fee_cents = transfer_fee_cents(amount_cents)",
    '    raise InvalidTransferError("transfers are temporarily disabled")\n    fee_cents = transfer_fee_cents(amount_cents)',
    1,
)


async def scenario(name: str, edits: dict[str, str], expect: str) -> bool:
    case = load_case("ownership-check")
    hidden = [f"tests/{t.name}" for t in case.hidden_tests]
    start = time.perf_counter()
    agent = verifier = None
    with tempfile.TemporaryDirectory() as tmp:
        try:
            agent, verifier = await asyncio.gather(create_sandbox("agent"), create_sandbox("verification"))
            await agent.upload_tree(agent_tree(case, Path(tmp) / "agent"))
            await agent.git_baseline()
            for path, content in edits.items():
                await agent.write_text(path, content)
            changes = await extract_changes(agent)
            result = await verify(verifier, verification_tree(case, Path(tmp) / "verify"), changes, hidden, replay=True)
        finally:
            await asyncio.gather(*(s.delete() for s in (agent, verifier) if s is not None))
    ok = result.verdict == expect
    after = result.after
    print(f"\n[{'PASS' if ok else 'FAIL'}] {name}: verdict={result.verdict} (expected {expect})  {time.perf_counter() - start:.1f}s")
    if after:
        print(f"    repro passed={after.repro_passed}  suite {after.suite_passed}/{after.suite_total}  hidden {result.hidden_passed}/{result.hidden_total}  replay {after.replay.model_dump() if after.replay else None}")
    print(f"    tampering={result.tampering} rejected={result.rejected_paths}")
    for reason in result.reasons:
        print(f"    - {reason}")
    return ok


async def main() -> None:
    tests_path = "tests/test_transfers.py"
    tampered_tests = (SERVICE_DIR / tests_path).read_text().replace("== 403", "in (403, 201)")
    results = await asyncio.gather(
        scenario("correct", {"bank_service/transfers.py": CLEAN}, "safe_to_review"),
        scenario("lazy", {"bank_service/transfers.py": LAZY}, "failed"),
        scenario("tampered", {"bank_service/transfers.py": CLEAN, tests_path: tampered_tests}, "failed"),
    )
    print("\nAll scenarios behaved as expected." if all(results) else "\nSOME SCENARIOS FAILED")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
