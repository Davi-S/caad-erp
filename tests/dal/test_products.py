from decimal import Decimal

import pytest

from caad_erp import dal  # noqa: E402
from caad_erp import constants


def test_iter_products_yields_product_rows(master_workbook_path):
    """iter_products should yield ProductRow instances for worksheet data."""

    workbook = dal.open_workbook(master_workbook_path)
    products = workbook[constants.SheetName.PRODUCTS.value]
    products.append(["P300", "Soda", "5.00", True])
    dal.save_workbook(workbook, master_workbook_path)

    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(refreshed))
    assert rows == [
        dal.ProductRow(
            product_id="P300",
            product_name="Soda",
            sell_price=Decimal("5.00"),
            is_active=True,
        )
    ]


def test_append_product_adds_row(master_workbook_path):
    """append_product should add the provided row to the worksheet."""

    workbook = dal.open_workbook(master_workbook_path)
    record = dal.ProductRow(
        product_id="P400",
        product_name="Juice",
        sell_price=Decimal("6.00"),
        is_active=False,
    )
    dal.append_product(workbook, record)
    dal.save_workbook(workbook, master_workbook_path)

    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(refreshed))
    assert any(row.product_id ==
               "P400" and row.is_active is False for row in rows)


def test_update_product_modifies_existing_row(master_workbook_path):
    """update_product should mutate values for the matching ProductID."""

    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.PRODUCTS.value]
    sheet.append(["P500", "Old", "1.00", True])
    dal.save_workbook(workbook, master_workbook_path)

    reloaded = dal.open_workbook(master_workbook_path)
    dal.update_product(
        reloaded,
        "P500",
        field_values={"ProductName": "New", "SellPrice": Decimal("2.00")},
    )
    dal.save_workbook(reloaded, master_workbook_path)

    final = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(final))
    assert any(row.product_id == "P500" and row.product_name ==
               "New" for row in rows)


def test_update_product_missing_raises(master_workbook_path):
    """Updating a nonexistent product should surface a KeyError."""

    workbook = dal.open_workbook(master_workbook_path)
    with pytest.raises(KeyError):
        dal.update_product(
            workbook, "NOPE", field_values={"ProductName": "X"})


def test_serialize_product_preserves_order():
    """serialize_product should follow the column ordering defined by setup."""

    record = dal.ProductRow("P1", "Name", Decimal("1.25"), True)
    assert dal.serialize_product(
        record) == ["P1", "Name", Decimal("1.25"), True]


def test_deserialize_product_constructs_dataclass():
    """deserialize_product should coerce worksheet values into ProductRow."""

    record = dal.deserialize_product(["P9", "Bar", "2.75", True])
    assert record.product_id == "P9"
    assert record.sell_price == Decimal("2.75")
