"""Generate the deterministic transaction log for the ownership-check incident.

Writes demo/bank-service/data/incident_log.jsonl: legitimate transfers plus a
burst of transfers where the requester does not own the source account. Every
legitimate transfer stays affordable whether or not the unauthorized transfers
succeed, so replay results only change because of the code under test.

Usage: python demo/generate_incident_log.py --seed 1042
"""

import argparse
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent / "bank-service"
sys.path.insert(0, str(SERVICE_DIR))

from bank_service.fees import transfer_fee_cents  # noqa: E402

SEED_PATH = SERVICE_DIR / "data" / "seed_accounts.json"
LOG_PATH = SERVICE_DIR / "data" / "incident_log.jsonl"

LEGIT_COUNT = 200
ATTACK_COUNT = 14
LEGIT_BEFORE_ATTACKS = 130
ATTACKER = "cust_005"
ATTACKER_ACCOUNT = "acct_6630"
VICTIM_ACCOUNTS = ["acct_8214", "acct_3390", "acct_5521"]
START = datetime(2026, 10, 17, 1, 30, tzinfo=timezone.utc)


def legit_entry(rng: random.Random, accounts: dict[str, str]) -> dict:
    from_account = rng.choice(sorted(accounts))
    to_account = rng.choice([a for a in sorted(accounts) if a != from_account])
    amount = rng.randint(5, 400) * 100 + rng.choice([0, 0, 25, 50, 99])
    return {
        "requester_id": accounts[from_account],
        "from_account": from_account,
        "to_account": to_account,
        "amount_cents": amount,
    }


def attack_entries(rng: random.Random) -> list[dict]:
    victims = [VICTIM_ACCOUNTS[i % len(VICTIM_ACCOUNTS)] for i in range(ATTACK_COUNT)]
    rng.shuffle(victims)
    return [
        {
            "requester_id": ATTACKER,
            "from_account": victim,
            "to_account": ATTACKER_ACCOUNT,
            "amount_cents": rng.randint(350, 900) * 100,
        }
        for victim in victims
    ]


def check_affordable(entries: list[dict], balances: dict[str, int], owners: dict[str, str], attacks_succeed: bool) -> None:
    balances = dict(balances)
    for entry in entries:
        is_attack = owners[entry["from_account"]] != entry["requester_id"]
        if is_attack and not attacks_succeed:
            continue
        cost = entry["amount_cents"] + transfer_fee_cents(entry["amount_cents"])
        if balances[entry["from_account"]] < cost:
            scenario = "succeed" if attacks_succeed else "fail"
            sys.exit(f"seq {entry['seq']} is unaffordable when attacks {scenario}; adjust amounts or seed")
        balances[entry["from_account"]] -= cost
        balances[entry["to_account"]] += entry["amount_cents"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=1042)
    args = parser.parse_args()

    seed_data = json.loads(SEED_PATH.read_text())
    owners = {a["id"]: a["owner_id"] for a in seed_data["accounts"]}
    opening = {a["id"]: a["balance_cents"] for a in seed_data["accounts"]}
    rng = random.Random(args.seed)

    legit = [legit_entry(rng, owners) for _ in range(LEGIT_COUNT)]
    tail = legit[LEGIT_BEFORE_ATTACKS:] + attack_entries(rng)
    rng.shuffle(tail)
    entries = legit[:LEGIT_BEFORE_ATTACKS] + tail

    ts = START
    for seq, entry in enumerate(entries, start=1):
        ts += timedelta(seconds=rng.randint(6, 45))
        entry["seq"] = seq
        entry["ts"] = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
        entry["idempotency_key"] = f"txn-{seq:04d}"

    check_affordable(entries, opening, owners, attacks_succeed=True)
    check_affordable(entries, opening, owners, attacks_succeed=False)

    fields = ["seq", "ts", "requester_id", "from_account", "to_account", "amount_cents", "idempotency_key"]
    LOG_PATH.write_text("".join(json.dumps({k: e[k] for k in fields}) + "\n" for e in entries))

    attacks = [e for e in entries if owners[e["from_account"]] != e["requester_id"]]
    moved = sum(e["amount_cents"] for e in attacks)
    victims = sorted({owners[e["from_account"]] for e in attacks})
    print(f"wrote {len(entries)} transfers to {LOG_PATH.relative_to(SERVICE_DIR.parent.parent)}")
    print(f"unauthorized: {len(attacks)} transfers, ${moved / 100:,.2f} moved, victims {', '.join(victims)}")
    print(f"first unauthorized transfer at {attacks[0]['ts']} (seq {attacks[0]['seq']})")


if __name__ == "__main__":
    main()
