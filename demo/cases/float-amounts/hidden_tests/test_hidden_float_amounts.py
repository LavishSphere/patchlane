import pytest

MAYA = "cust_001"
DANIEL = "cust_002"
MAYA_CHECKING = "acct_8214"
DANIEL_CHECKING = "acct_3390"
LENA_CHECKING = "acct_6630"


@pytest.mark.parametrize("amount", [0.5, 99.99, 12_450.25, 250_000.75])
def test_any_fractional_amount_is_rejected(post_transfer, balances, ledger, amount):
    before = balances()

    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, amount)

    assert response.status_code == 422
    assert balances() == before
    assert ledger.transfers == []


def test_balances_stay_whole_cents_after_transfers(post_transfer, ledger):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_345)
    post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 501)

    for account in ledger.accounts.values():
        assert type(account.balance_cents) is int
    for record in ledger.transfers:
        assert type(record.amount_cents) is int
        assert type(record.fee_cents) is int


def test_response_amounts_are_integers(post_transfer):
    body = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500).json()

    assert type(body["amount_cents"]) is int
    assert type(body["fee_cents"]) is int


def test_whole_cent_transfers_still_work(post_transfer, ledger):
    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 1)

    assert response.status_code == 201
    assert len(ledger.transfers) == 1
