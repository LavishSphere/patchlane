import pytest

from bank_service.fees import transfer_fee_cents

MAYA = "cust_001"
MAYA_CHECKING = "acct_8214"
DANIEL_CHECKING = "acct_3390"


@pytest.mark.parametrize("amount", [1, 499, 500, 1_500, 4_500, 12_345, 100_000, 125_000, 499_999])
def test_quote_uses_the_fee_schedule(client, amount):
    body = client.get("/api/fees/quote", params={"amount_cents": amount}).json()

    assert body["fee_cents"] == transfer_fee_cents(amount)
    assert body["total_cents"] == amount + transfer_fee_cents(amount)


def test_quote_matches_a_real_transfer_at_half_a_cent(client, post_transfer, ledger):
    quote = client.get("/api/fees/quote", params={"amount_cents": 500}).json()
    before = ledger.get_account(MAYA_CHECKING).balance_cents

    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 500)

    assert before - ledger.get_account(MAYA_CHECKING).balance_cents == quote["total_cents"]


def test_quote_fee_is_an_integer(client):
    body = client.get("/api/fees/quote", params={"amount_cents": 2_500}).json()

    assert type(body["fee_cents"]) is int


@pytest.mark.parametrize("amount", [0, -100, 500_001])
def test_quote_still_rejects_invalid_amounts(client, amount):
    assert client.get("/api/fees/quote", params={"amount_cents": amount}).status_code == 422
