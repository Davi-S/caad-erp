"""Unit tests verifying the business logic layer with a mocked data access layer."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest

from caad_erp import constants, core_logic, data_manager


@pytest.fixture
def settings(tmp_path):
    return data_manager.ConfigSettings(
        data_file=tmp_path / "master_workbook.xlsx",
        lounge_name="Test Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S-DEFAULT",
    )


@pytest.fixture
def workbook():
    return Mock(name="workbook")


@pytest.fixture
def context(settings, workbook):
    return core_logic.RuntimeContext(settings=settings, workbook=workbook)


@pytest.fixture
def set_fixed_datetime(monkeypatch):
    """Patch core_logic.datetime.now to return a predetermined moment."""

    def _apply(moment: datetime) -> datetime:
        class _FixedDateTime:
            @staticmethod
            def now(tz=None):
                assert tz is UTC
                return moment

        monkeypatch.setattr(core_logic, "datetime", _FixedDateTime)
        return moment

    return _apply


# ---------------------------------------------------------------------------
# Runtime/context management
# ---------------------------------------------------------------------------


def test_load_runtime_context_returns_context(monkeypatch, tmp_path):
    """load_runtime_context should assemble settings and workbook into a context."""

    config_path = tmp_path / "config.ini"
    parser = Mock(name="parser")
    parsed_settings = data_manager.ConfigSettings(
        data_file=tmp_path / "master.xlsx",
        lounge_name="Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S-DEFAULT",
    )
    workbook = Mock(name="workbook")

    find_config_file = Mock(return_value=config_path)
    read_config = Mock(return_value=parser)
    parse_settings = Mock(return_value=parsed_settings)
    open_workbook = Mock(return_value=workbook)

    monkeypatch.setattr(data_manager, "find_config_file", find_config_file)
    monkeypatch.setattr(data_manager, "read_config", read_config)
    monkeypatch.setattr(data_manager, "parse_settings", parse_settings)
    monkeypatch.setattr(data_manager, "open_workbook", open_workbook)

    context = core_logic.load_runtime_context(config_path)

    assert context.settings is parsed_settings
    assert context.workbook is workbook
    find_config_file.assert_called_once_with(config_path)
    read_config.assert_called_once_with(config_path.resolve())
    parse_settings.assert_called_once_with(parser, base_path=config_path.resolve().parent)
    open_workbook.assert_called_once_with(parsed_settings.data_file)


def test_ensure_schema_version_rejects_mismatch(context):
    """Schema mismatches should surface a RuntimeError with clear messaging."""

    bad_settings = replace(context.settings, schema_version="0.9")
    bad_context = core_logic.RuntimeContext(settings=bad_settings, workbook=context.workbook)
    with pytest.raises(RuntimeError):
        core_logic.ensure_schema_version(bad_context)


def test_list_products_excludes_inactive_by_default(monkeypatch, context):
    """list_products should hide inactive rows unless explicitly requested."""

    products = [
        data_manager.ProductRow("P1", "Active", Decimal("1.00"), True),
        data_manager.ProductRow("P2", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(data_manager, "iter_products", iter_mock)

    result = core_logic.list_products(context)

    assert [row.product_id for row in result] == ["P1"]
    iter_mock.assert_called_once_with(context.workbook)


def test_list_products_can_include_inactive(monkeypatch, context):
    """A caller should be able to include inactive products when needed."""

    products = [
        data_manager.ProductRow("P3", "Active", Decimal("1.00"), True),
        data_manager.ProductRow("P4", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(data_manager, "iter_products", iter_mock)

    core_logic.list_products(context)
    iter_mock.reset_mock()

    result = core_logic.list_products(context, include_inactive=True)

    assert {row.product_id for row in result} == {"P3", "P4"}
    iter_mock.assert_not_called()


def test_list_products_reuses_cache_between_calls(monkeypatch, context):
    """list_products should populate the cache once and reuse it."""

    products = [
        data_manager.ProductRow("P-cache", "Cached", Decimal("1.00"), True),
        data_manager.ProductRow("P-inactive", "Hidden", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(data_manager, "iter_products", iter_mock)

    first = core_logic.list_products(context)
    second = core_logic.list_products(context)

    assert [row.product_id for row in first] == ["P-cache"]
    assert [row.product_id for row in second] == ["P-cache"]
    iter_mock.assert_called_once_with(context.workbook)


def test_list_salesmen_excludes_inactive_by_default(monkeypatch, context):
    """list_salesmen should filter inactive rows unless instructed otherwise."""

    salesmen = [
        data_manager.SalesmanRow("S2", "Active", True),
        data_manager.SalesmanRow("S3", "Retired", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    result = core_logic.list_salesmen(context)

    assert {row.salesman_id for row in result} == {"S2"}
    iter_mock.assert_called_once_with(context.workbook)


def test_list_salesmen_reuses_cache_between_calls(monkeypatch, context):
    """list_salesmen should only hit the data layer once per context."""

    salesmen = [
        data_manager.SalesmanRow("S-cache", "Cached", True),
        data_manager.SalesmanRow("S-inactive", "Hidden", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    first = core_logic.list_salesmen(context)
    second = core_logic.list_salesmen(context, include_inactive=True)

    assert {row.salesman_id for row in first} == {"S-cache"}
    assert {row.salesman_id for row in second} == {"S-cache", "S-inactive"}
    iter_mock.assert_called_once_with(context.workbook)


def test_list_transactions_returns_all_rows(monkeypatch, context):
    """list_transactions should return every ledger entry in order."""

    transactions = [
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", iter_mock)

    result = core_logic.list_transactions(context)

    assert result[0].transaction_id == "T1"
    iter_mock.assert_called_once_with(context.workbook)


def test_list_transactions_reuses_cache_between_calls(monkeypatch, context):
    """list_transactions should cache the transaction log after first load."""

    transactions = [
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", iter_mock)

    first = core_logic.list_transactions(context)
    second = core_logic.list_transactions(context)

    assert first == transactions
    assert second == transactions
    iter_mock.assert_called_once_with(context.workbook)


def test_get_product_returns_match(monkeypatch, context):
    """get_product should hydrate a ProductRow for the requested ID."""

    products = [data_manager.ProductRow("P10", "Cookie", Decimal("4.00"), True)]
    monkeypatch.setattr(data_manager, "iter_products", Mock(return_value=products))

    product = core_logic.get_product(context, "P10")

    assert product.product_name == "Cookie"


def test_get_product_missing_raises(monkeypatch, context):
    """Unknown ProductIDs should raise MissingReferenceError."""

    monkeypatch.setattr(data_manager, "iter_products", Mock(return_value=[]))

    with pytest.raises(core_logic.MissingReferenceError):
        core_logic.get_product(context, "NOPE")


def test_get_product_reuses_cache_after_first_lookup(monkeypatch, context):
    """Product lookups should rely on the cached ``by_id`` mapping."""

    product_row = data_manager.ProductRow("P-cache", "Cached", Decimal("3.00"), True)
    iter_mock = Mock(return_value=[product_row])
    monkeypatch.setattr(data_manager, "iter_products", iter_mock)

    first = core_logic.get_product(context, "P-cache")
    second = core_logic.get_product(context, "P-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_get_salesman_returns_match(monkeypatch, context):
    """get_salesman should fetch active salesmen."""

    salesmen = [data_manager.SalesmanRow("S8", "Jordan", True)]
    monkeypatch.setattr(data_manager, "iter_salesmen", Mock(return_value=salesmen))

    salesman = core_logic.get_salesman(context, "S8")

    assert salesman.salesman_name == "Jordan"


def test_get_salesman_reuses_cache_after_first_lookup(monkeypatch, context):
    """Salesman lookups should be served from cache after first access."""

    salesman_row = data_manager.SalesmanRow("S-cache", "Cached", True)
    iter_mock = Mock(return_value=[salesman_row])
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    first = core_logic.get_salesman(context, "S-cache")
    second = core_logic.get_salesman(context, "S-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_get_transaction_returns_match(monkeypatch, context):
    """get_transaction should retrieve ledger rows by ID."""

    transactions = [
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", Mock(return_value=transactions))

    transaction = core_logic.get_transaction(context, "T55")

    assert transaction.transaction_type == constants.TransactionType.RESTOCK.value


def test_get_transaction_reuses_cache_after_first_lookup(monkeypatch, context):
    """Repeated get_transaction calls should not rescan the workbook."""

    transaction_row = data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", iter_mock)

    first = core_logic.get_transaction(context, "T-cache")
    second = core_logic.get_transaction(context, "T-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_calculate_inventory_rolls_up_quantities(monkeypatch, context):
    """calculate_inventory should return total on-hand per ProductID."""

    transactions = [
        data_manager.TransactionRow(
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
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", Mock(return_value=transactions))

    inventory = core_logic.calculate_inventory(context)

    assert inventory["P10"] == Decimal("3")


def test_calculate_inventory_reuses_transaction_cache(monkeypatch, context):
    """calculate_inventory should reuse the cached transaction list."""

    transactions = [
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", iter_mock)

    first = core_logic.calculate_inventory(context)
    second = core_logic.calculate_inventory(context)

    assert first == {"P11": Decimal("-1")}
    assert second == {"P11": Decimal("-1")}
    iter_mock.assert_called_once_with(context.workbook)


def test_calculate_profit_summary_returns_totals(monkeypatch, context):
    """calculate_profit_summary should return total revenue, cost, and profit."""

    transactions = [
        data_manager.TransactionRow(
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
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", Mock(return_value=transactions))

    summary = core_logic.calculate_profit_summary(context)

    assert summary == {
        "total_revenue": Decimal("25.00"),
        "total_cost": Decimal("-15.00"),
        "profit": Decimal("10.00"),
    }


def test_calculate_profit_summary_reuses_transaction_cache(monkeypatch, context):
    """calculate_profit_summary should not rescan the workbook after caching."""

    transactions = [
        data_manager.TransactionRow(
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
        data_manager.TransactionRow(
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
    monkeypatch.setattr(data_manager, "iter_transactions", iter_mock)

    first = core_logic.calculate_profit_summary(context)
    second = core_logic.calculate_profit_summary(context)

    assert first == {"total_revenue": Decimal("20.00"), "total_cost": Decimal("-10.00"), "profit": Decimal("10.00")}
    assert second == first
    iter_mock.assert_called_once_with(context.workbook)


def test_record_sale_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_sale should validate inputs and append a SALE row."""

    products = [data_manager.ProductRow("P200", "Drink", Decimal("3.50"), True)]
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-sale")

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 18, 0, 0, tzinfo=UTC)

    set_fixed_datetime(fixed_now)
    command = core_logic.SaleCommand(
        product_id="P200",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("7.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Evening sale",
    )

    transaction = core_logic.record_sale(context, command)

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

    product = data_manager.ProductRow("P500", "Widget", Decimal("5.00"), True)
    salesman = data_manager.SalesmanRow("S-DEFAULT", "Alex", True)
    existing = data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 20, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.SaleCommand(
        product_id="P500",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        total_revenue=Decimal("5.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Cache refresh",
    )

    transaction = core_logic.record_sale(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-new"]
    assert refreshed[-1] is transaction
    assert "transactions" in context._cache
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-new"] is transaction

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_restock_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_restock should log incoming inventory with TotalCost."""

    products = [data_manager.ProductRow("P201", "Snack", Decimal("2.50"), True)]
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-restock")

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 9, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.RestockCommand(
        product_id="P201",
        salesman_id="S-DEFAULT",
        quantity=Decimal("10"),
        total_cost=Decimal("-12.00"),
        notes="Morning restock",
    )

    transaction = core_logic.record_restock(context, command)

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

    products = [data_manager.ProductRow("P202", "Snack", Decimal("2.50"), True)]
    salesmen = [data_manager.SalesmanRow("S-RETIRED", "Sam", False)]
    monkeypatch.setattr(data_manager, "iter_products", Mock(return_value=products))
    monkeypatch.setattr(data_manager, "iter_salesmen", Mock(return_value=salesmen))

    command = core_logic.RestockCommand(
        product_id="P202",
        salesman_id="S-RETIRED",
        quantity=Decimal("5"),
        total_cost=Decimal("-5.00"),
    )

    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.record_restock(context, command)


def test_record_restock_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_restock should invalidate and rebuild the transactions cache."""

    product = data_manager.ProductRow("P600", "Restock Item", Decimal("3.00"), True)
    salesman = data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 21, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.RestockCommand(
        product_id="P600",
        salesman_id="S-DEFAULT",
        quantity=Decimal("4"),
        total_cost=Decimal("-8.00"),
        notes="Cache refresh",
    )

    transaction = core_logic.record_restock(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-restock-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-restock-new"] is transaction

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_write_off_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_write_off should log shrink events with zero revenue/cost."""

    products = [data_manager.ProductRow("P202", "Fruit", Decimal("1.25"), True)]
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-writeoff")

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 12, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.WriteOffCommand(
        product_id="P202",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoiled",
    )

    transaction = core_logic.record_write_off(context, command)

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

    product = data_manager.ProductRow("P601", "WriteOff", Decimal("2.00"), True)
    salesman = data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 21, 30, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.WriteOffCommand(
        product_id="P601",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        notes="Cache refresh",
    )

    transaction = core_logic.record_write_off(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-writeoff-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-writeoff-new"] is transaction

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_credit_payment should log cash collection for credit sales."""

    transactions = [
        data_manager.TransactionRow(
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
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-payment")

    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 19, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("2.00"),
        notes="Settled",
    )

    transaction = core_logic.record_credit_payment(context, command)

    iter_transactions_mock.assert_called_once_with(context.workbook)
    iter_salesmen_mock.assert_called_once_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    append_mock.assert_called_once()
    saved_row = append_mock.call_args[0][1]
    assert saved_row.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert saved_row.linked_transaction_id == "T-credit"
    assert saved_row.salesman_id == "S-DEFAULT"
    assert saved_row.timestamp_iso == fixed_now.isoformat()
    assert transaction == saved_row


def test_record_credit_payment_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_credit_payment should invalidate and rebuild the transactions cache."""

    credit_sale = data_manager.TransactionRow(
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
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_salesmen_mock = Mock(return_value=salesmen)

    append_calls = []

    def _append_side_effect(workbook, row):
        append_calls.append((workbook, row))
        log_rows.append(row)

    append_mock = Mock(side_effect=_append_side_effect)
    generate_mock = Mock(return_value="T-credit-new")

    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [credit_sale]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 22, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        notes="Cache refresh",
    )

    transaction = core_logic.record_credit_payment(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-credit", "T-credit-new"]
    assert refreshed[-1] is transaction
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-credit-new"] is transaction

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_credit_payment_rejects_inactive_salesman(monkeypatch, context):
    """record_credit_payment should reject inactive collectors."""

    transactions = [
        data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_transactions", Mock(return_value=transactions))
    monkeypatch.setattr(data_manager, "iter_salesmen", Mock(return_value=[data_manager.SalesmanRow("S-INACTIVE", "Pat", False)]))

    command = core_logic.CreditPaymentCommand(
        linked_transaction_id="T-credit",
        salesman_id="S-INACTIVE",
        total_revenue=Decimal("1.00"),
    )

    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.record_credit_payment(context, command)


def test_record_open_stock_appends_transaction(monkeypatch, context, set_fixed_datetime):
    """record_open_stock should log baseline stock during rollover."""

    products = [data_manager.ProductRow("P204", "Water", Decimal("1.50"), True)]
    salesmen = [data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)]
    iter_products_mock = Mock(return_value=products)
    iter_salesmen_mock = Mock(return_value=salesmen)
    append_mock = Mock()
    generate_mock = Mock(return_value="T-open")

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    fixed_now = datetime(2025, 10, 30, 7, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.OpenStockCommand(
        product_id="P204",
        salesman_id="S-DEFAULT",
        quantity=Decimal("20"),
        total_revenue=Decimal("30.00"),
    )

    transaction = core_logic.record_open_stock(context, command)

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

    product = data_manager.ProductRow("P800", "Open", Decimal("1.00"), True)
    salesman = data_manager.SalesmanRow("S-DEFAULT", "Jamie", True)
    existing = data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_products", iter_products_mock)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_salesmen_mock)
    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [existing]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 23, 0, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.OpenStockCommand(
        product_id="P800",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_revenue=Decimal("5.00"),
    )

    transaction = core_logic.record_open_stock(context, command)

    append_mock.assert_called_once_with(context.workbook, transaction)
    iter_salesmen_mock.assert_called_with(context.workbook)
    generate_mock.assert_called_once_with(when=fixed_now)
    assert append_calls == [(context.workbook, transaction)]
    assert "transactions" not in context._cache

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-existing", "T-open-new"]
    assert refreshed[-1] is transaction
    assert transaction.salesman_id == "S-DEFAULT"
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["T-open-new"] is transaction

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is transaction


def test_record_void_creates_reversal_and_replacement(monkeypatch, context):
    """record_void should produce a VOID plus replacement transaction."""

    target = data_manager.TransactionRow(
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
    reversal = data_manager.TransactionRow(
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
    replacement_result = data_manager.TransactionRow(
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

    monkeypatch.setattr(core_logic, "get_transaction", get_transaction)
    monkeypatch.setattr(core_logic, "validate_void_target", validate_void_target)
    monkeypatch.setattr(core_logic, "build_void_reversal", build_void_reversal)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "record_sale", record_sale)

    command = core_logic.VoidCommand(
        linked_transaction_id="T-original",
        replacement_command=core_logic.SaleCommand(
            product_id="P205",
            salesman_id="S-DEFAULT",
            quantity=Decimal("1"),
            total_revenue=Decimal("2.00"),
            payment_type=constants.PaymentType.CASH,
            notes="Corrected",
        ),
        notes="Fix entry",
    )

    results = core_logic.record_void(context, command)

    get_transaction.assert_called_once_with(context, "T-original")
    validate_void_target.assert_called_once_with(target)
    append_mock.assert_called_once_with(context.workbook, reversal)
    record_sale.assert_called_once_with(context, command.replacement_command)
    assert results == [reversal, replacement_result]

def test_record_void_refreshes_transaction_cache(monkeypatch, context, set_fixed_datetime):
    """record_void should invalidate the transaction cache after appending a reversal."""

    target = data_manager.TransactionRow(
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

    monkeypatch.setattr(data_manager, "iter_transactions", iter_transactions_mock)
    monkeypatch.setattr(data_manager, "append_transaction", append_mock)
    monkeypatch.setattr(core_logic, "generate_transaction_id", generate_mock)

    initial = core_logic.list_transactions(context)
    assert initial == [target]
    assert iter_transactions_mock.call_count == 1
    assert "transactions" in context._cache

    fixed_now = datetime(2025, 10, 30, 23, 30, 0, tzinfo=UTC)
    set_fixed_datetime(fixed_now)
    command = core_logic.VoidCommand(
        linked_transaction_id="T-target",
        replacement_command=None,
        notes="Cache refresh",
    )

    results = core_logic.record_void(context, command)

    assert len(results) == 1
    reversal = results[0]
    append_mock.assert_called_once_with(context.workbook, reversal)
    generate_mock.assert_called_once_with(prefix="V", when=fixed_now)
    assert append_calls == [(context.workbook, reversal)]
    assert reversal.transaction_id == "V-new"
    assert reversal.timestamp_iso == fixed_now.isoformat()
    assert "transactions" not in context._cache
    assert iter_transactions_mock.call_count == 1

    refreshed = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert [row.transaction_id for row in refreshed] == ["T-target", "V-new"]
    assert refreshed[-1] is reversal
    cache_bucket = context._cache["transactions"]
    assert cache_bucket["by_id"]["V-new"] is reversal

    again = core_logic.list_transactions(context)
    assert iter_transactions_mock.call_count == 2
    assert again[-1] is reversal


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def test_generate_transaction_id_uses_timestamp():
    """Transaction IDs should be sortable and include the timestamp."""

    when = datetime(2025, 10, 30, 12, 30, 0)
    tx_id = core_logic.generate_transaction_id(when=when)
    assert tx_id.startswith("T20251030")


def test_require_positive_quantity_rejects_nonpositive():
    """Quantities of zero or less should raise ValueError."""

    with pytest.raises(ValueError):
        core_logic.require_positive_quantity(Decimal("0"))


def test_require_positive_quantity_accepts_positive():
    """Positive quantities should pass validation."""

    core_logic.require_positive_quantity(Decimal("1"))


def test_require_nonnegative_money_rejects_negative():
    """Negative currency values should raise ValueError."""

    with pytest.raises(ValueError):
        core_logic.require_nonnegative_money(Decimal("-0.01"))


def test_require_nonnegative_money_accepts_zero():
    """Zero or positive currency values should pass validation."""

    core_logic.require_nonnegative_money(Decimal("0.00"))


def test_persist_context_writes_to_disk(monkeypatch, context):
    """persist_context should flush workbook changes to disk."""

    save_mock = Mock()
    monkeypatch.setattr(data_manager, "save_workbook", save_mock)

    core_logic.persist_context(context)

    save_mock.assert_called_once_with(context.workbook, destination=context.settings.data_file)


def test_refresh_context_reloads_from_disk(monkeypatch, settings):
    """refresh_context should discard in-memory workbook state and reload."""

    refreshed_workbook = Mock(name="reloaded")
    refresh_mock = Mock(return_value=refreshed_workbook)
    monkeypatch.setattr(data_manager, "refresh_workbook", refresh_mock)

    original = core_logic.RuntimeContext(settings=settings, workbook=Mock())
    reloaded_context = core_logic.refresh_context(original)

    refresh_mock.assert_called_once_with(settings.data_file)
    assert reloaded_context.workbook is refreshed_workbook
    assert reloaded_context.settings is settings
    assert reloaded_context is not original


def test_validate_credit_sale_link_accepts_credit_sale():
    """validate_credit_sale_link should accept undisturbed credit sales."""

    sale = data_manager.TransactionRow(
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
    core_logic.validate_credit_sale_link(sale)


def test_validate_credit_sale_link_rejects_non_credit_sale():
    """validate_credit_sale_link should reject cash sales or mismatched entries."""

    sale = data_manager.TransactionRow(
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
    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.validate_credit_sale_link(sale)


def test_validate_void_target_rejects_void_or_credit_payment():
    """validate_void_target should reject transactions that cannot be voided."""

    void_txn = data_manager.TransactionRow(
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
    with pytest.raises(core_logic.BusinessRuleViolation):
        core_logic.validate_void_target(void_txn)


def test_build_void_reversal_inverts_original():
    """build_void_reversal should produce a transaction that cancels the original."""

    original = data_manager.TransactionRow(
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
    reversal = core_logic.build_void_reversal(original, timestamp=reversal_time, notes="Fix")
    assert reversal.transaction_type == constants.TransactionType.VOID.value
    assert reversal.quantity_change == Decimal("2")
    assert reversal.total_revenue == Decimal("-4.00")


def test_build_sale_transaction_constructs_row():
    """build_sale_transaction should convert commands into TransactionRow objects."""

    command = core_logic.SaleCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("2"),
        total_revenue=Decimal("6.00"),
        payment_type=constants.PaymentType.CASH,
        notes="Morning",
    )
    row = core_logic.build_sale_transaction(command, transaction_id="T-build", timestamp=datetime(2025, 10, 30, 10, 0, 0))
    assert row.transaction_type == constants.TransactionType.SALE.value
    assert row.quantity_change == Decimal("-2")


def test_build_restock_transaction_constructs_row():
    """build_restock_transaction should log positive quantities and negative cost."""

    command = core_logic.RestockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("-8.00"),
        notes="Vendor delivery",
    )
    row = core_logic.build_restock_transaction(command, transaction_id="T-restock", timestamp=datetime(2025, 10, 30, 11, 0, 0))
    assert row.transaction_type == constants.TransactionType.RESTOCK.value
    assert row.quantity_change == Decimal("5")
    assert row.salesman_id == "S-DEFAULT"


def test_build_write_off_transaction_constructs_row():
    """build_write_off_transaction should log negative quantity with zero revenue/cost."""

    command = core_logic.WriteOffCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
        notes="Spoilage",
    )
    row = core_logic.build_write_off_transaction(command, transaction_id="T-writeoff", timestamp=datetime(2025, 10, 30, 12, 0, 0))
    assert row.transaction_type == constants.TransactionType.WRITE_OFF.value
    assert row.total_revenue == Decimal("0")
    assert row.total_cost == Decimal("0")
    assert row.salesman_id == "S-DEFAULT"


def test_build_credit_payment_transaction_constructs_row():
    """build_credit_payment_transaction should log zero quantity with positive revenue."""

    command = core_logic.CreditPaymentCommand(
        linked_transaction_id="Tcredit",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("5.00"),
        notes="Payment",
    )
    row = core_logic.build_credit_payment_transaction(command, transaction_id="T-payment", timestamp=datetime(2025, 10, 30, 13, 0, 0))
    assert row.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value
    assert row.quantity_change == Decimal("0")
    assert row.total_revenue == Decimal("5.00")
    assert row.linked_transaction_id == "Tcredit"
    assert row.salesman_id == "S-DEFAULT"


def test_build_open_stock_transaction_constructs_row():
    """build_open_stock_transaction should seed balances with positive quantity and revenue."""

    command = core_logic.OpenStockCommand(
        product_id="P205",
        salesman_id="S-DEFAULT",
        quantity=Decimal("15"),
        total_revenue=Decimal("30.00"),
    )
    row = core_logic.build_open_stock_transaction(command, transaction_id="T-open", timestamp=datetime(2025, 10, 30, 14, 0, 0))
    assert row.transaction_type == constants.TransactionType.OPEN_STOCK.value
    assert row.quantity_change == Decimal("15")
    assert row.total_revenue == Decimal("30.00")
    assert row.salesman_id == "S-DEFAULT"
