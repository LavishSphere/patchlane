from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .errors import AuthenticationError, BankError, InvalidAmountError
from .fees import transfer_fee_cents
from .history import account_history
from .ledger import Ledger
from .limits import check_transfer_limit
from .transfers import transfer


class TransferRequest(BaseModel):
    from_account: str
    to_account: str
    amount_cents: int


def create_app(ledger: Ledger | None = None) -> FastAPI:
    app = FastAPI(title="bank-service")
    app.state.ledger = ledger if ledger is not None else Ledger.from_seed()

    @app.exception_handler(BankError)
    async def handle_bank_error(request: Request, exc: BankError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.code, "message": str(exc)})

    def authenticate(customer_id: str | None) -> str:
        if not customer_id or not app.state.ledger.has_customer(customer_id):
            raise AuthenticationError("unknown or missing customer")
        return customer_id

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/transfers", status_code=201)
    def create_transfer(
        body: TransferRequest,
        x_customer_id: str | None = Header(default=None),
        idempotency_key: str | None = Header(default=None),
    ) -> dict:
        requester_id = authenticate(x_customer_id)
        record = transfer(
            app.state.ledger,
            requester_id,
            body.from_account,
            body.to_account,
            body.amount_cents,
            idempotency_key,
        )
        return {
            "id": record.id,
            "from_account": record.from_account,
            "to_account": record.to_account,
            "amount_cents": record.amount_cents,
            "fee_cents": record.fee_cents,
        }

    @app.get("/api/accounts/{account_id}")
    def get_account(account_id: str, x_customer_id: str | None = Header(default=None)) -> dict:
        requester_id = authenticate(x_customer_id)
        account = app.state.ledger.get_account(account_id)
        app.state.ledger.require_owner(account, requester_id)
        return {
            "id": account.id,
            "nickname": account.nickname,
            "balance_cents": account.balance_cents,
        }

    @app.get("/api/accounts/{account_id}/transfers")
    def list_account_transfers(account_id: str, x_customer_id: str | None = Header(default=None)) -> dict:
        requester_id = authenticate(x_customer_id)
        account = app.state.ledger.get_account(account_id)
        return {"account_id": account.id, "transfers": account_history(app.state.ledger, account.id)}

    @app.get("/api/fees/quote")
    def quote_fee(amount_cents: int) -> dict:
        if amount_cents <= 0:
            raise InvalidAmountError("amount must be positive")
        check_transfer_limit(amount_cents)
        fee_cents = transfer_fee_cents(amount_cents)
        return {"amount_cents": amount_cents, "fee_cents": fee_cents, "total_cents": amount_cents + fee_cents}

    return app


app = create_app()
