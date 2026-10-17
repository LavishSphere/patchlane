MAYA = "cust_001"
LENA = "cust_005"
MAYA_CHECKING = "acct_8214"
LENA_CHECKING = "acct_6630"


def test_declined_transfer_does_not_credit_the_recipient(ledger, post_transfer):
    ledger.get_account(LENA_CHECKING).balance_cents = 10_000
    recipient_before = ledger.get_account(MAYA_CHECKING).balance_cents

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 20_000)

    assert response.status_code == 422
    assert ledger.get_account(MAYA_CHECKING).balance_cents == recipient_before
