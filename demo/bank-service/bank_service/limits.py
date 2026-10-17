from .errors import TransferLimitError

MAX_TRANSFER_DOLLARS = 5_000


def check_transfer_limit(amount_cents: int) -> None:
    if amount_cents > MAX_TRANSFER_DOLLARS * 100:
        raise TransferLimitError(f"transfers are limited to ${MAX_TRANSFER_DOLLARS:,} each")
