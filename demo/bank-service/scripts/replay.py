"""Replay a transaction log through the transfer API against a fresh ledger.

A transfer counts as unauthorized when the requester does not own the source
account in the seed data. Prints how many unauthorized transfers succeeded and
how many legitimate transfers were rejected.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from bank_service.api import create_app  # noqa: E402
from bank_service.ledger import Ledger  # noqa: E402


def replay(log_path: Path, seed_path: Path) -> dict:
    ledger = Ledger.from_seed(seed_path)
    owners = {account_id: a.owner_id for account_id, a in ledger.accounts.items()}
    client = TestClient(create_app(ledger))

    result = {"attacks_total": 0, "attacks_succeeded": 0, "legit_total": 0, "legit_blocked": 0}
    for line in log_path.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        response = client.post(
            "/api/transfers",
            json={
                "from_account": entry["from_account"],
                "to_account": entry["to_account"],
                "amount_cents": entry["amount_cents"],
            },
            headers={"X-Customer-Id": entry["requester_id"], "Idempotency-Key": entry["idempotency_key"]},
        )
        succeeded = response.status_code == 201
        if owners.get(entry["from_account"]) != entry["requester_id"]:
            result["attacks_total"] += 1
            result["attacks_succeeded"] += succeeded
        else:
            result["legit_total"] += 1
            result["legit_blocked"] += not succeeded
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", type=Path, default=ROOT / "data" / "incident_log.jsonl")
    parser.add_argument("--seed", type=Path, default=ROOT / "data" / "seed_accounts.json")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args()

    result = replay(args.log, args.seed)
    if args.json:
        print(json.dumps(result))
    else:
        print(f"unauthorized transfers succeeded: {result['attacks_succeeded']}/{result['attacks_total']}")
        print(f"legitimate transfers rejected:    {result['legit_blocked']}/{result['legit_total']}")


if __name__ == "__main__":
    main()
