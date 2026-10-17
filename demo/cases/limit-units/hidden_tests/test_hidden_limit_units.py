import pytest

from bank_service.errors import TransferLimitError
from bank_service.limits import check_transfer_limit


@pytest.mark.parametrize("amount", [500_001, 600_000, 2_000_000, 49_999_900])
def test_amounts_over_the_limit_are_rejected(post_transfer, ledger, amount):
    response = post_transfer("cust_001", "acct_8215", "acct_3390", amount)

    assert response.status_code == 422
    assert response.json()["error"] == "transfer_limit_exceeded"
    assert ledger.transfers == []


def test_limit_check_raises_one_cent_over():
    with pytest.raises(TransferLimitError):
        check_transfer_limit(500_001)


@pytest.mark.parametrize("amount", [500_000, 499_999, 100])
def test_amounts_at_or_under_the_limit_still_work(post_transfer, amount):
    assert post_transfer("cust_001", "acct_8215", "acct_3390", amount).status_code == 201
