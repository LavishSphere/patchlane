import pytest

from bank_service.errors import InvalidAmountError
from bank_service.transfers import transfer


@pytest.mark.parametrize("amount", [-1, -99, -499_999, -500_000_000])
def test_any_negative_amount_is_rejected_by_the_api(post_transfer, balances, ledger, amount):
    before = balances()

    response = post_transfer("cust_002", "acct_3390", "acct_7712", amount)

    assert response.status_code == 422
    assert balances() == before
    assert ledger.transfers == []


def test_negative_amount_is_rejected_by_the_service_function(ledger):
    with pytest.raises(InvalidAmountError):
        transfer(ledger, "cust_001", "acct_8214", "acct_3390", -2_500)


def test_zero_is_still_rejected(post_transfer):
    assert post_transfer("cust_001", "acct_8214", "acct_3390", 0).status_code == 422


def test_small_positive_transfers_still_work(post_transfer, ledger):
    response = post_transfer("cust_001", "acct_8214", "acct_3390", 1)

    assert response.status_code == 201
    assert len(ledger.transfers) == 1
