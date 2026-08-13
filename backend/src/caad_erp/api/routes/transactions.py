"""Transaction endpoints for the CAAD ERP API.

This module provides REST endpoints for recording various transaction types,
mirroring the CLI commands sale, restock, write-off, void, and pay-debt.
"""

import typing as t

import fastapi

from caad_erp import bll, dal

from .. import persistence, runtime, schemas

router = fastapi.APIRouter(prefix="/transactions", tags=["Transactions"])

ContextDep = t.Annotated[
    bll.RuntimeContext, fastapi.Depends(runtime.get_runtime_context)
]


def _transaction_to_response(
    transaction: dal.TransactionRow,
) -> schemas.TransactionResponse:
    """Convert a BLL TransactionRow to a response schema."""
    return schemas.TransactionResponse(
        transaction_id=transaction.transaction_id,
        timestamp_iso=transaction.timestamp_iso,
        transaction_type=transaction.transaction_type,
        product_id=transaction.product_id,
        salesman_id=transaction.salesman_id,
        payment_type=transaction.payment_type,
        quantity_change=transaction.quantity_change,
        total_revenue=transaction.total_revenue,
        total_cost=transaction.total_cost,
        linked_transaction_id=transaction.linked_transaction_id,
        notes=transaction.notes,
    )


@router.post("/sale", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_sale(
    request: schemas.SaleRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Record a sale transaction.

    Args:
        request: Sale transaction payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created transaction data.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    command = bll.SaleCommand(
        product_id=request.product_id,
        salesman_id=request.salesman_id,
        quantity=request.quantity,
        total_revenue=request.total_revenue,
        payment_type=request.payment_type,
        notes=request.notes,
    )
    transaction = bll.record_sale(context, command)
    return schemas.StandardResponse(
        detail="Sale recorded successfully",
        data=_transaction_to_response(transaction),
    )


@router.post("/bulk-sale", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_bulk_sale(
    request: schemas.BulkSaleRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Record multiple sale transactions in a single atomic operation.

    Args:
        request: Bulk sale transaction payload containing a list of SaleRequests.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created bulk sale transaction items.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    commands = [
        bll.SaleCommand(
            product_id=item.product_id,
            salesman_id=item.salesman_id,
            quantity=item.quantity,
            total_revenue=item.total_revenue,
            payment_type=item.payment_type,
            notes=item.notes,
        )
        for item in request.items
    ]
    transactions = bll.record_bulk_sale(context, commands)
    response_items = [_transaction_to_response(tx) for tx in transactions]
    return schemas.StandardResponse(
        detail="Bulk sale recorded successfully",
        data=schemas.BulkSaleResponse(items=response_items),
    )


@router.post("/restock", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_restock(
    request: schemas.RestockRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Record a restock transaction.

    Args:
        request: Restock transaction payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created transaction data.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    command = bll.RestockCommand(
        product_id=request.product_id,
        salesman_id=request.salesman_id,
        quantity=request.quantity,
        total_cost=request.total_cost,
        notes=request.notes,
    )
    transaction = bll.record_restock(context, command)
    return schemas.StandardResponse(
        detail="Restock recorded successfully",
        data=_transaction_to_response(transaction),
    )


@router.post("/write-off", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_write_off(
    request: schemas.WriteOffRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Record a write-off transaction.

    Args:
        request: Write-off transaction payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created transaction data.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    command = bll.WriteOffCommand(
        product_id=request.product_id,
        salesman_id=request.salesman_id,
        quantity=request.quantity,
        notes=request.notes,
    )
    transaction = bll.record_write_off(context, command)
    return schemas.StandardResponse(
        detail="Write-off recorded successfully",
        data=_transaction_to_response(transaction),
    )


@router.post("/void", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_void(
    request: schemas.VoidRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Void an existing transaction.

    Args:
        request: Void transaction payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created void transaction data.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    command = bll.VoidCommand(
        linked_transaction_id=request.linked_transaction_id,
        notes=request.notes,
    )
    transaction = bll.record_void(context, command)
    return schemas.StandardResponse(
        detail="Transaction voided successfully",
        data=_transaction_to_response(transaction),
    )


@router.post("/pay-debt", response_model=schemas.StandardResponse, status_code=201)
@persistence.mutating_endpoint
def record_pay_debt(
    request: schemas.PayDebtRequest,
    context: ContextDep,
) -> schemas.StandardResponse:
    """Record a credit payment for an outstanding sale.

    Args:
        request: Credit payment payload.
        context: Runtime context injected via dependency.

    Returns:
        StandardResponse containing the created transaction data.

    Raises:
        HTTPException: 409 for business rule violations, 404 for missing references.
    """
    command = bll.CreditPaymentCommand(
        linked_transaction_id=request.linked_transaction_id,
        salesman_id=request.salesman_id,
        total_revenue=request.total_revenue,
        payment_type=request.payment_type,
        notes=request.notes,
    )
    transaction = bll.record_credit_payment(context, command)
    return schemas.StandardResponse(
        detail="Credit payment recorded successfully",
        data=_transaction_to_response(transaction),
    )
