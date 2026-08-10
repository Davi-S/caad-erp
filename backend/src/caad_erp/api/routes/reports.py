"""Report endpoints for the CAAD ERP API.

This module provides REST endpoints for generating various reports,
mirroring the CLI commands stock, profit, debts, and log.
"""

import fastapi

from caad_erp import bll

from .. import runtime, schemas

router = fastapi.APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/stock", response_model=schemas.StockReportResponse)
def get_stock_report(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.StockReportResponse:
    """Get current stock levels for all products.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        StockReportResponse containing inventory levels per product.
    """
    inventory = bll.calculate_inventory(context)
    items = [
        schemas.StockItem(product_id=product_id, quantity=quantity)
        for product_id, quantity in sorted(inventory.items())
    ]
    return schemas.StockReportResponse(items=items)


@router.get("/profit", response_model=schemas.ProfitReportResponse)
def get_profit_report(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.ProfitReportResponse:
    """Get profit summary with revenue and cost totals.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        ProfitReportResponse containing revenue, cost, and profit totals.
    """
    summary = bll.calculate_profit_summary(context)
    return schemas.ProfitReportResponse(
        total_revenue=summary["total_revenue"],
        total_cost=summary["total_cost"],
        profit=summary["profit"],
    )


@router.get("/debts", response_model=schemas.DebtsReportResponse)
def get_debts_report(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.DebtsReportResponse:
    """Get outstanding credit balances.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        DebtsReportResponse containing outstanding balances and total.
    """
    summary = bll.calculate_outstanding_debts(context)
    balances = [
        schemas.DebtItem(
            transaction_id=debt.transaction_id,
            timestamp_iso=debt.timestamp_iso,
            product_id=debt.product_id,
            salesman_id=debt.salesman_id,
            quantity=debt.quantity,
            expected_amount=debt.expected_amount,
            amount_paid=debt.amount_paid,
            balance=debt.balance,
        )
        for debt in summary["balances"]
    ]
    return schemas.DebtsReportResponse(
        balances=balances,
        total_outstanding=summary["total_outstanding"],
    )


@router.get("/log", response_model=schemas.LogReportResponse)
def get_log_report(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> schemas.LogReportResponse:
    """Get the full transaction log.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        LogReportResponse containing all transactions.
    """
    transactions = bll.list_transactions(context)
    return schemas.LogReportResponse(
        transactions=[
            schemas.TransactionResponse(
                transaction_id=t.transaction_id,
                timestamp_iso=t.timestamp_iso,
                transaction_type=t.transaction_type,
                product_id=t.product_id,
                salesman_id=t.salesman_id,
                payment_type=t.payment_type,
                quantity_change=t.quantity_change,
                total_revenue=t.total_revenue,
                total_cost=t.total_cost,
                linked_transaction_id=t.linked_transaction_id,
                notes=t.notes,
            )
            for t in transactions
        ]
    )


@router.get("/workbook", response_class=fastapi.responses.FileResponse)
def get_workbook_report(
    context: bll.RuntimeContext = fastapi.Depends(runtime.get_runtime_context),
) -> fastapi.responses.FileResponse:
    """Download the current master Excel workbook file.

    Args:
        context: Runtime context injected via dependency.

    Returns:
        FileResponse containing the master workbook .xlsx file.
    """
    bll.persist_context(context)
    workbook_path = bll.get_master_workbook_path(context)
    return fastapi.responses.FileResponse(
        path=workbook_path,
        filename=workbook_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
