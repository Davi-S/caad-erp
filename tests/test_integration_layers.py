"""Integration tests describing the end-to-end CAAD ERP workflows.

These scenarios document how the data access and business logic layers should
collaborate. Some tests are expected to fail until the corresponding features
are implemented, but they record the workflows we plan to support.
"""

from __future__ import annotations

from decimal import Decimal

from caad_erp import constants, core_logic, data_manager


def _register_sample_product(context: core_logic.RuntimeContext, *, product_id: str, name: str, sell_price: Decimal) -> None:
    """Append a single active product to the workbook via the DAL."""

    # The DAL provides typed row helpers. Using them here documents the
    # intended call-site for business rules that seed catalog data.
    product_row = data_manager.ProductRow(
        product_id=product_id,
        product_name=name,
        sell_price=sell_price,
        is_active=True,
    )
    data_manager.append_product(context.workbook, product_row)


def test_sale_lifecycle_flow(runtime_context):
    """Walk through a stock, sale, and reporting cycle using both layers."""

    # Each scenario receives an isolated runtime context from the fixture.
    context = runtime_context

    _register_sample_product(
        context,
        product_id="P1001",
        name="Snickers",
        sell_price=Decimal("3.00"),
    )

    # Persist and reload so the test mirrors the lifecycle of the production
    # application where writes go to disk before subsequent operations.
    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P1001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_cost=Decimal("2.50"),
        notes="Initial stock",
    )
    # BLL validates that the product exists and that quantities/costs are sane
    # before appending to the immutable log via the DAL.
    restock_transaction = core_logic.record_restock(context, restock_command)

    sale_command = core_logic.SaleCommand(
        product_id="P1001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_revenue=Decimal("6.00"),
        payment_type=constants.PaymentType.CASH,
        notes="First sale",
    )
    # The sale should reduce inventory and contribute revenue in the summary.
    sale_transaction = core_logic.record_sale(context, sale_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P1001"] == Decimal("0")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("6.00")
    assert summary["total_cost"] == Decimal("-2.50")
    assert summary["profit"] == Decimal("3.50")

    # Persisting after transactions ensures data_manager writes the latest state.
    core_logic.persist_context(context)

    # Sanity check: recorded objects surface the expected transaction types.
    assert restock_transaction.transaction_type == constants.TransactionType.RESTOCK.value
    assert sale_transaction.transaction_type == constants.TransactionType.SALE.value


def test_credit_sale_payment_and_void_flow(runtime_context):
    """Document the credit sale, payment, and reversal + re-entry workflow."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P2001",
        name="Energy Bar",
        sell_price=Decimal("3.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P2001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("3"),
        total_cost=Decimal("3.75"),
        notes="Bulk restock",
    )
    core_logic.record_restock(context, restock_command)

    credit_sale_command = core_logic.SaleCommand(
        product_id="P2001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_revenue=Decimal("0.00"),
        payment_type=constants.PaymentType.ON_CREDIT,
        notes="Sold on credit",
    )
    # Credit sale intentionally logs zero revenue; payment captured later.
    credit_sale = core_logic.record_sale(context, credit_sale_command)

    payment_command = core_logic.CreditPaymentCommand(
        linked_transaction_id=credit_sale.transaction_id,
        salesman_id=context.settings.default_salesman_id,
        total_revenue=Decimal("6.00"),
        notes="Debt settled",
    )
    payment_transaction = core_logic.record_credit_payment(context, payment_command)

    void_command = core_logic.VoidCommand(
        linked_transaction_id=credit_sale.transaction_id,
        replacement_command=core_logic.SaleCommand(
            product_id="P2001",
            salesman_id=context.settings.default_salesman_id,
            quantity=Decimal("1"),
            total_revenue=Decimal("0.00"),
            payment_type=constants.PaymentType.ON_CREDIT,
            notes="Corrected quantity",
        ),
        notes="Fix quantity",
    )
    # The VOID should produce a reversal plus the corrected transaction.
    void_transactions = core_logic.record_void(context, void_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P2001"] == Decimal("2")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("6.00")
    assert summary["total_cost"] == Decimal("-3.75")
    assert summary["profit"] == Decimal("2.25")

    assert len(void_transactions) == 2
    void_txn, corrected_sale = void_transactions
    assert void_txn.transaction_type == constants.TransactionType.VOID.value
    assert corrected_sale.transaction_type == constants.TransactionType.SALE.value
    assert payment_transaction.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value

    core_logic.persist_context(context)
