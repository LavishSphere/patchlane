from bank_service.fees import transfer_fee_cents


def test_fees_follow_the_schedule_rounding_half_up():
    assert transfer_fee_cents(1_550) == 2
    assert transfer_fee_cents(1_234_567) == 1_235
