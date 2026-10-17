from bank_service.fees import transfer_fee_cents
from bank_service.transfers import transfer

MAYA = "cust_001"
DANIEL = "cust_002"
PRIYA = "cust_003"
LENA = "cust_005"
MAYA_CHECKING = "acct_8214"
DANIEL_CHECKING = "acct_3390"
PRIYA_CHECKING = "acct_5521"
TOM_CHECKING = "acct_7712"
LENA_CHECKING = "acct_6630"


def test_service_keeps_keys_from_different_requesters_apart(ledger):
    first = transfer(ledger, PRIYA, PRIYA_CHECKING, TOM_CHECKING, 45_000, "shared-key")
    second = transfer(ledger, LENA, LENA_CHECKING, MAYA_CHECKING, 2_000, "shared-key")

    assert second is not first
    assert second.requester_id == LENA
    assert len(ledger.transfers) == 2


def test_response_never_describes_another_customers_transfer(post_transfer):
    post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 45_000, idempotency_key="txn-0001")

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 3_000, idempotency_key="txn-0001")

    assert response.status_code == 201
    body = response.json()
    assert body["from_account"] == LENA_CHECKING
    assert body["to_account"] == MAYA_CHECKING
    assert body["amount_cents"] == 3_000


def test_three_customers_sharing_a_key_all_move_money(ledger, post_transfer, balances):
    before = balances()

    post_transfer(MAYA, MAYA_CHECKING, TOM_CHECKING, 1_000, idempotency_key="txn-0002")
    post_transfer(DANIEL, DANIEL_CHECKING, TOM_CHECKING, 2_000, idempotency_key="txn-0002")
    post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 3_000, idempotency_key="txn-0002")

    after = balances()
    assert after[TOM_CHECKING] == before[TOM_CHECKING] + 6_000
    assert after[DANIEL_CHECKING] == before[DANIEL_CHECKING] - 2_000 - transfer_fee_cents(2_000)
    assert len(ledger.transfers) == 3


def test_a_retry_from_the_same_customer_still_moves_money_once(ledger, post_transfer):
    before = ledger.get_account(DANIEL_CHECKING).balance_cents

    first = post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 8_000, idempotency_key="txn-0009")
    retry = post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 8_000, idempotency_key="txn-0009")

    assert retry.json()["id"] == first.json()["id"]
    assert ledger.get_account(DANIEL_CHECKING).balance_cents == before - 8_000 - transfer_fee_cents(8_000)
    assert len(ledger.transfers) == 1
