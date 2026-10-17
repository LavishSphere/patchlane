MAYA = "cust_001"
DANIEL = "cust_002"
MAYA_CHECKING = "acct_8214"
DANIEL_CHECKING = "acct_3390"


def test_account_history_includes_incoming_transfers(client, post_transfer):
    sent = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500).json()

    history = client.get(f"/api/accounts/{DANIEL_CHECKING}/transfers", headers={"X-Customer-Id": DANIEL}).json()

    assert [entry["id"] for entry in history["transfers"]] == [sent["id"]]
    assert history["transfers"][0]["direction"] == "in"
