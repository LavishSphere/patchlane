MAYA = "cust_001"
MAYA_SAVINGS = "acct_8215"
TOM_CHECKING = "acct_7712"


def test_transfer_above_the_five_thousand_dollar_limit_is_rejected(ledger, post_transfer):
    savings_before = ledger.get_account(MAYA_SAVINGS).balance_cents

    response = post_transfer(MAYA, MAYA_SAVINGS, TOM_CHECKING, 4_800_000)

    assert response.status_code == 422
    assert response.json()["error"] == "transfer_limit_exceeded"
    assert ledger.get_account(MAYA_SAVINGS).balance_cents == savings_before
