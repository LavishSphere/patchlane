"""Fraud rule FR-12: transfers that debit an account the requester does not own.

Reads the incident transaction log as data and never executes service code.
"""

import json
from dataclasses import dataclass
from pathlib import Path

from .. import config  # noqa: F401  (puts demo/ on sys.path for casekit)
from ..models.incident import AffectedCustomer, IncidentImpact

from casekit import SERVICE_DIR, Case  # noqa: E402

DATA_DIR = SERVICE_DIR / "data"


@dataclass(frozen=True)
class Detection:
    impact: IncidentImpact
    alert: str
    unauthorized: list[dict]


def masked(account_id: str) -> str:
    return f"•••• {account_id.rsplit('_', 1)[-1]}"


def dollars(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def detect(case: Case, data_dir: Path = DATA_DIR) -> Detection:
    if not case.meta.get("replay"):
        return Detection(IncidentImpact(), case.meta.get("alert", case.meta["symptom"]), [])

    seed = json.loads((data_dir / "seed_accounts.json").read_text())
    names = {c["id"]: c["name"] for c in seed["customers"]}
    owners = {a["id"]: a["owner_id"] for a in seed["accounts"]}
    entries = [json.loads(line) for line in (data_dir / "incident_log.jsonl").read_text().splitlines() if line.strip()]

    unauthorized = [e for e in entries if owners.get(e["from_account"]) != e["requester_id"]]
    by_victim: dict[str, AffectedCustomer] = {}
    for entry in unauthorized:
        owner = owners[entry["from_account"]]
        victim = by_victim.setdefault(
            owner,
            AffectedCustomer(
                customer_id=owner,
                display_name=names[owner],
                masked_account=masked(entry["from_account"]),
                amount_moved_cents=0,
            ),
        )
        victim.amount_moved_cents += entry["amount_cents"]

    moved = sum(e["amount_cents"] for e in unauthorized)
    first_seen = unauthorized[0]["ts"] if unauthorized else None
    impact = IncidentImpact(
        unauthorized_transfers=len(unauthorized),
        amount_moved_cents=moved,
        affected_customers=sorted(by_victim.values(), key=lambda c: -c.amount_moved_cents),
        legit_transfers_in_window=len(entries) - len(unauthorized),
        first_seen=first_seen,
    )
    alert = case.meta["alert"].format(
        unauthorized_transfers=len(unauthorized),
        first_seen=first_seen or "n/a",
        amount_moved=dollars(moved),
    )
    return Detection(impact, alert, unauthorized)
