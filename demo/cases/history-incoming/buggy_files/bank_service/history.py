from .ledger import Ledger


def account_history(ledger: Ledger, account_id: str) -> list[dict]:
    """Transfers into and out of one account, newest first. Fees apply to the sender only."""
    entries = []
    for record in reversed(ledger.transfers):
        if record.from_account != account_id:
            continue
        outgoing = record.from_account == account_id
        entries.append(
            {
                "id": record.id,
                "direction": "out" if outgoing else "in",
                "counterparty": record.to_account if outgoing else record.from_account,
                "amount_cents": record.amount_cents,
                "fee_cents": record.fee_cents if outgoing else 0,
            }
        )
    return entries
