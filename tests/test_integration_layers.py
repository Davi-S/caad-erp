"""Integration tests describing the end-to-end CAAD ERP workflows.

These scenarios document how the data access and business logic layers should
collaborate. Some tests are expected to fail until the corresponding features
are implemented, but they record the workflows we plan to support.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from decimal import Decimal

import pytest

from caad_erp import cli, constants, core_logic


def _register_sample_product(context: core_logic.RuntimeContext, *, product_id: str, name: str, sell_price: Decimal) -> None:
    """Append a single active product through the business logic layer."""

    core_logic.add_product(
        context,
        product_id=product_id,
        product_name=name,
        sell_price=sell_price,
        is_active=True,
    )


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
        payment_type=constants.PaymentType.PIX,
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


def test_write_off_lifecycle_flow(runtime_context):
    """Record a restock followed by a write-off and verify downstream balances."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3001",
        name="Trail Mix",
        sell_price=Decimal("4.50"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P3001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("5"),
        total_cost=Decimal("12.50"),
        notes="Weekly replenishment",
    )
    restock_txn = core_logic.record_restock(context, restock_command)

    write_off_command = core_logic.WriteOffCommand(
        product_id="P3001",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        notes="Damaged in transit",
    )
    write_off_txn = core_logic.record_write_off(context, write_off_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3001"] == Decimal("3")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("0.00")
    assert summary["total_cost"] == Decimal("-12.50")
    assert summary["profit"] == Decimal("-12.50")

    assert restock_txn.transaction_type == constants.TransactionType.RESTOCK.value
    assert write_off_txn.transaction_type == constants.TransactionType.WRITE_OFF.value

    core_logic.persist_context(context)


def test_open_stock_rollover_flow(runtime_context):
    """Roll inventory forward with OPEN_STOCK and ensure subsequent sales reconcile."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3002",
        name="Cold Brew",
        sell_price=Decimal("5.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    open_stock_command = core_logic.OpenStockCommand(
        product_id="P3002",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("4"),
        total_revenue=Decimal("20.00"),
    )
    open_stock_txn = core_logic.record_open_stock(context, open_stock_command)

    sale_command = core_logic.SaleCommand(
        product_id="P3002",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("1"),
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Opening day sale",
    )
    sale_txn = core_logic.record_sale(context, sale_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3002"] == Decimal("3")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("25.00")
    assert summary["total_cost"] == Decimal("0.00")
    assert summary["profit"] == Decimal("25.00")

    assert open_stock_txn.transaction_type == constants.TransactionType.OPEN_STOCK.value
    assert sale_txn.transaction_type == constants.TransactionType.SALE.value

    core_logic.persist_context(context)


def test_restock_zero_cost_flow(runtime_context):
    """Restock with zero cost to ensure inventory rises without affecting costs."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3002-Z",
        name="Donated Snacks",
        sell_price=Decimal("1.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P3002-Z",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("8"),
        total_cost=Decimal("0.00"),
        notes="Community donation",
    )
    restock_txn = core_logic.record_restock(context, restock_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3002-Z"] == Decimal("8")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_cost"] == Decimal("0.00")
    assert summary["profit"] == Decimal("0.00")
    assert restock_txn.total_cost == Decimal("0.00")

    core_logic.persist_context(context)


def test_multiple_credit_payments_flow(runtime_context):
    """Split a credit settlement across multiple CREDIT_PAYMENT entries."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3003",
        name="Iced Tea",
        sell_price=Decimal("3.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P3003",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("10"),
        total_cost=Decimal("30.00"),
        notes="Seasonal stock",
    )
    core_logic.record_restock(context, restock_command)

    credit_sale_command = core_logic.SaleCommand(
        product_id="P3003",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("4"),
        total_revenue=Decimal("0.00"),
        payment_type=constants.PaymentType.ON_CREDIT,
        notes="Employee tab",
    )
    credit_sale = core_logic.record_sale(context, credit_sale_command)

    first_payment = core_logic.CreditPaymentCommand(
        linked_transaction_id=credit_sale.transaction_id,
        salesman_id=context.settings.default_salesman_id,
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.PIX,
        notes="Partial payment",
    )
    second_payment = core_logic.CreditPaymentCommand(
        linked_transaction_id=credit_sale.transaction_id,
        salesman_id=context.settings.default_salesman_id,
        total_revenue=Decimal("7.00"),
        payment_type=constants.PaymentType.OTHER,
        notes="Balance cleared",
    )

    payment_one = core_logic.record_credit_payment(context, first_payment)
    payment_two = core_logic.record_credit_payment(context, second_payment)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3003"] == Decimal("6")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("12.00")
    assert summary["total_cost"] == Decimal("-30.00")
    assert summary["profit"] == Decimal("-18.00")

    assert payment_one.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert payment_two.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value

    core_logic.persist_context(context)


def test_void_without_replacement_flow(runtime_context):
    """Void an erroneous sale without a replacement and verify balances reset."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3004",
        name="Protein Shake",
        sell_price=Decimal("4.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="P3004",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("4"),
        total_cost=Decimal("8.00"),
        notes="Morning batch",
    )
    core_logic.record_restock(context, restock_command)

    sale_command = core_logic.SaleCommand(
        product_id="P3004",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_revenue=Decimal("8.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Mistaken sale",
    )
    sale_txn = core_logic.record_sale(context, sale_command)

    void_command = core_logic.VoidCommand(
        linked_transaction_id=sale_txn.transaction_id,
        replacement_command=None,
        notes="Customer cancelled",
    )
    void_results = core_logic.record_void(context, void_command)

    assert len(void_results) == 1
    assert void_results[0].transaction_type == constants.TransactionType.VOID.value

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3004"] == Decimal("4")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("0.00")
    assert summary["total_cost"] == Decimal("-8.00")
    assert summary["profit"] == Decimal("-8.00")

    core_logic.persist_context(context)


def test_cli_restock_and_profit_reporting_flow(config_factory, monkeypatch):
    """Ensure the CLI restock command persists costs and the profit report surfaces them."""

    bundle = config_factory()
    product_id = "CLI-P3001"

    add_product_args = [
        "--config",
        str(bundle.config_path),
        "add-product",
        "--product-id",
        product_id,
        "--product-name",
        "CLI Granola",
        "--sell-price",
        "4.00",
    ]
    restock_args = [
        "--config",
        str(bundle.config_path),
        "restock",
        "--product-id",
        product_id,
        "--quantity",
        "5",
        "--total-cost",
        "15.00",
        "--salesman-id",
        bundle.default_salesman_id,
        "--notes",
        "CLI restock",
    ]
    profit_args = ["--config", str(bundle.config_path), "profit"]

    assert cli.main(add_product_args) == 0
    assert cli.main(restock_args) == 0

    summary_capture: dict[str, object] = {}
    original_summary = core_logic.calculate_profit_summary

    def capture_summary(context: core_logic.RuntimeContext):
        summary = original_summary(context)
        summary_capture["context"] = context
        summary_capture["summary"] = summary
        return summary

    monkeypatch.setattr(cli.core_logic, "calculate_profit_summary", capture_summary)

    assert cli.main(profit_args) == 0
    assert "summary" in summary_capture

    context = core_logic.load_runtime_context(bundle.config_path)
    core_logic.ensure_schema_version(context)
    expected_summary = original_summary(context)

    assert summary_capture["summary"] == expected_summary
    assert expected_summary["total_revenue"] == Decimal("0.00")
    assert expected_summary["total_cost"] == Decimal("-15.00")
    assert expected_summary["profit"] == Decimal("-15.00")


def test_sale_rejected_for_inactive_product_flow(runtime_context):
    """Sales against inactive products should surface a business rule violation."""

    context = runtime_context

    core_logic.add_product(
        context,
        product_id="P-INACTIVE",
        product_name="Seasonal Item",
        sell_price=Decimal("5.00"),
        is_active=False,
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    sale_command = core_logic.SaleCommand(
        product_id="P-INACTIVE",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("1"),
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Attempted sale",
    )

    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.record_sale(context, sale_command)

    assert core_logic.list_transactions(context) == []


def test_sale_rejected_for_inactive_salesman_flow(runtime_context):
    """Sales should fail when the referenced salesman is inactive."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P-ACTIVE",
        name="Active Product",
        sell_price=Decimal("3.00"),
    )

    core_logic.add_salesman(
        context,
        salesman_id="S-INACTIVE",
        salesman_name="On Leave",
        is_active=False,
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    sale_command = core_logic.SaleCommand(
        product_id="P-ACTIVE",
        salesman_id="S-INACTIVE",
        quantity=Decimal("1"),
        total_revenue=Decimal("3.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Attempt with inactive salesman",
    )

    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.record_sale(context, sale_command)

    transactions = core_logic.list_transactions(context)
    assert all(txn.salesman_id != "S-INACTIVE" for txn in transactions)


def test_stock_report_reflects_opening_balance_flow(runtime_context):
    """OPEN_STOCK entries should contribute to inventory calculations."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3005",
        name="Kombucha",
        sell_price=Decimal("4.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    open_stock_command = core_logic.OpenStockCommand(
        product_id="P3005",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("6"),
        total_revenue=Decimal("24.00"),
    )
    core_logic.record_open_stock(context, open_stock_command)

    restock_command = core_logic.RestockCommand(
        product_id="P3005",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_cost=Decimal("6.00"),
        notes="Top-up",
    )
    core_logic.record_restock(context, restock_command)

    sale_command = core_logic.SaleCommand(
        product_id="P3005",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("3"),
        total_revenue=Decimal("12.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Evening sales",
    )
    core_logic.record_sale(context, sale_command)

    inventory = core_logic.calculate_inventory(context)
    assert inventory["P3005"] == Decimal("5")

    core_logic.persist_context(context)


def test_cli_credit_sale_and_debt_report_flow(config_factory, monkeypatch):
    """Validate that CLI credit sales surface on the debts report pipeline."""

    bundle = config_factory()
    product_id = "CLI-CREDIT-1"

    exit_code = cli.main(
        [
            "--config",
            str(bundle.config_path),
            "add-product",
            "--product-id",
            product_id,
            "--product-name",
            "CLI Credit Item",
            "--sell-price",
            "7.50",
        ]
    )
    assert exit_code == 0

    exit_code = cli.main(
        [
            "--config",
            str(bundle.config_path),
            "sale",
            "--product-id",
            product_id,
            "--quantity",
            "2",
            "--salesman-id",
            bundle.default_salesman_id,
            "--total-revenue",
            "0",
            "--payment-type",
            constants.PaymentType.ON_CREDIT.value,
            "--notes",
            "CLI credit sale",
        ]
    )
    assert exit_code == 0

    context = core_logic.load_runtime_context(bundle.config_path)
    core_logic.ensure_schema_version(context)
    transactions = core_logic.list_transactions(context)
    credit_sales = [
        txn
        for txn in transactions
        if txn.transaction_type == constants.TransactionType.SALE.value
        and txn.payment_type == constants.PaymentType.ON_CREDIT.value
    ]
    assert credit_sales, "Expected at least one credit sale to be logged"
    sale_txn = credit_sales[-1]
    product_row = core_logic.get_product(context, product_id)
    expected_due = abs(sale_txn.quantity_change) * product_row.sell_price

    captured: dict[str, dict[str, Decimal]] = {}

    def compute_outstanding(context: core_logic.RuntimeContext) -> dict[str, Decimal]:
        products = {row.product_id: row for row in core_logic.list_products(context, include_inactive=True)}
        payments = defaultdict(Decimal)
        for txn in core_logic.list_transactions(context):
            if txn.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value and txn.linked_transaction_id:
                payments[txn.linked_transaction_id] += txn.total_revenue

        outstanding: dict[str, Decimal] = {}
        for txn in core_logic.list_transactions(context):
            if txn.transaction_type == constants.TransactionType.SALE.value and txn.payment_type == constants.PaymentType.ON_CREDIT.value:
                product_id = txn.product_id
                if product_id is None:
                    continue
                product = products.get(product_id)
                unit_price = product.sell_price if product is not None else Decimal("0")
                principal = abs(txn.quantity_change) * unit_price
                balance = principal - payments.get(txn.transaction_id, Decimal("0"))
                if balance > Decimal("0"):
                    outstanding[txn.transaction_id] = balance

        captured["summary"] = outstanding
        return outstanding

    monkeypatch.setattr(cli.core_logic, "calculate_outstanding_debts", compute_outstanding, raising=False)

    exit_code = cli.main(["--config", str(bundle.config_path), "debts"])
    assert exit_code == 0
    assert captured["summary"] == {sale_txn.transaction_id: expected_due}


def test_void_with_replacement_via_cli_flow(config_factory, monkeypatch):
    """Drive a void with a replacement command through the CLI helpers."""

    bundle = config_factory()
    context = core_logic.load_runtime_context(bundle.config_path)
    core_logic.ensure_schema_version(context)

    _register_sample_product(
        context,
        product_id="CLI-PVOID",
        name="CLI Smoothie",
        sell_price=Decimal("5.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    restock_command = core_logic.RestockCommand(
        product_id="CLI-PVOID",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("5"),
        total_cost=Decimal("12.50"),
        notes="Initial load",
    )
    core_logic.record_restock(context, restock_command)

    sale_command = core_logic.SaleCommand(
        product_id="CLI-PVOID",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("3"),
        total_revenue=Decimal("15.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Original sale",
    )
    sale_txn = core_logic.record_sale(context, sale_command)

    replacement_sale = core_logic.SaleCommand(
        product_id="CLI-PVOID",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("2"),
        total_revenue=Decimal("10.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Adjusted sale",
    )

    def fake_translate(args: argparse.Namespace) -> core_logic.VoidCommand:
        return core_logic.VoidCommand(
            linked_transaction_id=sale_txn.transaction_id,
            replacement_command=replacement_sale,
            notes="Quantity correction",
        )

    monkeypatch.setattr(cli, "translate_void", fake_translate)

    exit_code = cli.run_void(context, argparse.Namespace())
    assert exit_code == 0

    transactions = core_logic.list_transactions(context)
    void_txn, replacement_txn = transactions[-2:]
    assert void_txn.transaction_type == constants.TransactionType.VOID.value
    assert void_txn.linked_transaction_id == sale_txn.transaction_id
    assert replacement_txn.transaction_type == constants.TransactionType.SALE.value

    inventory = core_logic.calculate_inventory(context)
    assert inventory["CLI-PVOID"] == Decimal("3")

    summary = core_logic.calculate_profit_summary(context)
    assert summary["total_revenue"] == Decimal("10.00")
    assert summary["total_cost"] == Decimal("-12.50")
    assert summary["profit"] == Decimal("-2.50")

    core_logic.persist_context(context)


@pytest.mark.xfail(reason="Write-off guard against negative inventory not implemented", strict=False)
def test_write_off_during_negative_inventory_flow(runtime_context):
    """Write-offs should be rejected when no stock is available to deplete."""

    context = runtime_context

    _register_sample_product(
        context,
        product_id="P3006",
        name="Fragile Glass",
        sell_price=Decimal("2.00"),
    )

    core_logic.persist_context(context)
    context = core_logic.refresh_context(context)

    write_off_command = core_logic.WriteOffCommand(
        product_id="P3006",
        salesman_id=context.settings.default_salesman_id,
        quantity=Decimal("1"),
        notes="Lost in transit",
    )

    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.record_write_off(context, write_off_command)
