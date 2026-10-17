import pytest

from bank_service.fees import transfer_fee_cents


@pytest.mark.parametrize(
    "amount, fee",
    [(500, 1), (1_500, 2), (999_950, 1_000), (25_050, 25), (15_000, 15)],
)
def test_half_cents_round_up(amount, fee):
    assert transfer_fee_cents(amount) == fee


@pytest.mark.parametrize("amount, fee", [(499, 0), (1_499, 1), (2_449, 2)])
def test_below_half_rounds_down(amount, fee):
    assert transfer_fee_cents(amount) == fee


def test_fee_is_an_integer_number_of_cents():
    assert isinstance(transfer_fee_cents(123_457), int)


def test_api_charges_the_rounded_fee_and_conserves_money(post_transfer, ledger):
    total_before = ledger.total_cents()

    response = post_transfer("cust_001", "acct_8214", "acct_3390", 1_550)

    assert response.json()["fee_cents"] == 2
    assert ledger.fees_collected_cents == 2
    assert ledger.total_cents() == total_before
