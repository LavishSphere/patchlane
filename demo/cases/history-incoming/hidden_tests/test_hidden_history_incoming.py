from bank_service.fees import transfer_fee_cents
from bank_service.history import account_history

MAYA = "cust_001"
DANIEL = "cust_002"
PRIYA = "cust_003"
MAYA_CHECKING = "acct_8214"
MAYA_SAVINGS = "acct_8215"
DANIEL_CHECKING = "acct_3390"
PRIYA_CHECKING = "acct_5521"
TOM_CHECKING = "acct_7712"


def history(client, customer, account):
    return client.get(f"/api/accounts/{account}/transfers", headers={"X-Customer-Id": customer}).json()["transfers"]


def test_incoming_entry_names_the_sender_and_has_no_fee(client, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    [entry] = history(client, DANIEL, DANIEL_CHECKING)

    assert entry["direction"] == "in"
    assert entry["counterparty"] == MAYA_CHECKING
    assert entry["amount_cents"] == 12_500
    assert entry["fee_cents"] == 0


def test_history_mixes_incoming_and_outgoing_newest_first(client, post_transfer):
    first = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500).json()
    second = post_transfer(DANIEL, DANIEL_CHECKING, PRIYA_CHECKING, 4_000).json()
    third = post_transfer(PRIYA, PRIYA_CHECKING, DANIEL_CHECKING, 900).json()

    entries = history(client, DANIEL, DANIEL_CHECKING)

    assert [e["id"] for e in entries] == [third["id"], second["id"], first["id"]]
    assert [e["direction"] for e in entries] == ["in", "out", "in"]
    assert entries[1]["fee_cents"] == transfer_fee_cents(4_000)


def test_outgoing_transfers_are_still_listed(client, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    [entry] = history(client, MAYA, MAYA_CHECKING)

    assert entry["direction"] == "out"
    assert entry["fee_cents"] == transfer_fee_cents(12_500)


def test_history_leaves_out_transfers_between_other_accounts(client, post_transfer):
    post_transfer(PRIYA, PRIYA_CHECKING, TOM_CHECKING, 3_000)
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    assert history(client, MAYA, MAYA_SAVINGS) == []
    assert len(history(client, DANIEL, DANIEL_CHECKING)) == 1


def test_service_function_returns_incoming_entries(ledger, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    assert [e["direction"] for e in account_history(ledger, DANIEL_CHECKING)] == ["in"]
