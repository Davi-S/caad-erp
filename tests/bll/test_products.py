from decimal import Decimal
from unittest.mock import Mock

import pytest

from caad_erp import bll
from caad_erp import dal


def test_list_products_excludes_inactive_by_default(monkeypatch, context):
    """list_products should hide inactive rows unless explicitly requested."""

    products = [
        dal.ProductRow("P1", "Active", Decimal("1.00"), True),
        dal.ProductRow("P2", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    result = bll.list_products(context)

    assert [row.product_id for row in result] == ["P1"]
    iter_mock.assert_called_once_with(context.workbook)


def test_list_products_can_include_inactive(monkeypatch, context):
    """A caller should be able to include inactive products when needed."""

    products = [
        dal.ProductRow("P3", "Active", Decimal("1.00"), True),
        dal.ProductRow("P4", "Inactive", Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    bll.list_products(context)
    iter_mock.reset_mock()

    result = bll.list_products(context, include_inactive=True)

    assert {row.product_id for row in result} == {"P3", "P4"}
    iter_mock.assert_not_called()


def test_list_products_reuses_cache_between_calls(monkeypatch, context):
    """list_products should populate the cache once and reuse it."""

    products = [
        dal.ProductRow("P-cache", "Cached", Decimal("1.00"), True),
        dal.ProductRow("P-inactive", "Hidden",
                       Decimal("2.00"), False),
    ]
    iter_mock = Mock(return_value=products)
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    first = bll.list_products(context)
    second = bll.list_products(context)

    assert [row.product_id for row in first] == ["P-cache"]
    assert [row.product_id for row in second] == ["P-cache"]
    iter_mock.assert_called_once_with(context.workbook)


def test_get_product_returns_match(monkeypatch, context):
    """get_product should hydrate a ProductRow for the requested ID."""

    products = [dal.ProductRow(
        "P10", "Cookie", Decimal("4.00"), True)]
    monkeypatch.setattr(dal, "iter_products",
                        Mock(return_value=products))

    product = bll.get_product(context, "P10")

    assert product.product_name == "Cookie"


def test_get_product_missing_raises(monkeypatch, context):
    """Unknown ProductIDs should raise MissingReferenceError."""

    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))

    with pytest.raises(bll.MissingReferenceError):
        bll.get_product(context, "NOPE")


def test_get_product_reuses_cache_after_first_lookup(monkeypatch, context):
    """Product lookups should rely on the cached ``by_id`` mapping."""

    product_row = dal.ProductRow(
        "P-cache", "Cached", Decimal("3.00"), True)
    iter_mock = Mock(return_value=[product_row])
    monkeypatch.setattr(dal, "iter_products", iter_mock)

    first = bll.get_product(context, "P-cache")
    second = bll.get_product(context, "P-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_add_product_appends_record_and_invalidates_cache(monkeypatch, context):
    """add_product should persist a ProductRow and flush cached catalog data."""

    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    result = bll.add_product(
        context,
        product_id="SKU-001",
        product_name="Chocolate Bar",
        sell_price=Decimal("2.50"),
        is_active=True,
    )

    append_mock.assert_called_once()
    workbook_arg, record_arg = append_mock.call_args[0]
    assert workbook_arg is context.workbook
    assert record_arg == result
    assert result.product_id == "SKU-001"
    assert "products" not in context._cache


def test_add_product_rejects_duplicate_id(monkeypatch, context):
    """Duplicate ProductIDs should surface a BusinessRuleViolation."""

    existing = dal.ProductRow(
        "SKU-001", "Existing", Decimal("1.00"), True)
    monkeypatch.setattr(dal, "iter_products",
                        Mock(return_value=[existing]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    with pytest.raises(bll.BusinessRuleViolation):
        bll.add_product(
            context,
            product_id="SKU-001",
            product_name="New Product",
            sell_price=Decimal("1.50"),
            is_active=True,
        )

    append_mock.assert_not_called()


def test_add_product_rejects_negative_price(monkeypatch, context):
    """add_product should reject negative sell_price values."""

    monkeypatch.setattr(dal, "iter_products", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_product", append_mock)

    with pytest.raises(ValueError):
        bll.add_product(
            context,
            product_id="SKU-NEG",
            product_name="Invalid",
            sell_price=Decimal("-0.01"),
            is_active=True,
        )

    append_mock.assert_not_called()


def test_update_product_delegates_and_refreshes_cache(monkeypatch, context):
    """update_product should call the DAL, clear caches, and reflect new data."""

    original_bucket: dict[str, object] = {}
    context._cache["products"] = original_bucket

    captured: dict[str, object] = {}

    def fake_update(workbook, product_id, *, field_values):
        captured["workbook"] = workbook
        captured["product_id"] = product_id
        captured["field_values"] = field_values

    updated_rows = [
        dal.ProductRow(
            "SKU-001", "Retired Snack", Decimal("2.50"), False)
    ]

    monkeypatch.setattr(dal, "update_product", fake_update)
    monkeypatch.setattr(dal, "iter_products",
                        Mock(return_value=updated_rows))

    result = bll.update_product(context, "  SKU-001  ", is_active=False)

    assert result.product_id == "SKU-001"
    assert result.is_active is False
    assert captured["workbook"] is context.workbook
    assert captured["product_id"] == "SKU-001"
    assert captured["field_values"] == {"IsActive": False}
    assert context._cache["products"] is not original_bucket


def test_update_product_requires_changes(context):
    """update_product should reject calls that provide no fields to update."""

    with pytest.raises(ValueError):
        bll.update_product(context, "SKU-002")


def test_update_product_unknown_id_raises(monkeypatch, context):
    """Missing products should surface as MissingReferenceError."""

    monkeypatch.setattr(
        dal,
        "update_product",
        Mock(side_effect=KeyError("Product not found")),
    )

    with pytest.raises(bll.MissingReferenceError):
        bll.update_product(context, "UNKNOWN", is_active=False)
