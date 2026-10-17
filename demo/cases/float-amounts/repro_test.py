DANIEL = "cust_002"
DANIEL_CHECKING = "acct_3390"
LENA_CHECKING = "acct_6630"


def test_fractional_cent_amount_is_rejected(post_transfer, balances, ledger):
    before = balances()

    response = post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 12_450.5)

    assert response.status_code == 422
    assert balances() == before
    assert ledger.transfers == []
