"""Unit tests verifying the CAAD ERP business logic layer via a mocked DAL."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest

from caad_erp import bll, constants
from caad_erp import dal


def test_list_transactions_returns_all_rows(monkeypatch, context):
    """list_transactions should return every ledger entry in order."""

    transactions = [
        dal.TransactionRow(
            transaction_id="T1",
            timestamp_iso="2025-10-30T00:00:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P1",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-1"),
            total_revenue=Decimal("1.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        )
    ]
    iter_mock = Mock(return_value=transactions)
    monkeypatch.setattr(dal, "iter_transactions", iter_mock)

    result = bll.list_transactions(context)

    assert result[0].transaction_id == "T1"
    iter_mock.assert_called_once_with(context.workbook)


def test_list_transactions_reuses_cache_between_calls(monkeypatch, context):
    """list_transactions should cache the transaction log after first load."""

    transactions = [
        dal.TransactionRow(
            transaction_id="T-cache",
            timestamp_iso="2025-10-30T00:10:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P1",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-1"),
            total_revenue=Decimal("1.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        )
    ]
    iter_mock = Mock(return_value=transactions)
    monkeypatch.setattr(dal, "iter_transactions", iter_mock)

    first = bll.list_transactions(context)
    second = bll.list_transactions(context)

    assert first == transactions
    assert second == transactions
    iter_mock.assert_called_once_with(context.workbook)


def test_get_transaction_returns_match(monkeypatch, context):
    """get_transaction should retrieve ledger rows by ID."""

    transactions = [
        dal.TransactionRow(
            transaction_id="T55",
            timestamp_iso="2025-10-30T01:00:00",
            transaction_type=constants.TransactionType.RESTOCK.value,
            product_id="P10",
            salesman_id=None,
            payment_type=None,
            quantity_change=Decimal("10"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("-20.00"),
            linked_transaction_id=None,
            notes="Bulk",
        )
    ]
    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=transactions))

    transaction = bll.get_transaction(context, "T55")

    assert transaction.transaction_type == constants.TransactionType.RESTOCK.value


def test_get_transaction_reuses_cache_after_first_lookup(monkeypatch, context):
    """Repeated get_transaction calls should not rescan the workbook."""

    transaction_row = dal.TransactionRow(
        transaction_id="T-cache",
        timestamp_iso="2025-10-30T01:30:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P-cache",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("5.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    iter_mock = Mock(return_value=[transaction_row])
    monkeypatch.setattr(dal, "iter_transactions", iter_mock)

    first = bll.get_transaction(context, "T-cache")
    second = bll.get_transaction(context, "T-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_record_sale_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_sale should validate inputs and append a SALE row."""

    products = [dal.ProductRow(
        "P200", "Drink", Decimal("3.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-sale")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 18, 0, 0, tzinfo=UTC)

    set_fixed_datetime(fixed_now)
    command = bll.SaleCommand(
        product_id="P200",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("7.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Evening sale",
    )

    transaction = bll.record_sale(context, command)

    iter_products_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_workbook, saved_row = append_mock.call_args[0]
    assert saved_workbook is context.workbook
    assert saved_row.transaction_id == "T-sale"
    assert saved_row.transaction_type == constants.TransactionType.SALE.value
    assert transaction == saved_row


def test_record_sale_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_sale should invalidate and rebuild the transactions cache."""

    product = dal.ProductRow("P500", "Widget", Decimal("5.00"), True)
    salesman = dal.SalesmanRow("S-DEFAULT", "Alex", True)
    existing = dal.TransactionRow(
        transaction_id="T-existing",
        timestamp_iso="2025-10-30T00:45:00",
        transaction_type=constants.TransactionType.RESTOCK.value,
        product_id="P500",
        salesman_id=None,
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("5"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("-10.00"),
        linked_transaction_id=None,
        notes=None,
    )
    log_rows = [existing]

    iter_products_mock = Mock(return_value=[product])
    iter_salesmen_mock = Mock(return_value=[salesman])
    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-new")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 20, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.SaleCommand(
        product_id="P500",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Cache refresh",
    )

    transaction = bll.record_sale(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-new"]
    assert refreshed[-1] is transaction
    assert "transactions" in context._cache
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-new"] is transaction

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_restock_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_restock should log incoming inventory with TotalCost."""

    products = [dal.ProductRow(
        "P201", "Snack", Decimal("2.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-restock")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 9, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.RestockCommand(
        product_id="P201",
        salesman_id="S-DEFAULT",
        quantity=Decimal("10"),
        total_cost=Decimal("-12.00"),
        notes="Morning restock",
    )

    transaction = bll.record_restock(context, command)

    iter_products_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_row = append_mock.call_args[0][1]
    assert saved_row.transaction_type == constants.TransactionType.RESTOCK.value
    assert saved_row.quantity_change == Decimal("10")
    assert saved_row.salesman_id == "S-DEFAULT"
    assert transaction == saved_row


def test_record_restock_rejects_inactive_salesman(monkeypatch, context):
    """record_restock should reject inactive salesmen."""

    products = [dal.ProductRow(
        "P202", "Snack", Decimal("2.50"), True)]
    salesmen = [dal.SalesmanRow("S-RETIRED", "Sam", False)]
    monkeypatch.setattr(dal, "iter_products",
                        Mock(return_value=products))
    monkeypatch.setattr(dal, "iter_salesmen",
                        Mock(return_value=salesmen))

    command = bll.RestockCommand(
        product_id="P202",
        salesman_id="S-RETIRED",
        quantity=Decimal("5"),
        total_cost=Decimal("-5.00"),
    )

    with pytest.raises(bll.BusinessRuleViolation):
        bll.record_restock(context, command)


def test_record_restock_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_restock should invalidate and rebuild the transactions cache."""

    product = dal.ProductRow(
        "P600", "Restock Item", Decimal("3.00"), True)
    salesman = dal.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = dal.TransactionRow(
        transaction_id="T-existing",
        timestamp_iso="2025-10-30T06:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P600",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("3.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    log_rows = [existing]

    iter_products_mock = Mock(return_value=[product])
    iter_salesmen_mock = Mock(return_value=[salesman])
    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-restock-new")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 21, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.RestockCommand(
        product_id="P600",
        salesman_id="S-DEFAULT",
        quantity=Decimal("4"),
        total_cost=Decimal("-8.00"),
        notes="Cache refresh",
    )

    transaction = bll.record_restock(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == [
        "T-existing", "T-restock-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-restock-new"] is transaction

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_write_off_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_write_off should log shrink events with zero revenue/cost."""

    products = [dal.ProductRow(
        "P202", "Fruit", Decimal("1.25"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-writeoff")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 12, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.WriteOffCommand(
        product_id="P202",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoiled",
    )

    transaction = bll.record_write_off(context, command)

    iter_products_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_row = append_mock.call_args[0][1]
    assert saved_row.transaction_type == constants.TransactionType.WRITE_OFF.value
    assert saved_row.quantity_change == Decimal("-1")
    assert saved_row.salesman_id == "S-DEFAULT"
    assert saved_row.timestamp_iso == fixed_now.isoformat()
    assert transaction == saved_row


def test_record_write_off_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_write_off should invalidate and rebuild the transactions cache."""

    product = dal.ProductRow(
        "P601", "WriteOff", Decimal("2.00"), True)
    salesman = dal.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = dal.TransactionRow(
        transaction_id="T-existing",
        timestamp_iso="2025-10-30T06:30:00",
        transaction_type=constants.TransactionType.RESTOCK.value,
        product_id="P601",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("5"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("-10.00"),
        linked_transaction_id=None,
        notes=None,
    )
    log_rows = [existing]

    iter_products_mock = Mock(return_value=[product])
    iter_salesmen_mock = Mock(return_value=[salesman])
    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-writeoff-new")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 21, 30, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.WriteOffCommand(
        product_id="P601",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        notes="Cache refresh",
    )

    transaction = bll.record_write_off(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == [
        "T-existing", "T-writeoff-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-writeoff-new"] is transaction

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_credit_payment should log cash collection for credit sales."""

    transactions = [
        dal.TransactionRow(
            transaction_id="T-credit",
            timestamp_iso="2025-10-30T04:00:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P203",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.ON_CREDIT.value,
            quantity_change=Decimal("-2"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes="Credit sale",
        )
    ]
    iter_transactions_mock = Mock(return_value=transactions)
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-payment")

    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 19, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("2.00"),
        payment_type=constants.PaymentType.PIX,
        notes="Settled",
    )

    transaction = bll.record_credit_payment(context, command)

    iter_transactions_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_row = append_mock.call_args[0][1]
    assert saved_row.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert saved_row.linked_transaction_id == "T-credit"
    assert saved_row.salesman_id == "S-DEFAULT"
    assert saved_row.timestamp_iso == fixed_now.isoformat()
    assert saved_row.payment_type == constants.PaymentType.PIX.value
    assert transaction == saved_row


def test_record_credit_payment_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_credit_payment should invalidate and rebuild the transactions cache."""

    credit_sale = dal.TransactionRow(
        transaction_id="T-credit",
        timestamp_iso="2025-10-30T04:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P700",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Credit sale",
    )
    log_rows = [credit_sale]

    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_salesmen_mock = Mock(return_value=salesmen)

    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-credit-new")

    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [credit_sale]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 22, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.OTHER,
        notes="Cache refresh",
    )

    transaction = bll.record_credit_payment(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == [
        "T-credit", "T-credit-new"]
    assert refreshed[-1] is transaction
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-credit-new"] is transaction
    assert transaction.payment_type == constants.PaymentType.OTHER.value

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_rejects_inactive_salesman(monkeypatch, context):
    """record_credit_payment should reject inactive collectors."""

    transactions = [
        dal.TransactionRow(
            transaction_id="T-credit",
            timestamp_iso="2025-10-30T04:00:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P203",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.ON_CREDIT.value,
            quantity_change=Decimal("-2"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes="Credit sale",
        )
    ]

    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=transactions))
    monkeypatch.setattr(dal, "iter_salesmen", Mock(
        return_value=[dal.SalesmanRow("S-INACTIVE", "Pat", False)]))

    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-INACTIVE",
        total_revenue=Decimal("1.00"),
        payment_type=constants.PaymentType.PIX,
    )

    with pytest.raises(bll.BusinessRuleViolation):
        bll.record_credit_payment(context, command)


def test_record_open_stock_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_open_stock should log baseline stock during rollover."""

    products = [dal.ProductRow(
        "P204", "Water", Decimal("1.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-open")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 7, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.OpenStockCommand(
        product_id="P204",
        salesman_id="S-DEFAULT",
        quantity=Decimal("20"),
        total_revenue=Decimal("30.00"),
    )

    transaction = bll.record_open_stock(context, command)

    iter_products_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_row = append_mock.call_args[0][1]
    assert saved_row.transaction_type == constants.TransactionType.OPEN_STOCK.value
    assert saved_row.quantity_change == Decimal("20")
    assert saved_row.salesman_id == "S-DEFAULT"
    assert saved_row.timestamp_iso == fixed_now.isoformat()
    assert transaction == saved_row


def test_record_open_stock_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_open_stock should invalidate and rebuild the transactions cache."""

    product = dal.ProductRow("P800", "Open", Decimal("1.00"), True)
    salesman = dal.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = dal.TransactionRow(
        transaction_id="T-existing",
        timestamp_iso="2025-10-30T07:30:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P800",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("2.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    log_rows = [existing]

    iter_products_mock = Mock(return_value=[product])
    iter_salesmen_mock = Mock(return_value=[salesman])
    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-open-new")

    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 23, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.OpenStockCommand(
        product_id="P800",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_revenue=Decimal("5.00"),
    )

    transaction = bll.record_open_stock(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == [
        "T-existing", "T-open-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-open-new"] is transaction

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_void_creates_reversal_and_replacement(monkeypatch, context):
    """record_void should produce a VOID plus replacement transaction."""

    target = dal.TransactionRow(
        transaction_id="T-original",
        timestamp_iso="2025-10-30T05:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-3"),
        total_revenue=Decimal("6.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Incorrect quantity",
    )
    reversal = dal.TransactionRow(
        transaction_id="V1",
        timestamp_iso="2025-10-30T05:10:00",
        transaction_type=constants.TransactionType.VOID.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("3"),
        total_revenue=Decimal("-6.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id="T-original",
        notes="Fix entry",
    )
    replacement_result = dal.TransactionRow(
        transaction_id="T-replacement",
        timestamp_iso="2025-10-30T05:10:30",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("2.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Corrected",
    )

    get_transaction = Mock(return_value=target)
    validate_void_target = Mock()
    build_void_reversal = Mock(return_value=reversal)
    append_mock = Mock()
    record_sale = Mock(return_value=replacement_result)

    monkeypatch.setattr(bll.transactions, "get_transaction", get_transaction)
    monkeypatch.setattr(
        bll.transactions, "validate_void_target", validate_void_target)
    monkeypatch.setattr(
        bll.transactions, "build_void_transaction", build_void_reversal)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "record_sale", record_sale)

    command = bll.VoidCommand(
        linked_transaction_id="T-original",
        replacement_command=bll.SaleCommand(
            product_id="P205",
            salesman_id="S-DEFAULT",
            quantity=Decimal("1"),
            total_revenue=Decimal("2.00"),
            payment_type=constants.PaymentType.CASH,
            notes="Corrected",
        ),
        notes="Fix entry",
    )

    results = bll.record_void(context, command)

    get_transaction.assert_called_once_with(context, "T-original")
    validate_void_target.assert_called_once_with(target)
    append_mock.assert_called_once_with(context.workbook, reversal)
    record_sale.assert_called_once_with(context, command.replacement_command)
    assert results == [reversal, replacement_result]


def test_record_void_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_void should invalidate the transaction cache after appending a reversal."""

    target = dal.TransactionRow(
        transaction_id="T-target",
        timestamp_iso="2025-10-30T05:30:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P900",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("4.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Original",
    )
    log_rows = [target]

    iter_transactions_mock = Mock(side_effect=lambda _workbook: list(log_rows))
    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="V-new")

    monkeypatch.setattr(dal, "iter_transactions",
                        iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(
        bll.transactions, "generate_transaction_id", generate_mock)

    initial = bll.list_transactions(context)
    assert initial == [target]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 23, 30, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = bll.VoidCommand(
        linked_transaction_id="T-target",
        replacement_command=None,
        notes="Cache refresh",
    )

    results = bll.record_void(context, command)

    assert len(results) == 1
    reversal = results[0]
    append_mock.assert_called_once_with(context.workbook, reversal)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, reversal)]
    assert reversal.transaction_id == "V-new"
    assert reversal.timestamp_iso == fixed_now.isoformat()
    assert "transactions" not in context._cache
    assert iter_transactions_mock.call_count == 1

    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-target", "V-new"]
    assert refreshed[-1] is reversal
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["V-new"] is reversal

    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is reversal


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def test_generate_transaction_id_uses_timestamp():
    """Transaction IDs should be sortable and include the timestamp."""

    when = datetime(2025, 10, 30, 12, 30, 0)
    tx_id = bll.generate_transaction_id(when=when)
    assert tx_id.startswith("20251030")


def test_require_positive_quantity_rejects_nonpositive():
    """Quantities of zero or less should raise ValueError."""

    with pytest.raises(ValueError):
        bll.require_positive_quantity(Decimal("0"))


def test_require_positive_quantity_accepts_positive():
    """Positive quantities should pass validation."""

    bll.require_positive_quantity(Decimal("1"))


def test_require_nonnegative_money_rejects_negative():
    """Negative currency values should raise ValueError."""

    with pytest.raises(ValueError):
        bll.require_nonnegative_money(Decimal("-0.01"))


def test_require_nonnegative_money_accepts_zero():
    """Zero or positive currency values should pass validation."""

    bll.require_nonnegative_money(Decimal("0.00"))


def test_validate_credit_sale_link_accepts_credit_sale():
    """validate_credit_sale_link should accept undisturbed credit sales."""

    sale = dal.TransactionRow(
        transaction_id="Tcredit",
        timestamp_iso="2025-10-30T07:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    bll.validate_credit_sale_link(sale)


def test_validate_credit_sale_link_rejects_non_credit_sale():
    """validate_credit_sale_link should reject cash sales or mismatched entries."""

    sale = dal.TransactionRow(
        transaction_id="Tcash",
        timestamp_iso="2025-10-30T07:30:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("2.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    with pytest.raises(bll.BusinessRuleViolation):
        bll.validate_credit_sale_link(sale)


def test_validate_void_target_rejects_void_or_credit_payment():
    """validate_void_target should reject transactions that cannot be voided."""

    void_txn = dal.TransactionRow(
        transaction_id="Tvoid",
        timestamp_iso="2025-10-30T08:00:00",
        transaction_type=constants.TransactionType.VOID.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("1"),
        total_revenue=Decimal("-2.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id="Torig",
        notes=None,
    )
    with pytest.raises(bll.BusinessRuleViolation):
        bll.validate_void_target(void_txn)


def test_build_void_reversal_inverts_original():
    """build_void_reversal should produce a transaction that cancels the original."""

    original = dal.TransactionRow(
        transaction_id="Torig",
        timestamp_iso="2025-10-30T09:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P205",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("4.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Original",
    )
    reversal_time = datetime(2025, 10, 30, 9, 30, 0)
    reversal = bll.build_void_transaction(
        original, timestamp=reversal_time, notes="Fix")
    assert reversal.transaction_type == constants.TransactionType.VOID.value
    assert reversal.quantity_change == Decimal("2")
    assert reversal.total_revenue == Decimal("-4.00")


def test_build_sale_transaction_constructs_row():
    """build_sale_transaction should convert commands into TransactionRow objects."""

    command = bll.SaleCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("6.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Morning",
    )
    row = bll.build_sale_transaction(
        command, transaction_id="T-build", timestamp=datetime(2025, 10, 30, 10, 0, 0))
    assert row.transaction_type == constants.TransactionType.SALE.value
    assert row.quantity_change == Decimal("-2")


def test_build_restock_transaction_constructs_row():
    """build_restock_transaction should log positive quantities and negative cost."""

    command = bll.RestockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("-8.00"),
        notes="Vendor delivery",
    )
    row = bll.build_restock_transaction(
        command, transaction_id="T-restock", timestamp=datetime(2025, 10, 30, 11, 0, 0))
    assert row.transaction_type == constants.TransactionType.RESTOCK.value
    assert row.quantity_change == Decimal("5")
    assert row.salesman_id == "S-DEFAULT"


def test_build_write_off_transaction_constructs_row():
    """build_write_off_transaction should log negative quantity with zero revenue/cost."""

    command = bll.WriteOffCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoilage",
    )
    row = bll.build_write_off_transaction(
        command, transaction_id="T-writeoff", timestamp=datetime(2025, 10, 30, 12, 0, 0))
    assert row.transaction_type == constants.TransactionType.WRITE_OFF.value
    assert row.total_revenue == Decimal("0")
    assert row.total_cost == Decimal("0")
    assert row.salesman_id == "S-DEFAULT"


def test_build_credit_payment_transaction_constructs_row():
    """build_credit_payment_transaction should log zero quantity with positive revenue."""

    command = bll.CreditPaymentCommand(
        linked_transaction_id="Tcredit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.PIX,
        notes="Payment",
    )
    row = bll.build_credit_payment_transaction(
        command, transaction_id="T-payment", timestamp=datetime(2025, 10, 30, 13, 0, 0))
    assert row.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert row.quantity_change == Decimal("0")
    assert row.total_revenue == Decimal("5.00")
    assert row.linked_transaction_id == "Tcredit"
    assert row.salesman_id == "S-DEFAULT"
    assert row.payment_type == constants.PaymentType.PIX.value


def test_build_open_stock_transaction_constructs_row():
    """build_open_stock_transaction should seed balances with positive quantity and revenue."""

    command = bll.OpenStockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("15"),
        total_revenue=Decimal("30.00"),
    )
    row = bll.build_open_stock_transaction(
        command, transaction_id="T-open", timestamp=datetime(2025, 10, 30, 14, 0, 0))
    assert row.transaction_type == constants.TransactionType.OPEN_STOCK.value
    assert row.quantity_change == Decimal("15")
    assert row.total_revenue == Decimal("30.00")
    assert row.salesman_id == "S-DEFAULT"
