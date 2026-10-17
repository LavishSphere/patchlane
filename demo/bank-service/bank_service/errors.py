class BankError(Exception):
    """Base error. Each subclass maps to one HTTP status and error code."""

    status_code = 400
    code = "bad_request"


class AuthenticationError(BankError):
    status_code = 401
    code = "unauthenticated"


class PermissionDeniedError(BankError):
    status_code = 403
    code = "permission_denied"


class AccountNotFoundError(BankError):
    status_code = 404
    code = "account_not_found"


class InvalidAmountError(BankError):
    status_code = 422
    code = "invalid_amount"


class InvalidTransferError(BankError):
    status_code = 422
    code = "invalid_transfer"


class TransferLimitError(BankError):
    status_code = 422
    code = "transfer_limit_exceeded"


class InsufficientFundsError(BankError):
    status_code = 422
    code = "insufficient_funds"
