import pytest

ATTACKER = "cust_005"
ATTACKER_ACCOUNT = "acct_6630"
OTHER_ACCOUNTS = ["acct_8214", "acct_8215", "acct_3390", "acct_5521", "acct_7712"]


@pytest.mark.parametrize("victim_account", OTHER_ACCOUNTS)
def test_non_owner_is_rejected_for_every_account(ledger, post_transfer, balances, victim_account):
    before = balances()

    response = post_transfer(ATTACKER, victim_account, ATTACKER_ACCOUNT, 10_000)

    assert response.status_code == 403
    assert balances() == before
    assert ledger.transfers == []


def test_non_owner_is_rejected_when_paying_a_third_party(post_transfer, balances):
    before = balances()

    response = post_transfer("cust_002", "acct_8214", "acct_7712", 5_000)

    assert response.status_code == 403
    assert balances() == before


def test_non_owner_is_rejected_on_retry_with_same_idempotency_key(ledger, post_transfer):
    first = post_transfer(ATTACKER, "acct_5521", ATTACKER_ACCOUNT, 20_000, idempotency_key="k-1")
    second = post_transfer(ATTACKER, "acct_5521", ATTACKER_ACCOUNT, 20_000, idempotency_key="k-1")

    assert first.status_code == second.status_code == 403
    assert ledger.transfers == []


def test_owner_can_still_transfer_their_own_funds(ledger, post_transfer):
    response = post_transfer("cust_002", "acct_3390", ATTACKER_ACCOUNT, 15_000)

    assert response.status_code == 201
    assert len(ledger.transfers) == 1


def test_customer_can_move_money_between_their_own_accounts(post_transfer):
    response = post_transfer("cust_001", "acct_8214", "acct_8215", 30_000)

    assert response.status_code == 201


def test_owner_retry_with_same_key_still_returns_original_transfer(ledger, post_transfer):
    first = post_transfer("cust_003", "acct_5521", "acct_7712", 12_000, idempotency_key="pay-rent")
    second = post_transfer("cust_003", "acct_5521", "acct_7712", 12_000, idempotency_key="pay-rent")

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert len(ledger.transfers) == 1
