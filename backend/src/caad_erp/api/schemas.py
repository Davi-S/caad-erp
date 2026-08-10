"""Pydantic data transfer objects for the CAAD ERP API.

This module defines the strict request and response models that form the API
contract. Each model mirrors CLI command arguments or BLL return structures,
acting as the translation layer between JSON payloads and internal domain
objects.
"""

import typing as t

import pydantic

from caad_erp import constants


class StandardResponse(pydantic.BaseModel):
    """Standard wrapper for mutation endpoint responses.

    The `data` field uses `Any` to allow flexibility across different entity
    types (Product, Salesman, Transaction). Individual endpoints ensure type
    safety by constructing specific response DTOs before wrapping them.
    """

    detail: str
    data: t.Any | None = None


class ProductCreateRequest(pydantic.BaseModel):
    """Request payload for creating a new product."""

    product_id: str = pydantic.Field(..., min_length=1)
    product_name: str = pydantic.Field(..., min_length=1)
    sell_price: int = pydantic.Field(..., ge=0)
    is_active: bool = True


class ProductUpdateRequest(pydantic.BaseModel):
    """Request payload for partially updating an existing product."""

    product_name: str | None = pydantic.Field(None, min_length=1)
    sell_price: int | None = pydantic.Field(None, ge=0)
    is_active: bool | None = None


class ProductResponse(pydantic.BaseModel):
    """Response representation of a product record."""

    product_id: str
    product_name: str
    sell_price: int
    is_active: bool


class SalesmanCreateRequest(pydantic.BaseModel):
    """Request payload for creating a new salesman."""

    salesman_id: str = pydantic.Field(..., min_length=1)
    salesman_name: str = pydantic.Field(..., min_length=1)
    is_active: bool = True


class SalesmanUpdateRequest(pydantic.BaseModel):
    """Request payload for partially updating an existing salesman."""

    salesman_name: str | None = pydantic.Field(None, min_length=1)
    is_active: bool | None = None


class SalesmanResponse(pydantic.BaseModel):
    """Response representation of a salesman record."""

    salesman_id: str
    salesman_name: str
    is_active: bool


class SaleRequest(pydantic.BaseModel):
    """Request payload for recording a sale transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: int = pydantic.Field(..., gt=0)
    total_revenue: int = pydantic.Field(..., ge=0)
    payment_type: constants.PaymentType
    notes: str | None = None


class BulkSaleRequest(pydantic.BaseModel):
    """Request payload for recording multiple sale transactions in a single operation."""

    items: list[SaleRequest] = pydantic.Field(..., min_length=1)


class RestockRequest(pydantic.BaseModel):
    """Request payload for recording a restock transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: int = pydantic.Field(..., gt=0)
    total_cost: int = pydantic.Field(..., ge=0)
    notes: str | None = None


class WriteOffRequest(pydantic.BaseModel):
    """Request payload for recording a write-off transaction."""

    product_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    quantity: int = pydantic.Field(..., gt=0)
    notes: str | None = None


class VoidRequest(pydantic.BaseModel):
    """Request payload for voiding an existing transaction."""

    linked_transaction_id: str = pydantic.Field(..., min_length=1)
    notes: str | None = None


class PayDebtRequest(pydantic.BaseModel):
    """Request payload for recording a credit payment."""

    linked_transaction_id: str = pydantic.Field(..., min_length=1)
    salesman_id: str = pydantic.Field(..., min_length=1)
    total_revenue: int = pydantic.Field(..., ge=0)
    payment_type: constants.PaymentType
    notes: str | None = None

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


class ProductListResponse(pydantic.BaseModel):
    """Response for listing products."""

    items: list[ProductResponse]


class SalesmanListResponse(pydantic.BaseModel):
    """Response for listing salesmen."""

    items: list[SalesmanResponse]


class TransactionResponse(pydantic.BaseModel):
    """Response representation of a transaction record."""

    transaction_id: str
    timestamp_iso: str
    transaction_type: str
    product_id: str
    salesman_id: str
    payment_type: str | None
    quantity_change: int
    total_revenue: int
    total_cost: int
    linked_transaction_id: str | None
    notes: str | None


class BulkSaleResponse(pydantic.BaseModel):
    """Response representation of recorded bulk sale transactions."""

    items: list[TransactionResponse]


class StockItem(pydantic.BaseModel):
    """Single item in the stock report."""

    product_id: str
    quantity: int


class StockReportResponse(pydantic.BaseModel):
    """Response for the stock report endpoint."""

    items: list[StockItem]


class ProfitReportResponse(pydantic.BaseModel):
    """Response for the profit report endpoint."""

    total_revenue: int
    total_cost: int
    profit: int


class DebtItem(pydantic.BaseModel):
    """Single outstanding debt entry."""

    transaction_id: str
    timestamp_iso: str
    product_id: str
    salesman_id: str
    quantity: int
    expected_amount: int
    amount_paid: int
    balance: int


class DebtsReportResponse(pydantic.BaseModel):
    """Response for the debts report endpoint."""

    balances: list[DebtItem]
    total_outstanding: int


class LogReportResponse(pydantic.BaseModel):
    """Response for the transaction log report endpoint."""

    transactions: list[TransactionResponse]
