"""Enumerations shared across Lounge ERP modules.

Centralises domain constants so that the data access layer (DAL), business
logic layer (BLL), and future presentation layers can rely on a single source
of truth for critical identifiers.
"""

from __future__ import annotations

from enum import Enum


# Central schema version expected by all layers when validating workbooks.
EXPECTED_SCHEMA_VERSION = "1.0.0"


class PaymentType(str, Enum):
    """Enumerate supported payment mechanisms for sales."""

    CASH = "Cash"
    ON_CREDIT = "On Credit"


class TransactionType(str, Enum):
    """Enumerate the canonical transaction types recorded in the ledger."""

    SALE = "SALE"
    RESTOCK = "RESTOCK"
    WRITE_OFF = "WRITE_OFF"
    CREDIT_PAYMENT = "CREDIT_PAYMENT"
    OPEN_STOCK = "OPEN_STOCK"
    VOID = "VOID"


class SheetName(str, Enum):
    """Enumerate the workbook sheet names managed by the DAL."""

    PRODUCTS = "Products"
    SALESMEN = "Salesmen"
    TRANSACTION_LOG = "TransactionLog"


__all__ = [
    "EXPECTED_SCHEMA_VERSION",
    "PaymentType",
    "TransactionType",
    "SheetName",
]
