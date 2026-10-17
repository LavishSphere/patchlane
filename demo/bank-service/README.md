# bank-service

Transfer service for the demo bank. Customers authenticate with the `X-Customer-Id` header. Clients may send an `Idempotency-Key` header to make retries safe.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/transfers` | Move money between accounts. Body: `from_account`, `to_account`, `amount_cents` |
| `GET` | `/api/accounts/{id}` | Account balance, visible to the account owner only |
| `GET` | `/health` | Liveness check |

- All money is integer cents.
- Transfers are limited to $5,000 each and carry a 0.10% fee.
- Accounts live in an in-memory ledger seeded from `data/seed_accounts.json`. All customers are synthetic.

```bash
pip install -r requirements.txt
python -m pytest -q
uvicorn bank_service.api:app --port 9000
```
