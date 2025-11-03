class BusinessRuleViolation(Exception):
    """Raised when a requested operation violates a domain constraint."""


class MissingReferenceError(BusinessRuleViolation):
    """Raised when a referenced product, salesman, or transaction is unknown."""
