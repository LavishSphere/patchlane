import pytest
from fastapi.testclient import TestClient

from bank_service.api import create_app
from bank_service.ledger import Ledger


@pytest.fixture
def ledger() -> Ledger:
    return Ledger.from_seed()


@pytest.fixture
def client(ledger: Ledger) -> TestClient:
    return TestClient(create_app(ledger))


@pytest.fixture
def post_transfer(client: TestClient):
    def _post(requester_id, from_account, to_account, amount_cents, idempotency_key=None):
        headers = {"X-Customer-Id": requester_id}
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        return client.post(
            "/api/transfers",
            json={"from_account": from_account, "to_account": to_account, "amount_cents": amount_cents},
            headers=headers,
        )

    return _post


@pytest.fixture
def balances(ledger: Ledger):
    def _snapshot() -> dict[str, int]:
        return {account_id: a.balance_cents for account_id, a in ledger.accounts.items()}

    return _snapshot
