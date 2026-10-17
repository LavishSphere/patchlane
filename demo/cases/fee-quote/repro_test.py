TOM = "cust_004"
TOM_CHECKING = "acct_7712"
LENA_CHECKING = "acct_6630"


def test_quoted_fee_matches_the_fee_charged(client, post_transfer):
    quote = client.get("/api/fees/quote", params={"amount_cents": 2_500}).json()

    charged = post_transfer(TOM, TOM_CHECKING, LENA_CHECKING, 2_500).json()

    assert quote["fee_cents"] == charged["fee_cents"]
