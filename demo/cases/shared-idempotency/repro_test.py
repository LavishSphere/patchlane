from bank_service.fees import transfer_fee_cents

DANIEL = "cust_002"
PRIYA = "cust_003"
DANIEL_CHECKING = "acct_3390"
PRIYA_CHECKING = "acct_5521"
TOM_CHECKING = "acct_7712"
LENA_CHECKING = "acct_6630"


def test_two_customers_using_the_same_idempotency_key_each_get_their_own_transfer(ledger, post_transfer):
    daniel_before = ledger.get_account(DANIEL_CHECKING).balance_cents

    first = post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 45_000, idempotency_key="txn-0007")
    second = post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 8_000, idempotency_key="txn-0007")

    assert first.status_code == second.status_code == 201
    assert second.json()["from_account"] == DANIEL_CHECKING
    assert second.json()["id"] != first.json()["id"]
    assert ledger.get_account(DANIEL_CHECKING).balance_cents == daniel_before - 8_000 - transfer_fee_cents(8_000)
