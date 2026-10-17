import json
from dataclasses import dataclass
from pathlib import Path

from .errors import AccountNotFoundError, PermissionDeniedError

DEFAULT_SEED = Path(__file__).resolve().parent.parent / "data" / "seed_accounts.json"


@dataclass
class Account:
    id: str
    owner_id: str
    nickname: str
    balance_cents: int


@dataclass(frozen=True)
class Transfer:
    id: str
    requester_id: str
    from_account: str
    to_account: str
    amount_cents: int
    fee_cents: int
    idempotency_key: str | None


class Ledger:
    """In-memory accounts and transfer history. All amounts are integer cents."""

    def __init__(self, customers: dict[str, str], accounts: dict[str, Account]):
        self.customers = customers
        self.accounts = accounts
        self.transfers: list[Transfer] = []
        self.fees_collected_cents = 0
        self._by_idempotency_key: dict[tuple[str, str], Transfer] = {}

    @classmethod
    def from_seed(cls, path: Path | str = DEFAULT_SEED) -> "Ledger":
        data = json.loads(Path(path).read_text())
        customers = {c["id"]: c["name"] for c in data["customers"]}
        accounts = {
            a["id"]: Account(a["id"], a["owner_id"], a["nickname"], a["balance_cents"])
            for a in data["accounts"]
        }
        return cls(customers, accounts)

    def has_customer(self, customer_id: str) -> bool:
        return customer_id in self.customers

    def get_account(self, account_id: str) -> Account:
        account = self.accounts.get(account_id)
        if account is None:
            raise AccountNotFoundError(f"account {account_id} not found")
        return account

    def require_owner(self, account: Account, customer_id: str) -> None:
        if account.owner_id != customer_id:
            raise PermissionDeniedError(f"customer {customer_id} does not own account {account.id}")

    def find_transfer(self, requester_id: str, idempotency_key: str) -> Transfer | None:
        return self._by_idempotency_key.get((requester_id, idempotency_key))

    def record_transfer(
        self,
        requester_id: str,
        from_account: str,
        to_account: str,
        amount_cents: int,
        fee_cents: int,
        idempotency_key: str | None,
    ) -> Transfer:
        record = Transfer(
            id=f"trf_{len(self.transfers) + 1:05d}",
            requester_id=requester_id,
            from_account=from_account,
            to_account=to_account,
            amount_cents=amount_cents,
            fee_cents=fee_cents,
            idempotency_key=idempotency_key,
        )
        self.transfers.append(record)
        if idempotency_key is not None:
            self._by_idempotency_key[(from_account, idempotency_key)] = record
        return record

    def total_cents(self) -> int:
        """Money in the system: every balance plus collected fees."""
        return sum(a.balance_cents for a in self.accounts.values()) + self.fees_collected_cents
