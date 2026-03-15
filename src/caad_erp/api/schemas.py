"""Pydantic data transfer objects for the CAAD ERP API.

This module defines the strict request and response models that form the API
contract. Each model mirrors CLI command arguments or BLL return structures,
acting as the translation layer between JSON payloads and internal domain
objects.
"""

import typing as t
from decimal import Decimal

import pydantic

from caad_erp import constants


# ---------------------------------------------------------------------------
# Standard Response Envelope
# ---------------------------------------------------------------------------


class StandardResponse(pydantic.BaseModel):
    """Standard wrapper for mutation endpoint responses.

    The `data` field uses `Any` to allow flexibility across different entity
    types (Product, Salesman, Transaction). Individual endpoints ensure type
    safety by constructing specific response DTOs before wrapping them.
    """

    detail: str
    data: t.Optional[t.Any] = None


# ---------------------------------------------------------------------------
# Product DTOs
# ---------------------------------------------------------------------------


class ProductCreateRequest(pydantic.BaseModel):
    """Request payload for creating a new product."""

    product_id: str = pydantic.Field(..., min_length=1)
    product_name: str = pydantic.Field(..., min_length=1)
    sell_price: Decimal = pydantic.Field(..., ge=0)
    is_active: bool = True


class ProductResponse(pydantic.BaseModel):
    """Response representation of a product record."""

    product_id: str
    product_name: str
    sell_price: Decimal
    is_active: bool


# ---------------------------------------------------------------------------
# Salesman DTOs
# ---------------------------------------------------------------------------


class SalesmanCreateRequest(pydantic.BaseModel):
    """Request payload for creating a new salesman."""

    salesman_id: str = pydantic.Field(..., min_length=1)
    salesman_name: str = pydantic.Field(..., min_length=1)
    is_active: bool = True


class SalesmanResponse(pydantic.BaseModel):
    """Response representation of a salesman record."""

    salesman_id: str
    salesman_name: str
    is_active: bool


# ---------------------------------------------------------------------------
# Transaction DTOs
# ---------------------------------------------------------------------------


class SaleRequest(pydantic.BaseModel):
    """Request payload for recording a sale transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: Decimal = pydantic.Field(..., gt=0)
    total_revenue: Decimal = pydantic.Field(..., ge=0)
    payment_type: constants.PaymentType
    notes: t.Optional[str] = None


class RestockRequest(pydantic.BaseModel):
    """Request payload for recording a restock transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: Decimal = pydantic.Field(..., gt=0)
    total_cost: Decimal = pydantic.Field(..., ge=0)
    notes: t.Optional[str] = None


class WriteOffRequest(pydantic.BaseModel):
    """Request payload for recording a write-off transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: Decimal = pydantic.Field(..., gt=0)
    notes: t.Optional[str] = None


class VoidRequest(pydantic.BaseModel):
    """Request payload for voiding an existing transaction."""

    linked_transaction_id: str = pydantic.Field(..., min_length=1)
    notes: t.Optional[str] = None


class PayDebtRequest(pydantic.BaseModel):
    """Request payload for recording a credit payment."""

    linked_transaction_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    total_revenue: Decimal = pydantic.Field(..., ge=0)
    payment_type: constants.PaymentType
    notes: t.Optional[str] = None

    @pydantic.field_validator("payment_type")
    @classmethod
    def payment_type_not_on_credit(
        cls, value: constants.PaymentType
    ) -> constants.PaymentType:
        """Reject OnCredit as a settlement method for credit payments."""
        if value == constants.PaymentType.ON_CREDIT:
            raise ValueError(
                "Payment type 'OnCredit' is not allowed when settling a debt"
            )
        return value


# ---------------------------------------------------------------------------
# List DTOs
# ---------------------------------------------------------------------------


class ProductListResponse(pydantic.BaseModel):
    """Response for listing products."""

    items: t.List[ProductResponse]


class SalesmanListResponse(pydantic.BaseModel):
    """Response for listing salesmen."""

    items: t.List[SalesmanResponse]


class TransactionResponse(pydantic.BaseModel):
    """Response representation of a transaction record."""

    transaction_id: str
    timestamp_iso: str
    transaction_type: str
    product_id: t.Optional[str]
    salesman_id: t.Optional[str]
    payment_type: t.Optional[str]
    quantity_change: Decimal
    total_revenue: Decimal
    total_cost: Decimal
    linked_transaction_id: t.Optional[str]
    notes: t.Optional[str]


# ---------------------------------------------------------------------------
# Report DTOs
# ---------------------------------------------------------------------------


class StockItem(pydantic.BaseModel):
    """Single item in the stock report."""

    product_id: str
    quantity: Decimal


class StockReportResponse(pydantic.BaseModel):
    """Response for the stock report endpoint."""

    items: t.List[StockItem]


class ProfitReportResponse(pydantic.BaseModel):
    """Response for the profit report endpoint."""

    total_revenue: Decimal
    total_cost: Decimal
    profit: Decimal


class DebtItem(pydantic.BaseModel):
    """Single outstanding debt entry."""

    transaction_id: str
    timestamp_iso: str
    product_id: t.Optional[str]
    salesman_id: t.Optional[str]
    quantity: Decimal
    expected_amount: Decimal
    amount_paid: Decimal
    balance: Decimal


class DebtsReportResponse(pydantic.BaseModel):
    """Response for the debts report endpoint."""

    balances: t.List[DebtItem]
    total_outstanding: Decimal


class LogReportResponse(pydantic.BaseModel):
    """Response for the transaction log report endpoint."""

    transactions: t.List[TransactionResponse]
