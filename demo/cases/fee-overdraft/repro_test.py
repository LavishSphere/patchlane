LENA = "cust_005"
LENA_CHECKING = "acct_6630"
MAYA_CHECKING = "acct_8214"


def test_transfer_cannot_overdraw_the_account_by_the_fee(ledger, post_transfer):
    ledger.get_account(LENA_CHECKING).balance_cents = 40_000

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 40_000)

    assert response.status_code == 422
    assert response.json()["error"] == "insufficient_funds"
    assert ledger.get_account(LENA_CHECKING).balance_cents == 40_000
