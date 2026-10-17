from .errors import TransferLimitError

MAX_TRANSFER_DOLLARS = 5_000
MAX_TRANSFER_CENTS = MAX_TRANSFER_DOLLARS * 100


def check_transfer_limit(amount_cents: int) -> None:
    if amount_cents // 100 > MAX_TRANSFER_CENTS:
        raise TransferLimitError(f"transfers are limited to ${MAX_TRANSFER_DOLLARS:,} each")
