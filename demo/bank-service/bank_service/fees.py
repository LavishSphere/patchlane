FEE_BASIS_POINTS = 10  # 0.10% of the transferred amount


def transfer_fee_cents(amount_cents: int) -> int:
    """Fee in whole cents, rounded half up."""
    return (amount_cents * FEE_BASIS_POINTS + 5_000) // 10_000
