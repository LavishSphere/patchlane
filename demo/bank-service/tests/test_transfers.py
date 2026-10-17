from bank_service.fees import transfer_fee_cents
from bank_service.limits import MAX_TRANSFER_DOLLARS

MAYA = "cust_001"
DANIEL = "cust_002"
LENA = "cust_005"
MAYA_CHECKING = "acct_8214"
MAYA_SAVINGS = "acct_8215"
DANIEL_CHECKING = "acct_3390"
LENA_CHECKING = "acct_6630"


def balance(ledger, account_id):
    return ledger.get_account(account_id).balance_cents


def test_owner_can_transfer_to_another_customer(ledger, post_transfer):
    source_before = balance(ledger, MAYA_CHECKING)
    destination_before = balance(ledger, DANIEL_CHECKING)

    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    assert response.status_code == 201
    fee = transfer_fee_cents(12_500)
    assert response.json()["fee_cents"] == fee
    assert balance(ledger, MAYA_CHECKING) == source_before - 12_500 - fee
    assert balance(ledger, DANIEL_CHECKING) == destination_before + 12_500


def test_fee_is_ten_basis_points():
    assert transfer_fee_cents(100_000) == 100


def test_fee_rounds_half_up_to_whole_cents():
    assert transfer_fee_cents(499) == 0
    assert transfer_fee_cents(500) == 1
    assert transfer_fee_cents(1_234_567) == 1_235


def test_money_is_conserved_across_transfers(ledger, post_transfer):
    total_before = ledger.total_cents()

    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_345)
    post_transfer(DANIEL, DANIEL_CHECKING, LENA_CHECKING, 99_999)
    post_transfer(LENA, LENA_CHECKING, MAYA_SAVINGS, 501)

    assert ledger.total_cents() == total_before


def test_insufficient_funds_rejected_and_balance_unchanged(ledger, post_transfer):
    ledger.get_account(LENA_CHECKING).balance_cents = 10_000

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 20_000)

    assert response.status_code == 422
    assert response.json()["error"] == "insufficient_funds"
    assert balance(ledger, LENA_CHECKING) == 10_000


def test_transfer_of_entire_balance_including_fee_succeeds(ledger, post_transfer):
    amount = 40_000
    ledger.get_account(LENA_CHECKING).balance_cents = amount + transfer_fee_cents(amount)

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, amount)

    assert response.status_code == 201
    assert balance(ledger, LENA_CHECKING) == 0


def test_balance_must_cover_fee(ledger, post_transfer):
    amount = 40_000
    ledger.get_account(LENA_CHECKING).balance_cents = amount + transfer_fee_cents(amount) - 1

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, amount)

    assert response.status_code == 422
    assert response.json()["error"] == "insufficient_funds"


def test_zero_amount_rejected(post_transfer):
    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 0)

    assert response.status_code == 422
    assert response.json()["error"] == "invalid_amount"


def test_negative_amount_rejected(ledger, post_transfer, balances):
    before = balances()

    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, -50_000)

    assert response.status_code == 422
    assert response.json()["error"] == "invalid_amount"
    assert balances() == before


def test_transfer_over_limit_rejected(post_transfer):
    response = post_transfer(MAYA, MAYA_SAVINGS, DANIEL_CHECKING, MAX_TRANSFER_DOLLARS * 100 + 1)

    assert response.status_code == 422
    assert response.json()["error"] == "transfer_limit_exceeded"


def test_transfer_at_limit_allowed(post_transfer):
    response = post_transfer(MAYA, MAYA_SAVINGS, DANIEL_CHECKING, MAX_TRANSFER_DOLLARS * 100)

    assert response.status_code == 201


def test_unknown_source_account_returns_404(post_transfer):
    response = post_transfer(MAYA, "acct_0000", DANIEL_CHECKING, 1_000)

    assert response.status_code == 404


def test_unknown_destination_account_returns_404(post_transfer):
    response = post_transfer(MAYA, MAYA_CHECKING, "acct_0000", 1_000)

    assert response.status_code == 404


def test_transfer_to_same_account_rejected(post_transfer):
    response = post_transfer(MAYA, MAYA_CHECKING, MAYA_CHECKING, 1_000)

    assert response.status_code == 422
    assert response.json()["error"] == "invalid_transfer"


def test_missing_customer_header_returns_401(client):
    response = client.post(
        "/api/transfers",
        json={"from_account": MAYA_CHECKING, "to_account": DANIEL_CHECKING, "amount_cents": 1_000},
    )

    assert response.status_code == 401


def test_unknown_customer_returns_401(post_transfer):
    response = post_transfer("cust_999", MAYA_CHECKING, DANIEL_CHECKING, 1_000)

    assert response.status_code == 401


def test_repeated_idempotency_key_moves_money_once(ledger, post_transfer):
    before = balance(ledger, MAYA_CHECKING)

    first = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 25_000, idempotency_key="retry-1")
    second = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 25_000, idempotency_key="retry-1")

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert balance(ledger, MAYA_CHECKING) == before - 25_000 - transfer_fee_cents(25_000)
    assert len(ledger.transfers) == 1


def test_distinct_idempotency_keys_create_separate_transfers(ledger, post_transfer):
    first = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 25_000, idempotency_key="a")
    second = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 25_000, idempotency_key="b")

    assert first.json()["id"] != second.json()["id"]
    assert len(ledger.transfers) == 2


def test_owner_can_view_account_balance(ledger, client):
    response = client.get(f"/api/accounts/{MAYA_CHECKING}", headers={"X-Customer-Id": MAYA})

    assert response.status_code == 200
    assert response.json()["balance_cents"] == balance(ledger, MAYA_CHECKING)


def test_customer_cannot_view_another_customers_account(client):
    response = client.get(f"/api/accounts/{MAYA_CHECKING}", headers={"X-Customer-Id": LENA})

    assert response.status_code == 403
    assert response.json()["error"] == "permission_denied"


def test_owner_can_view_account_history(ledger, client, post_transfer):
    post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    response = client.get(f"/api/accounts/{MAYA_CHECKING}/transfers", headers={"X-Customer-Id": MAYA})

    assert response.status_code == 200
    [entry] = response.json()["transfers"]
    assert entry["direction"] == "out"
    assert entry["counterparty"] == DANIEL_CHECKING
    assert entry["amount_cents"] == 12_500
    assert entry["fee_cents"] == transfer_fee_cents(12_500)


def test_fee_quote_matches_fee_schedule(client):
    response = client.get("/api/fees/quote", params={"amount_cents": 100_000})

    assert response.status_code == 200
    assert response.json() == {"amount_cents": 100_000, "fee_cents": 100, "total_cents": 100_100}
