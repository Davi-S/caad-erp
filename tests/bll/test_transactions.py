"""Unit tests verifying the CAAD ERP business logic layer via a mocked DAL."""

import datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest

from caad_erp import bll, constants, dal, exceptions


def test_list_transactions_returns_all_rows(monkeypatch, context):
    """Given ledger entries When list_transactions executes Then every row returns in order."""

    # Arrange
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

    # Act
    result = bll.list_transactions(context)

    # Assert
    assert result[0].transaction_id == "T1"
    iter_mock.assert_called_once_with(context.workbook)


def test_list_transactions_reuses_cache_between_calls(monkeypatch, context):
    """Given a cached transaction log When list_transactions runs again Then the DAL is consulted only once."""

    # Arrange
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

    # Act
    first = bll.list_transactions(context)
    second = bll.list_transactions(context)

    # Assert
    assert first == transactions
    assert second == transactions
    iter_mock.assert_called_once_with(context.workbook)


def test_get_transaction_returns_match(monkeypatch, context):
    """Given a known transaction When fetched by ID Then the matching ledger row is returned."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", Mock(return_value=transactions))

    # Act
    transaction = bll.get_transaction(context, "T55")

    # Assert
    assert transaction.transaction_type == constants.TransactionType.RESTOCK.value


def test_get_transaction_reuses_cache_after_first_lookup(monkeypatch, context):
    """Given a fresh cache When get_transaction is called twice Then only the first call hits the DAL."""

    # Arrange
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

    # Act
    first = bll.get_transaction(context, "T-cache")
    second = bll.get_transaction(context, "T-cache")

    # Assert
    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_record_sale_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """Given valid sale inputs When record_sale executes Then a sale transaction is persisted."""

    # Arrange
    products = [dal.ProductRow("P200", "Drink", Decimal("3.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-sale")
    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    fixed_now = datetime.datetime(2025, 10, 30, 18, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.SaleCommand(
        product_id="P200",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("7.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Evening sale",
    )

    # Act
    transaction = bll.record_sale(context, command)

    # Assert
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
    """Given a primed transaction cache When record_sale logs a new entry Then the cache invalidates and rebuilds."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 20, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.SaleCommand(
        product_id="P500",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Cache refresh",
    )

    # Act
    transaction = bll.record_sale(context, command)

    # Assert
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
    """Given valid restock inputs When record_restock executes Then a restock transaction is persisted."""

    # Arrange
    products = [dal.ProductRow("P201", "Snack", Decimal("2.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-restock")
    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    fixed_now = datetime.datetime(2025, 10, 30, 9, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.RestockCommand(
        product_id="P201",
        salesman_id="S-DEFAULT",
        quantity=Decimal("10"),
        total_cost=Decimal("-12.00"),
        notes="Morning restock",
    )

    # Act
    transaction = bll.record_restock(context, command)

    # Assert
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
    """Given an inactive salesman When record_restock is invoked Then a business rule violation is raised."""

    # Arrange
    products = [dal.ProductRow("P202", "Snack", Decimal("2.50"), True)]
    salesmen = [dal.SalesmanRow("S-RETIRED", "Sam", False)]
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=products))
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=salesmen))
    command = bll.RestockCommand(
        product_id="P202",
        salesman_id="S-RETIRED",
        quantity=Decimal("5"),
        total_cost=Decimal("-5.00"),
    )

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation) as exc_info:
        bll.record_restock(context, command)

    # Assert
    assert "S-RETIRED" in str(exc_info.value)


def test_record_restock_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """Given a primed cache When record_restock logs a new entry Then the cache invalidates and repopulates."""

    # Arrange
    product = dal.ProductRow("P600", "Restock Item", Decimal("3.00"), True)
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 21, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.RestockCommand(
        product_id="P600",
        salesman_id="S-DEFAULT",
        quantity=Decimal("4"),
        total_cost=Decimal("-8.00"),
        notes="Cache refresh",
    )

    # Act
    transaction = bll.record_restock(context, command)

    # Assert
    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache
    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-restock-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-restock-new"] is transaction
    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_write_off_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """Given a write-off request When record_write_off executes Then a write-off transaction is persisted."""

    # Arrange
    products = [dal.ProductRow("P202", "Fruit", Decimal("1.25"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-writeoff")
    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    fixed_now = datetime.datetime(2025, 10, 30, 12, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.WriteOffCommand(
        product_id="P202",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoiled",
    )

    # Act
    transaction = bll.record_write_off(context, command)

    # Assert
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
    """Given cached transactions When record_write_off runs Then the cache invalidates and repopulates."""

    # Arrange
    product = dal.ProductRow("P601", "WriteOff", Decimal("2.00"), True)
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 21, 30, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.WriteOffCommand(
        product_id="P601",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        notes="Cache refresh",
    )

    # Act
    transaction = bll.record_write_off(context, command)

    # Assert
    append_mock.assert_called_once_with(context.workbook, transaction)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache
    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-writeoff-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-writeoff-new"] is transaction
    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """Given a credit settlement When record_credit_payment executes Then a credit payment transaction is persisted."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    fixed_now = datetime.datetime(2025, 10, 30, 19, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("2.00"),
        payment_type=constants.PaymentType.PIX,
        notes="Settled",
    )

    # Act
    transaction = bll.record_credit_payment(context, command)

    # Assert
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
    """Given cached credit transactions When record_credit_payment runs Then the cache invalidates and repopulates."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [credit_sale]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 22, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.OTHER,
        notes="Cache refresh",
    )

    # Act
    transaction = bll.record_credit_payment(context, command)

    # Assert
    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache
    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-credit", "T-credit-new"]
    assert refreshed[-1] is transaction
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-credit-new"] is transaction
    assert transaction.payment_type == constants.PaymentType.OTHER.value
    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_rejects_inactive_salesman(monkeypatch, context):
    """Given an inactive collector When record_credit_payment runs Then a business rule violation blocks it."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", Mock(return_value=transactions))
    monkeypatch.setattr(
        dal,
        "iter_salesmen",
        Mock(return_value=[dal.SalesmanRow("S-INACTIVE", "Pat", False)]),
    )
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-INACTIVE",
        total_revenue=Decimal("1.00"),
        payment_type=constants.PaymentType.PIX,
    )

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation) as exc_info:
        bll.record_credit_payment(context, command)

    # Assert
    assert "S-INACTIVE" in str(exc_info.value)


def test_record_open_stock_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """Given a rollover command When record_open_stock executes Then an open stock transaction persists."""

    # Arrange
    products = [dal.ProductRow("P204", "Water", Decimal("1.50"), True)]
    salesmen = [dal.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-open")
    monkeypatch.setattr(dal, "iter_products", iter_products_mock)
    monkeypatch.setattr(dal, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    fixed_now = datetime.datetime(2025, 10, 30, 7, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.OpenStockCommand(
        product_id="P204",
        salesman_id="S-DEFAULT",
        quantity=Decimal("20"),
        total_revenue=Decimal("30.00"),
    )

    # Act
    transaction = bll.record_open_stock(context, command)

    # Assert
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
    """Given a cached ledger When record_open_stock stores a new row Then the cache is invalidated and rebuilt."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 23, 0, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.OpenStockCommand(
        product_id="P800",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_revenue=Decimal("5.00"),
    )

    # Act
    transaction = bll.record_open_stock(context, command)

    # Assert
    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache
    refreshed = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-open-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-open-new"] is transaction
    again = bll.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_void_creates_reversal_and_replacement(monkeypatch, context):
    """Given a voidable sale with replacement When record_void executes Then a reversal and replacement return in order."""

    # Arrange
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
    monkeypatch.setattr(bll.transactions, "validate_void_target", validate_void_target)
    monkeypatch.setattr(bll.transactions, "build_void_transaction", build_void_reversal)
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

    # Act
    results = bll.record_void(context, command)

    # Assert
    get_transaction.assert_called_once_with(context, "T-original")
    validate_void_target.assert_called_once_with(target)
    append_mock.assert_called_once_with(context.workbook, reversal)
    record_sale.assert_called_once_with(context, command.replacement_command)
    assert results == [reversal, replacement_result]


def test_record_void_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """Given cached transactions When record_void writes a reversal Then the cache invalidates and repopulates."""

    # Arrange
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
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "append_transaction", append_mock)
    monkeypatch.setattr(bll.transactions, "generate_transaction_id", generate_mock)
    initial = bll.list_transactions(context)
    assert initial == [target]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache
    fixed_now = datetime.datetime(2025, 10, 30, 23, 30, 0, tzinfo=datetime.UTC)
    set_fixed_datetime(fixed_now)
    command = bll.VoidCommand(
        linked_transaction_id="T-target",
        replacement_command=None,
        notes="Cache refresh",
    )

    # Act
    results = bll.record_void(context, command)

    # Assert
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
    """Given a timestamp When generate_transaction_id executes Then the identifier starts with the date stamp."""

    # Arrange
    when = datetime.datetime(2025, 10, 30, 12, 30, 0)

    # Act
    tx_id = bll.generate_transaction_id(when=when)

    # Assert
    assert tx_id.startswith("20251030")


def test_require_positive_quantity_rejects_nonpositive():
    """Given a nonpositive quantity When require_positive_quantity validates Then ValueError is raised."""

    # Arrange
    candidate = Decimal("0")

    # Act
    with pytest.raises(ValueError) as exc_info:
        bll.require_positive_quantity(candidate)

    # Assert
    assert isinstance(exc_info.value, ValueError)


def test_require_positive_quantity_accepts_positive():
    """Given a positive quantity When require_positive_quantity validates Then no error occurs."""

    # Arrange
    candidate = Decimal("1")

    # Act
    bll.require_positive_quantity(candidate)

    # Assert
    # No exception should be raised for a positive quantity.


def test_require_nonnegative_money_rejects_negative():
    """Given a negative currency value When require_nonnegative_money validates Then ValueError is raised."""

    # Arrange
    candidate = Decimal("-0.01")

    # Act
    with pytest.raises(ValueError) as exc_info:
        bll.require_nonnegative_money(candidate)

    # Assert
    assert isinstance(exc_info.value, ValueError)


def test_require_nonnegative_money_accepts_zero():
    """Given a nonnegative currency value When require_nonnegative_money validates Then execution continues without error."""

    # Arrange
    candidate = Decimal("0.00")

    # Act
    bll.require_nonnegative_money(candidate)

    # Assert
    # No exception should be raised for zero or positive values.


def test_validate_credit_sale_link_accepts_credit_sale():
    """Given a credit sale transaction When validate_credit_sale_link runs Then validation accepts it."""

    # Arrange
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

    # Act
    bll.validate_credit_sale_link(sale)

    # Assert
    # The absence of an exception confirms acceptance.


def test_validate_credit_sale_link_rejects_non_credit_sale():
    """Given a non-credit sale When validate_credit_sale_link runs Then a business rule violation raises."""

    # Arrange
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

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation) as exc_info:
        bll.validate_credit_sale_link(sale)

    # Assert
    assert isinstance(exc_info.value, exceptions.BusinessRuleViolation)


def test_validate_void_target_rejects_void_or_credit_payment():
    """Given an invalid void target When validate_void_target verifies Then a business rule violation is raised."""

    # Arrange
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

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation) as exc_info:
        bll.validate_void_target(void_txn)

    # Assert
    assert isinstance(exc_info.value, exceptions.BusinessRuleViolation)


def test_build_void_reversal_inverts_original():
    """Given a sale When build_void_transaction runs Then the reversal negates the original values."""

    # Arrange
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
    reversal_time = datetime.datetime(2025, 10, 30, 9, 30, 0)

    # Act
    reversal = bll.build_void_transaction(original, timestamp=reversal_time, notes="Fix")

    # Assert
    assert reversal.transaction_type == constants.TransactionType.VOID.value
    assert reversal.quantity_change == Decimal("2")
    assert reversal.total_revenue == Decimal("-4.00")


def test_build_sale_transaction_constructs_row():
    """Given a sale command When build_sale_transaction executes Then the row reflects the sale details."""

    # Arrange
    command = bll.SaleCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("6.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Morning",
    )
    timestamp = datetime.datetime(2025, 10, 30, 10, 0, 0)

    # Act
    row = bll.build_sale_transaction(command, transaction_id="T-build", timestamp=timestamp)

    # Assert
    assert row.transaction_type == constants.TransactionType.SALE.value
    assert row.quantity_change == Decimal("-2")


def test_build_restock_transaction_constructs_row():
    """Given a restock command When build_restock_transaction executes Then the row records the restock details."""

    # Arrange
    command = bll.RestockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("-8.00"),
        notes="Vendor delivery",
    )
    timestamp = datetime.datetime(2025, 10, 30, 11, 0, 0)

    # Act
    row = bll.build_restock_transaction(command, transaction_id="T-restock", timestamp=timestamp)

    # Assert
    assert row.transaction_type == constants.TransactionType.RESTOCK.value
    assert row.quantity_change == Decimal("5")
    assert row.salesman_id == "S-DEFAULT"


def test_build_write_off_transaction_constructs_row():
    """Given a write-off command When build_write_off_transaction executes Then the row mirrors the write-off."""

    # Arrange
    command = bll.WriteOffCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoilage",
    )
    timestamp = datetime.datetime(2025, 10, 30, 12, 0, 0)

    # Act
    row = bll.build_write_off_transaction(command, transaction_id="T-writeoff", timestamp=timestamp)

    # Assert
    assert row.transaction_type == constants.TransactionType.WRITE_OFF.value
    assert row.total_revenue == Decimal("0")
    assert row.total_cost == Decimal("0")
    assert row.salesman_id == "S-DEFAULT"


def test_build_credit_payment_transaction_constructs_row():
    """Given a credit payment command When build_credit_payment_transaction runs Then the row reflects the payment details."""

    # Arrange
    command = bll.CreditPaymentCommand(
        linked_transaction_id="Tcredit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.PIX,
        notes="Payment",
    )
    timestamp = datetime.datetime(2025, 10, 30, 13, 0, 0)

    # Act
    row = bll.build_credit_payment_transaction(
        command, transaction_id="T-payment", timestamp=timestamp)

    # Assert
    assert row.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert row.quantity_change == Decimal("0")
    assert row.total_revenue == Decimal("5.00")
    assert row.linked_transaction_id == "Tcredit"
    assert row.salesman_id == "S-DEFAULT"
    assert row.payment_type == constants.PaymentType.PIX.value


def test_build_open_stock_transaction_constructs_row():
    """Given an open stock command When build_open_stock_transaction executes Then the row seeds beginning balances."""

    # Arrange
    command = bll.OpenStockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("15"),
        total_revenue=Decimal("30.00"),
    )
    timestamp = datetime.datetime(2025, 10, 30, 14, 0, 0)

    # Act
    row = bll.build_open_stock_transaction(
        command, transaction_id="T-open", timestamp=timestamp)

    # Assert
    assert row.transaction_type == constants.TransactionType.OPEN_STOCK.value
    assert row.quantity_change == Decimal("15")
    assert row.total_revenue == Decimal("30.00")
    assert row.salesman_id == "S-DEFAULT"
