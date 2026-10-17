LENA = "cust_005"
LENA_CHECKING = "acct_6630"
MAYA_CHECKING = "acct_8214"


def test_negative_transfer_is_rejected_and_balances_are_unchanged(post_transfer, balances):
    before = balances()

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, -50_000)

    assert response.status_code == 422
    assert response.json()["error"] == "invalid_amount"
    assert balances() == before
