from .errors import InsufficientFundsError, InvalidAmountError, InvalidTransferError
from .fees import transfer_fee_cents
from .ledger import Ledger, Transfer
from .limits import check_transfer_limit


def transfer(
    ledger: Ledger,
    requester_id: str,
    from_account: str,
    to_account: str,
    amount_cents: int,
    idempotency_key: str | None = None,
) -> Transfer:
    """Move money between two accounts on behalf of an authenticated customer.

    A repeated idempotency key from the same requester returns the original
    transfer instead of moving money again.
    """
    if idempotency_key is not None:
        previous = ledger.find_transfer(requester_id, idempotency_key)
        if previous is not None:
            return previous

    if amount_cents <= 0:
        raise InvalidAmountError("amount must be positive")
    check_transfer_limit(amount_cents)

    source = ledger.get_account(from_account)
    destination = ledger.get_account(to_account)
    if source.id == destination.id:
        raise InvalidTransferError("source and destination accounts must differ")
    ledger.require_owner(source, requester_id)

    fee_cents = transfer_fee_cents(amount_cents)
    if source.balance_cents < amount_cents + fee_cents:
        raise InsufficientFundsError("insufficient funds")

    source.balance_cents -= amount_cents + fee_cents
    destination.balance_cents += amount_cents
    ledger.fees_collected_cents += fee_cents
    return ledger.record_transfer(
        requester_id, source.id, destination.id, amount_cents, fee_cents, idempotency_key
    )
