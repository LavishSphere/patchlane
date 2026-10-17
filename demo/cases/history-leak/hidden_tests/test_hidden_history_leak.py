import pytest

MAYA = "cust_001"
DANIEL = "cust_002"
PRIYA = "cust_003"
TOM = "cust_004"
LENA = "cust_005"
MAYA_CHECKING = "acct_8214"
MAYA_SAVINGS = "acct_8215"
DANIEL_CHECKING = "acct_3390"
PRIYA_CHECKING = "acct_5521"
TOM_CHECKING = "acct_7712"


@pytest.mark.parametrize(
    "requester, account",
    [(LENA, PRIYA_CHECKING), (TOM, DANIEL_CHECKING), (DANIEL, MAYA_SAVINGS), (PRIYA, TOM_CHECKING)],
)
def test_history_of_an_account_you_do_not_own_is_forbidden(client, requester, account):
    response = client.get(f"/api/accounts/{account}/transfers", headers={"X-Customer-Id": requester})

    assert response.status_code == 403
    assert "transfers" not in response.json()


def test_forbidden_response_reveals_no_transfer_details(client, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    response = client.get(f"/api/accounts/{MAYA_CHECKING}/transfers", headers={"X-Customer-Id": LENA})

    assert response.status_code == 403
    assert "12500" not in response.text
    assert DANIEL_CHECKING not in response.text


def test_owner_still_sees_their_own_history(client, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    for account in (MAYA_CHECKING, MAYA_SAVINGS):
        response = client.get(f"/api/accounts/{account}/transfers", headers={"X-Customer-Id": MAYA})
        assert response.status_code == 200

    checking = client.get(f"/api/accounts/{MAYA_CHECKING}/transfers", headers={"X-Customer-Id": MAYA}).json()
    assert len(checking["transfers"]) == 1


def test_history_still_requires_authentication(client):
    assert client.get(f"/api/accounts/{MAYA_CHECKING}/transfers").status_code == 401
