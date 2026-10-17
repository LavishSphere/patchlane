LENA = "cust_005"
MAYA_CHECKING = "acct_8214"


def test_customer_cannot_view_another_customers_transfer_history(client):
    response = client.get(f"/api/accounts/{MAYA_CHECKING}/transfers", headers={"X-Customer-Id": LENA})

    assert response.status_code == 403
    assert response.json()["error"] == "permission_denied"
