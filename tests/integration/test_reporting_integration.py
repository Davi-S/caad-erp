from decimal import Decimal

import pytest

from caad_erp import bll, constants, dal


def _add_product(context: bll.RuntimeContext, product_id: str, price: str = "10.00") -> None:
    bll.add_product(
        context,
        bll.ProductCommand(
            product_id=product_id,
            product_name=f"Product {product_id}",
            sell_price=Decimal(price),
            is_active=True,
        ),
    )


def _add_salesman(context: bll.RuntimeContext, salesman_id: str) -> None:
    bll.add_salesman(
        context,
        bll.SalesmanCommand(
            salesman_id=salesman_id,
            salesman_name=f"Salesman {salesman_id}",
            is_active=True,
        ),
    )


def test_inventory_report_matches_transaction_history_after_mixed_operations(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a mixed sequence of open-stock sale restock write-off and void operations
    WHEN calculate_inventory is called
    THEN product quantities match net effects implied by full transaction history
    """
    _add_product(initialized_context, "RP-P001")
    _add_salesman(initialized_context, "RP-S001")

    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=Decimal("10"),
            total_revenue=Decimal("0.00"),
        ),
    )
    sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=Decimal("3"),
            total_revenue=Decimal("30.00"),
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=Decimal("4"),
            total_cost=Decimal("12.00"),
        ),
    )
    bll.record_write_off(
        initialized_context,
        bll.WriteOffCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=Decimal("2"),
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=sale.transaction_id),
    )

    inventory = bll.calculate_inventory(initialized_context)
    assert inventory["RP-P001"] == Decimal("12")


def test_profit_summary_matches_revenue_plus_cost_over_transaction_log(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a transaction history containing revenue and expense events
    WHEN calculate_profit_summary is called
    THEN reported profit equals total_revenue plus total_cost with expected sign semantics
    """
    _add_product(initialized_context, "RP-P002")
    _add_salesman(initialized_context, "RP-S002")

    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P002",
            salesman_id="RP-S002",
            quantity=Decimal("1"),
            total_revenue=Decimal("30.00"),
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="RP-P002",
            salesman_id="RP-S002",
            quantity=Decimal("2"),
            total_cost=Decimal("7.50"),
        ),
    )

    summary = bll.calculate_profit_summary(initialized_context)
    assert summary["total_revenue"] == Decimal("30.00")
    assert summary["total_cost"] == Decimal("-7.50")
    assert summary["profit"] == Decimal("22.50")


def test_outstanding_debts_report_tracks_partial_and_full_credit_payments(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN credit sales with different payment progress states
    WHEN calculate_outstanding_debts is called
    THEN balances include only unpaid portions and exclude fully settled sales
    """
    _add_product(initialized_context, "RP-P003", price="10.00")
    _add_salesman(initialized_context, "RP-S003")

    partially_paid_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P003",
            salesman_id="RP-S003",
            quantity=Decimal("2"),
            total_revenue=Decimal("0.00"),
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    fully_paid_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P003",
            salesman_id="RP-S003",
            quantity=Decimal("1"),
            total_revenue=Decimal("0.00"),
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )

    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=partially_paid_sale.transaction_id,
            salesman_id="RP-S003",
            total_revenue=Decimal("5.00"),
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=fully_paid_sale.transaction_id,
            salesman_id="RP-S003",
            total_revenue=Decimal("10.00"),
            payment_type=constants.PaymentType.PIX,
        ),
    )

    report = bll.calculate_outstanding_debts(initialized_context)
    debts_by_id = {debt.transaction_id: debt for debt in report["balances"]}
    assert partially_paid_sale.transaction_id in debts_by_id
    assert fully_paid_sale.transaction_id not in debts_by_id
    assert debts_by_id[partially_paid_sale.transaction_id].balance == Decimal(
        "15.00")
    assert report["total_outstanding"] == Decimal("15.00")


def test_outstanding_debts_excludes_voided_credit_sales_in_end_to_end_flow(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a credit sale later voided by reversal transaction
    WHEN calculate_outstanding_debts is called
    THEN voided sale is excluded from debt balances and totals
    """
    _add_product(initialized_context, "RP-P004", price="12.00")
    _add_salesman(initialized_context, "RP-S004")

    credit_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P004",
            salesman_id="RP-S004",
            quantity=Decimal("2"),
            total_revenue=Decimal("0.00"),
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=credit_sale.transaction_id),
    )

    report = bll.calculate_outstanding_debts(initialized_context)
    assert report["balances"] == []
    assert report["total_outstanding"] == Decimal("0.00")


@pytest.mark.parametrize("missing_reference_case", ["MISSING-RP-A", "MISSING-RP-B"])
def test_reporting_handles_missing_product_references_without_crashing(
    missing_reference_case: str,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN transaction records that reference missing product ids in debt calculations
    WHEN reporting APIs are called
    THEN processing continues safely and output remains structurally valid
    """
    _add_salesman(initialized_context, "RP-S005")
    dal.append_transaction(
        initialized_context.workbook,
        dal.TransactionRow(
            transaction_id=f"TX-{missing_reference_case}",
            timestamp_iso="2025-01-01T00:00:00+00:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id=missing_reference_case,
            salesman_id="RP-S005",
            payment_type=constants.PaymentType.ON_CREDIT.value,
            quantity_change=Decimal("-2"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes="synthetic missing product reference",
        ),
    )
    bll.invalidate_cache(initialized_context, "transactions")

    report = bll.calculate_outstanding_debts(initialized_context)
    assert "balances" in report
    assert "total_outstanding" in report


def test_reporting_outputs_remain_stable_after_context_reload(
    integration_config_path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN persisted workflow state produced in one runtime context
    WHEN a fresh context is loaded and the same reports are generated
    THEN report outputs are consistent with pre-reload results
    """
    _add_product(initialized_context, "RP-P006", price="9.00")
    _add_salesman(initialized_context, "RP-S006")

    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P006",
            salesman_id="RP-S006",
            quantity=Decimal("7"),
            total_revenue=Decimal("0.00"),
        ),
    )
    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P006",
            salesman_id="RP-S006",
            quantity=Decimal("2"),
            total_revenue=Decimal("18.00"),
            payment_type=constants.PaymentType.CASH,
        ),
    )

    inventory_before = bll.calculate_inventory(initialized_context)
    profit_before = bll.calculate_profit_summary(initialized_context)
    debts_before = bll.calculate_outstanding_debts(initialized_context)

    bll.persist_context(initialized_context)
    reloaded = bll.load_context(integration_config_path)

    inventory_after = bll.calculate_inventory(reloaded)
    profit_after = bll.calculate_profit_summary(reloaded)
    debts_after = bll.calculate_outstanding_debts(reloaded)

    assert inventory_after == inventory_before
    assert profit_after == profit_before
    assert debts_after["total_outstanding"] == debts_before["total_outstanding"]
