from decimal import Decimal
from unittest.mock import Mock

from caad_erp import bll, constants, dal


def test_calculate_inventory_rolls_up_quantities(monkeypatch, context):
    """
    Given restock and sale entries 
    When inventory is calculated 
    Then on-hand quantity reflects both movements.
    """

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
    """
    Given a cached transaction list 
    When calculate_inventory runs again 
    Then no additional DAL reads occur.
    """

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
    """
    Given sales and restocks 
    When profit summary runs 
    Then totals aggregate revenue and cost.
    """

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
    """
    Given cached transactions 
    When profit summary recalculates 
    Then DAL iteration happens only once.
    """

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


def test_calculate_outstanding_debts_returns_balances(monkeypatch, context):
    """
    Given credit sales with partial payments 
    When outstanding debts are calculated 
    Then balances reflect remaining credit per sale.
    """

    # Arrange
    sale = dal.TransactionRow(
        transaction_id="T-credit",
        timestamp_iso="2025-10-30T04:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P-credit",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    payment = dal.TransactionRow(
        transaction_id="T-payment",
        timestamp_iso="2025-10-30T05:00:00",
        transaction_type=constants.TransactionType.CREDIT_PAYMENT.value,
        product_id="P-credit",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.PIX.value,
        quantity_change=Decimal("0"),
        total_revenue=Decimal("5.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id="T-credit",
        notes=None,
    )
    product = dal.ProductRow(
        product_id="P-credit",
        product_name="Snack",
        sell_price=Decimal("3.00"),
        is_active=True,
    )
    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=[sale, payment]))
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[product]))

    # Act
    report = bll.calculate_outstanding_debts(context)

    # Assert
    assert report["total_outstanding"] == Decimal("1.00")
    assert report["balances"] == [
        bll.OutstandingDebt(
            transaction_id="T-credit",
            timestamp_iso="2025-10-30T04:00:00",
            product_id="P-credit",
            salesman_id="S-DEFAULT",
            quantity=Decimal("2"),
            expected_amount=Decimal("6.00"),
            amount_paid=Decimal("5.00"),
            balance=Decimal("1.00"),
        )
    ]


def test_calculate_outstanding_debts_ignores_voided_sales(monkeypatch, context):
    """
    Given a credit sale and a void 
    When debts are calculated 
    Then the voided sale is excluded.
    """

    # Arrange
    sale = dal.TransactionRow(
        transaction_id="T-credit",
        timestamp_iso="2025-10-30T04:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P-credit",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    void = dal.TransactionRow(
        transaction_id="T-void",
        timestamp_iso="2025-10-30T04:30:00",
        transaction_type=constants.TransactionType.VOID.value,
        product_id="P-credit",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("2"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id="T-credit",
        notes=None,
    )
    product = dal.ProductRow(
        product_id="P-credit",
        product_name="Snack",
        sell_price=Decimal("3.00"),
        is_active=True,
    )
    monkeypatch.setattr(dal, "iter_transactions",
                        Mock(return_value=[sale, void]))
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[product]))

    # Act
    report = bll.calculate_outstanding_debts(context)

    # Assert
    assert report["balances"] == []
    assert report["total_outstanding"] == Decimal("0.00")


def test_calculate_outstanding_debts_reuses_caches(monkeypatch, context):
    """
    Given cached transactions and products 
    When debts are recalculated 
    Then DAL lookups occur only once per sheet.
    """

    # Arrange
    sale = dal.TransactionRow(
        transaction_id="T-credit",
        timestamp_iso="2025-10-30T04:00:00",
        transaction_type=constants.TransactionType.SALE.value,
        product_id="P-credit",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.ON_CREDIT.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
    product = dal.ProductRow(
        product_id="P-credit",
        product_name="Snack",
        sell_price=Decimal("2.50"),
        is_active=True,
    )
    iter_transactions_mock = Mock(return_value=[sale])
    iter_products_mock = Mock(return_value=[product])
    monkeypatch.setattr(dal, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(dal, "iter_products", iter_products_mock)

    # Act
    first = bll.calculate_outstanding_debts(context)
    second = bll.calculate_outstanding_debts(context)

    # Assert
    assert first == second
    iter_transactions_mock.assert_called_once_with(context.workbook)
    iter_products_mock.assert_called_once_with(context.workbook)
