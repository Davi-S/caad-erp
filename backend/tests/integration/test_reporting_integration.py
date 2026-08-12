import pytest

from caad_erp import bll, constants, dal


def _add_product(
    context: bll.RuntimeContext, product_id: str, price: int = 1000
) -> None:
    bll.add_product(
        context,
        bll.ProductCommand(
            product_id=product_id,
            product_name=f"Product {product_id}",
            sell_price=price,
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
            quantity=10,
            total_revenue=0,
        ),
    )
    sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=3,
            total_revenue=3000,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=4,
            total_cost=1200,
        ),
    )
    bll.record_write_off(
        initialized_context,
        bll.WriteOffCommand(
            product_id="RP-P001",
            salesman_id="RP-S001",
            quantity=2,
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=sale.transaction_id),
    )

    inventory = bll.calculate_inventory(initialized_context)
    assert inventory["RP-P001"] == 12


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

    bll.record_restock(
        initialized_context,
        bll.RestockCommand(
            product_id="RP-P002",
            salesman_id="RP-S002",
            quantity=2,
            total_cost=750,
        ),
    )
    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P002",
            salesman_id="RP-S002",
            quantity=1,
            total_revenue=3000,
            payment_type=constants.PaymentType.CASH,
        ),
    )

    summary = bll.calculate_profit_summary(initialized_context)
    assert summary["total_revenue"] == 3000
    assert summary["total_cost"] == -750
    assert summary["profit"] == 2250


def test_outstanding_debts_report_tracks_partial_and_full_credit_payments(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN credit sales with different payment progress states
    WHEN calculate_outstanding_debts is called
    THEN balances include only unpaid portions and exclude fully settled sales
    """
    _add_product(initialized_context, "RP-P003", price=1000)
    _add_salesman(initialized_context, "RP-S003")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P003",
            salesman_id="RP-S003",
            quantity=10,
            total_revenue=0,
        ),
    )

    partially_paid_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P003",
            salesman_id="RP-S003",
            quantity=2,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    fully_paid_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P003",
            salesman_id="RP-S003",
            quantity=1,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )

    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=partially_paid_sale.transaction_id,
            salesman_id="RP-S003",
            total_revenue=500,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=fully_paid_sale.transaction_id,
            salesman_id="RP-S003",
            total_revenue=1000,
            payment_type=constants.PaymentType.PIX,
        ),
    )

    report = bll.calculate_outstanding_debts(initialized_context)
    debts_by_id = {debt.transaction_id: debt for debt in report["balances"]}
    assert partially_paid_sale.transaction_id in debts_by_id
    assert fully_paid_sale.transaction_id not in debts_by_id
    assert debts_by_id[partially_paid_sale.transaction_id].balance == 1500
    assert report["total_outstanding"] == 1500


def test_outstanding_debts_excludes_voided_credit_sales_in_end_to_end_flow(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN a credit sale later voided by reversal transaction
    WHEN calculate_outstanding_debts is called
    THEN voided sale is excluded from debt balances and totals
    """
    _add_product(initialized_context, "RP-P004", price=1200)
    _add_salesman(initialized_context, "RP-S004")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P004",
            salesman_id="RP-S004",
            quantity=10,
            total_revenue=0,
        ),
    )

    credit_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P004",
            salesman_id="RP-S004",
            quantity=2,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    bll.record_void(
        initialized_context,
        bll.VoidCommand(linked_transaction_id=credit_sale.transaction_id),
    )

    report = bll.calculate_outstanding_debts(initialized_context)
    assert report["balances"] == []
    assert report["total_outstanding"] == 0


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
            quantity_change=-2,
            total_revenue=0,
            total_cost=0,
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
    _add_product(initialized_context, "RP-P006", price=900)
    _add_salesman(initialized_context, "RP-S006")

    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P006",
            salesman_id="RP-S006",
            quantity=7,
            total_revenue=0,
        ),
    )
    bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P006",
            salesman_id="RP-S006",
            quantity=2,
            total_revenue=1800,
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


def test_outstanding_debts_ignores_overpaid_sales_and_aggregates_remaining_balances(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN multiple credit sales across products where one sale is overpaid and another is partially paid
    WHEN calculate_outstanding_debts is executed
    THEN only positive remaining balances are reported and total outstanding is aggregated correctly
    """
    _add_product(initialized_context, "RP-P007", price=1000)
    _add_product(initialized_context, "RP-P008", price=600)
    _add_salesman(initialized_context, "RP-S007")
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P007",
            salesman_id="RP-S007",
            quantity=10,
            total_revenue=0,
        ),
    )
    bll.record_open_stock(
        initialized_context,
        bll.OpenStockCommand(
            product_id="RP-P008",
            salesman_id="RP-S007",
            quantity=10,
            total_revenue=0,
        ),
    )

    overpaid_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P007",
            salesman_id="RP-S007",
            quantity=1,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )
    partial_sale = bll.record_sale(
        initialized_context,
        bll.SaleCommand(
            product_id="RP-P008",
            salesman_id="RP-S007",
            quantity=3,
            total_revenue=0,
            payment_type=constants.PaymentType.ON_CREDIT,
        ),
    )

    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=overpaid_sale.transaction_id,
            salesman_id="RP-S007",
            total_revenue=1200,
            payment_type=constants.PaymentType.CASH,
        ),
    )
    bll.record_credit_payment(
        initialized_context,
        bll.CreditPaymentCommand(
            linked_transaction_id=partial_sale.transaction_id,
            salesman_id="RP-S007",
            total_revenue=400,
            payment_type=constants.PaymentType.PIX,
        ),
    )

    report = bll.calculate_outstanding_debts(initialized_context)
    balances_by_id = {row.transaction_id: row for row in report["balances"]}

    assert overpaid_sale.transaction_id not in balances_by_id
    assert partial_sale.transaction_id in balances_by_id
    assert balances_by_id[partial_sale.transaction_id].expected_amount == 1800
    assert balances_by_id[partial_sale.transaction_id].amount_paid == 400
    assert balances_by_id[partial_sale.transaction_id].balance == 1400
    assert report["total_outstanding"] == 1400
