from bank_service.transfers import transfer


def test_many_retries_create_one_transfer(post_transfer, ledger):
    ids = {
        post_transfer("cust_002", "acct_3390", "acct_6630", 7_500, idempotency_key="invoice-77").json()["id"]
        for _ in range(4)
    }

    assert len(ids) == 1
    assert len(ledger.transfers) == 1


def test_service_function_returns_the_original_transfer(ledger):
    first = transfer(ledger, "cust_004", "acct_7712", "acct_3390", 2_000, idempotency_key="k-1")
    again = transfer(ledger, "cust_004", "acct_7712", "acct_3390", 2_000, idempotency_key="k-1")

    assert again is first
    assert len(ledger.transfers) == 1


def test_money_moves_once_across_retries(post_transfer, ledger):
    total_before = ledger.total_cents()
    for _ in range(3):
        post_transfer("cust_001", "acct_8214", "acct_5521", 30_000, idempotency_key="gift")

    assert ledger.total_cents() == total_before
    assert len(ledger.transfers) == 1


def test_different_customers_can_reuse_the_same_key_string(post_transfer, ledger):
    a = post_transfer("cust_001", "acct_8214", "acct_7712", 1_000, idempotency_key="same")
    b = post_transfer("cust_002", "acct_3390", "acct_7712", 1_000, idempotency_key="same")

    assert a.status_code == b.status_code == 201
    assert a.json()["id"] != b.json()["id"]
    assert len(ledger.transfers) == 2


def test_new_keys_still_create_new_transfers(post_transfer, ledger):
    post_transfer("cust_003", "acct_5521", "acct_7712", 1_000, idempotency_key="one")
    post_transfer("cust_003", "acct_5521", "acct_7712", 1_000, idempotency_key="two")

    assert len(ledger.transfers) == 2
