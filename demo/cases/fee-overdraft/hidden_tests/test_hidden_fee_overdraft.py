import pytest

from bank_service.errors import InsufficientFundsError
from bank_service.fees import transfer_fee_cents
from bank_service.transfers import transfer


@pytest.mark.parametrize("amount", [1_000, 40_000, 250_000])
def test_balance_equal_to_amount_but_not_fee_is_rejected(ledger, post_transfer, amount):
    ledger.get_account("acct_7712").balance_cents = amount

    response = post_transfer("cust_004", "acct_7712", "acct_3390", amount)

    assert response.status_code == 422
    assert ledger.get_account("acct_7712").balance_cents == amount


def test_service_function_refuses_to_overdraw(ledger):
    ledger.get_account("acct_5521").balance_cents = 10_000
    with pytest.raises(InsufficientFundsError):
        transfer(ledger, "cust_003", "acct_5521", "acct_8214", 10_000)


def test_no_balance_ever_goes_negative(ledger, post_transfer):
    ledger.get_account("acct_6630").balance_cents = 12_345
    for amount in (12_345, 12_340, 12_333, 12_000):
        post_transfer("cust_005", "acct_6630", "acct_8214", amount)

    assert all(a.balance_cents >= 0 for a in ledger.accounts.values())


def test_balance_covering_amount_plus_fee_still_works(ledger, post_transfer):
    amount = 40_000
    ledger.get_account("acct_6630").balance_cents = amount + transfer_fee_cents(amount)

    response = post_transfer("cust_005", "acct_6630", "acct_8214", amount)

    assert response.status_code == 201
    assert ledger.get_account("acct_6630").balance_cents == 0
