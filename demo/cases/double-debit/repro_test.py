from bank_service.fees import transfer_fee_cents

PRIYA = "cust_003"
PRIYA_CHECKING = "acct_5521"
TOM_CHECKING = "acct_7712"


def test_retrying_with_the_same_idempotency_key_charges_once(ledger, post_transfer):
    before = ledger.get_account(PRIYA_CHECKING).balance_cents

    first = post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 120_000, idempotency_key="pay-rent-oct")
    retry = post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 120_000, idempotency_key="pay-rent-oct")

    assert first.status_code == retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]
    assert ledger.get_account(PRIYA_CHECKING).balance_cents == before - 120_000 - transfer_fee_cents(120_000)
