import pytest

from bank_service.errors import InsufficientFundsError
from bank_service.fees import transfer_fee_cents
from bank_service.transfers import transfer

MAYA = "cust_001"
DANIEL = "cust_002"
LENA = "cust_005"
MAYA_CHECKING = "acct_8214"
DANIEL_CHECKING = "acct_3390"
LENA_CHECKING = "acct_6630"


def test_declined_transfer_leaves_every_balance_unchanged(ledger, post_transfer, balances):
    ledger.get_account(LENA_CHECKING).balance_cents = 10_000
    before = balances()

    response = post_transfer(LENA, LENA_CHECKING, DANIEL_CHECKING, 2_000_000)

    assert response.status_code == 422
    assert balances() == before


def test_declined_transfer_creates_no_money(ledger, post_transfer):
    ledger.get_account(LENA_CHECKING).balance_cents = 10_000
    total_before = ledger.total_cents()

    for _ in range(3):
        post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 50_000)

    assert ledger.total_cents() == total_before
    assert ledger.transfers == []


def test_shortfall_of_only_the_fee_does_not_credit_the_recipient(ledger, post_transfer):
    ledger.get_account(LENA_CHECKING).balance_cents = 100_000
    recipient_before = ledger.get_account(MAYA_CHECKING).balance_cents

    response = post_transfer(LENA, LENA_CHECKING, MAYA_CHECKING, 100_000)

    assert response.status_code == 422
    assert ledger.get_account(MAYA_CHECKING).balance_cents == recipient_before


def test_service_function_raises_without_touching_the_destination(ledger):
    ledger.get_account(LENA_CHECKING).balance_cents = 500
    destination_before = ledger.get_account(DANIEL_CHECKING).balance_cents

    with pytest.raises(InsufficientFundsError):
        transfer(ledger, LENA, LENA_CHECKING, DANIEL_CHECKING, 1_000)

    assert ledger.get_account(DANIEL_CHECKING).balance_cents == destination_before


def test_affordable_transfer_still_credits_the_recipient(ledger, post_transfer):
    recipient_before = ledger.get_account(DANIEL_CHECKING).balance_cents
    sender_before = ledger.get_account(MAYA_CHECKING).balance_cents

    response = post_transfer(MAYA, MAYA_CHECKING, DANIEL_CHECKING, 12_500)

    assert response.status_code == 201
    assert ledger.get_account(DANIEL_CHECKING).balance_cents == recipient_before + 12_500
    assert ledger.get_account(MAYA_CHECKING).balance_cents == sender_before - 12_500 - transfer_fee_cents(12_500)
