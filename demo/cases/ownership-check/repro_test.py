LENA = "cust_005"
LENA_CHECKING = "acct_6630"
MAYA_CHECKING = "acct_8214"


def test_customer_cannot_transfer_from_account_they_do_not_own(ledger, post_transfer):
    victim_before = ledger.get_account(MAYA_CHECKING).balance_cents

    response = post_transfer(LENA, MAYA_CHECKING, LENA_CHECKING, 47_000)

    assert response.status_code == 403
    assert response.json()["error"] == "permission_denied"
    assert ledger.get_account(MAYA_CHECKING).balance_cents == victim_before
