from decimal import Decimal
from unittest.mock import Mock

from caad_erp import bll, constants, dal


def test_calculate_inventory_rolls_up_quantities(monkeypatch, context):
    """Given restock and sale entries When inventory is calculated Then on-hand quantity reflects both movements."""

    # Arrange
    transactions = [
        dal.TransactionRow(
            transaction_id="T100",
            timestamp_iso="2025-10-30T02:00:00",
            transaction_type=constants.TransactionType.RESTOCK.value,
            product_id="P10",
            salesman_id=None,
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("5"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("-10.00"),
            linked_transaction_id=None,
            notes=None,
        ),
        dal.TransactionRow(
            transaction_id="T101",
            timestamp_iso="2025-10-30T02:30:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P10",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-2"),
            total_revenue=Decimal("4.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        ),
    ]
    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=transactions))

    # Act
    inventory = bll.calculate_inventory(context)

    # Assert
    assert inventory["P10"] == Decimal("3")


def test_calculate_inventory_reuses_transaction_cache(monkeypatch, context):
    """Given a cached transaction list When calculate_inventory runs again Then no additional DAL reads occur."""

    # Arrange
    transactions = [
        dal.TransactionRow(
            transaction_id="T200",
            timestamp_iso="2025-10-30T02:45:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P11",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-1"),
            total_revenue=Decimal("2.50"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        )
    ]
    iter_mock = Mock(return_value=transactions)
    monkeypatch.setattr(dal, "iter_transactions", iter_mock)

    # Act
    first = bll.calculate_inventory(context)
    second = bll.calculate_inventory(context)

    # Assert
    assert first == {"P11": Decimal("-1")}
    assert second == {"P11": Decimal("-1")}
    iter_mock.assert_called_once_with(context.workbook)


def test_calculate_profit_summary_returns_totals(monkeypatch, context):
    """Given sales and restocks When profit summary runs Then totals aggregate revenue and cost."""

    # Arrange
    transactions = [
        dal.TransactionRow(
            transaction_id="T110",
            timestamp_iso="2025-10-30T03:00:00",
            transaction_type=constants.TransactionType.RESTOCK.value,
            product_id="P10",
            salesman_id=None,
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("5"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("-15.00"),
            linked_transaction_id=None,
            notes=None,
        ),
        dal.TransactionRow(
            transaction_id="T111",
            timestamp_iso="2025-10-30T03:15:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P10",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-5"),
            total_revenue=Decimal("25.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        ),
    ]
    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=transactions))

    # Act
    summary = bll.calculate_profit_summary(context)

    # Assert
    assert summary == {
        "total_revenue": Decimal("25.00"),
        "total_cost": Decimal("-15.00"),
        "profit": Decimal("10.00"),
    }


def test_calculate_profit_summary_reuses_transaction_cache(monkeypatch, context):
    """Given cached transactions When profit summary recalculates Then DAL iteration happens only once."""

    # Arrange
    transactions = [
        dal.TransactionRow(
            transaction_id="T210",
            timestamp_iso="2025-10-30T03:30:00",
            transaction_type=constants.TransactionType.RESTOCK.value,
            product_id="P12",
            salesman_id=None,
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("5"),
            total_revenue=Decimal("0.00"),
            total_cost=Decimal("-10.00"),
            linked_transaction_id=None,
            notes=None,
        ),
        dal.TransactionRow(
            transaction_id="T211",
            timestamp_iso="2025-10-30T03:45:00",
            transaction_type=constants.TransactionType.SALE.value,
            product_id="P12",
            salesman_id="S-DEFAULT",
            payment_type=constants.PaymentType.CASH.value,
            quantity_change=Decimal("-5"),
            total_revenue=Decimal("20.00"),
            total_cost=Decimal("0.00"),
            linked_transaction_id=None,
            notes=None,
        ),
    ]
    iter_mock = Mock(return_value=transactions)
    monkeypatch.setattr(dal, "iter_transactions", iter_mock)

    # Act
    first = bll.calculate_profit_summary(context)
    second = bll.calculate_profit_summary(context)

    # Assert
    assert first == {
        "total_revenue": Decimal("20.00"),
        "total_cost": Decimal("-10.00"),
        "profit": Decimal("10.00"),
    }
    assert second == first
    iter_mock.assert_called_once_with(context.workbook)
