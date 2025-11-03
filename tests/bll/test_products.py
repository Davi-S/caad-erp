from decimal import Decimal
from unittest.mock import Mock

import pytest

from caad_erp import bll, dal, exceptions


def test_list_products_excludes_inactive_by_default(monkeypatch, context):
    """Given inactive catalog entries When listing without overrides Then inactive rows stay hidden."""

    # Arrange
    products = [
        dal.ProductRow("P1", "Active", Decimal("1.00"), True),
        dal.ProductRow("P2", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    # Act
    result = bll.list_products(context)

    # Assert
    assert [row.product_id for row in result] == ["P1"]
    iter_mock.assert_called_once_with(context.workbook)


def test_list_products_can_include_inactive(monkeypatch, context):
    """Given a cached product catalog When include_inactive is True Then inactive rows surface alongside active ones."""

    # Arrange
    products = [
        dal.ProductRow("P3", "Active", Decimal("1.00"), True),
        dal.ProductRow("P4", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)
    bll.list_products(context)
    iter_mock.reset_mock()

    # Act
    result = bll.list_products(context, include_inactive=True)

    # Assert
    assert {row.product_id for row in result} == {"P3", "P4"}
    iter_mock.assert_not_called()


def test_list_products_reuses_cache_between_calls(monkeypatch, context):
    """Given an empty cache When list_products executes twice Then the DAL is consulted only once."""

    # Arrange
    products = [
        dal.ProductRow("P-cache", "Cached", Decimal("1.00"), True),
        dal.ProductRow("P-inactive", "Hidden", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    # Act
    first = bll.list_products(context)
    second = bll.list_products(context)

    # Assert
    assert [row.product_id for row in first] == ["P-cache"]
    assert [row.product_id for row in second] == ["P-cache"]
    iter_mock.assert_called_once_with(context.workbook)


def test_get_product_returns_match(monkeypatch, context):
    """Given a known product When fetching by identifier Then the hydrated row matches the catalog."""

    # Arrange
    products = [dal.ProductRow("P10", "Cookie", Decimal("4.00"), True)]
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=products))

    # Act
    product = bll.get_product(context, "P10")

    # Assert
    assert product.product_name == "Cookie"


def test_get_product_missing_raises(monkeypatch, context):
    """Given an empty catalog When fetching an unknown product Then a missing reference error is raised."""

    # Arrange
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))

    # Act
    with pytest.raises(exceptions.MissingReferenceError) as exc_info:
        bll.get_product(context, "NOPE")

    # Assert
    assert "NOPE" in str(exc_info.value)


def test_get_product_reuses_cache_after_first_lookup(monkeypatch, context):
    """Given a fresh cache When get_product runs twice Then the second lookup reuses cached data."""

    # Arrange
    product_row = dal.ProductRow("P-cache", "Cached", Decimal("3.00"), True)
    iter_mock = Mock(return_value=[product_row])
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    # Act
    first = bll.get_product(context, "P-cache")
    second = bll.get_product(context, "P-cache")

    # Assert
    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_add_product_appends_record_and_invalidates_cache(monkeypatch, context):
    """Given a new product When add_product executes Then the row is persisted and cache is cleared."""

    # Arrange
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    # Act
    result = bll.add_product(
        context,
        product_id="SKU-001",
        product_name="Chocolate Bar",
        sell_price=Decimal("2.50"),
        is_active=True,
    )

    # Assert
    append_mock.assert_called_once()
    workbook_arg, record_arg = append_mock.call_args[0]
    assert workbook_arg is context.workbook
    assert record_arg == result
    assert result.product_id == "SKU-001"
    assert "products" not in context._cache


def test_add_product_rejects_duplicate_id(monkeypatch, context):
    """Given an existing ProductID When add_product runs with the same ID Then a business rule violation is raised."""

    # Arrange
    existing = dal.ProductRow("SKU-001", "Existing", Decimal("1.00"), True)
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[existing]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation):
        bll.add_product(
            context,
            product_id="SKU-001",
            product_name="New Product",
            sell_price=Decimal("1.50"),
            is_active=True,
        )

    # Assert
    append_mock.assert_not_called()


def test_add_product_rejects_negative_price(monkeypatch, context):
    """Given a negative price When add_product is invoked Then validation prevents persistence."""

    # Arrange
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    # Act
    with pytest.raises(ValueError):
        bll.add_product(
            context,
            product_id="SKU-NEG",
            product_name="Invalid",
            sell_price=Decimal("-0.01"),
            is_active=True,
        )

    # Assert
    append_mock.assert_not_called()


def test_update_product_delegates_and_refreshes_cache(monkeypatch, context):
    """Given a cached catalog When update_product runs Then DAL is called and cache refreshes."""

    # Arrange
    original_bucket: dict[str, object] = {}
    context._cache["products"] = original_bucket
    captured: dict[str, object] = {}

    def fake_update(workbook, product_id, *, field_values):
        captured["workbook"] = workbook
        captured["product_id"] = product_id
        captured["field_values"] = field_values

    updated_rows = [
        dal.ProductRow("SKU-001", "Retired Snack", Decimal("2.50"), False)
    ]

    monkeypatch.setattr(dal, "update_product", fake_update)
    monkeypatch.setattr(dal, "iter_products", Mock(return_value=updated_rows))

    # Act
    result = bll.update_product(context, "  SKU-001  ", is_active=False)

    # Assert
    assert result.product_id == "SKU-001"
    assert result.is_active is False
    assert captured["workbook"] is context.workbook
    assert captured["product_id"] == "SKU-001"
    assert captured["field_values"] == {"IsActive": False}
    assert context._cache["products"] is not original_bucket


def test_update_product_requires_changes(context):
    """Given no field updates When update_product runs Then validation raises ValueError."""

    # Arrange
    product_id = "SKU-002"

    # Act
    with pytest.raises(ValueError) as exc_info:
        bll.update_product(context, product_id)

    # Assert
    assert str(exc_info.value) == "At least one field must be provided to update"


def test_update_product_unknown_id_raises(monkeypatch, context):
    """Given an unknown product ID When update_product delegates to DAL Then a missing reference error surfaces."""

    # Arrange
    monkeypatch.setattr(
        dal,
        "update_product",
        Mock(side_effect=KeyError("Product not found")),
    )

    # Act
    with pytest.raises(exceptions.MissingReferenceError) as exc_info:
        bll.update_product(context, "UNKNOWN", is_active=False)

    # Assert
    assert "UNKNOWN" in str(exc_info.value)
