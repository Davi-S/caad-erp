from decimal import Decimal

import pytest

from caad_erp import dal, constants


def test_iter_products_yields_product_rows(master_workbook_path):
    """
    Given a workbook with product data 
    When iter_products runs 
    Then ProductRow instances stream back.
    """

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    products = workbook[constants.SheetName.PRODUCTS.value]
    products.append(["P300", "Soda", "5.00", True])
    dal.save_workbook(workbook, master_workbook_path)

    # Act
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(refreshed))

    # Assert
    assert rows == [
        dal.ProductRow(
            product_id="P300",
            product_name="Soda",
            sell_price=Decimal("5.00"),
            is_active=True,
        )
    ]


def test_append_product_adds_row(master_workbook_path):
    """
    Given a product record 
    When append_product runs 
    Then the workbook gains the new row.
    """

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    record = dal.ProductRow(
        product_id="P400",
        product_name="Juice",
        sell_price=Decimal("6.00"),
        is_active=False,
    )

    # Act
    dal.append_product(workbook, record)
    dal.save_workbook(workbook, master_workbook_path)
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(refreshed))

    # Assert
    assert any(row.product_id ==
               "P400" and row.is_active is False for row in rows)


def test_update_product_modifies_existing_row(master_workbook_path):
    """
    Given an existing product 
    When update_product writes new values 
    Then the worksheet reflects the changes.
    """

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.PRODUCTS.value]
    sheet.append(["P500", "Old", "1.00", True])
    dal.save_workbook(workbook, master_workbook_path)

    # Act
    reloaded = dal.open_workbook(master_workbook_path)
    dal.update_product(
        reloaded,
        "P500",
        field_values={"ProductName": "New", "SellPrice": Decimal("2.00")},
    )
    dal.save_workbook(reloaded, master_workbook_path)
    final = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_products(final))

    # Assert
    assert any(row.product_id == "P500" and row.product_name ==
               "New" for row in rows)


def test_update_product_missing_raises(master_workbook_path):
    """
    Given an unknown product ID 
    When update_product runs 
    Then KeyError is raised.
    """

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)

    # Act / Assert
    with pytest.raises(KeyError):
        dal.update_product(workbook, "NOPE", field_values={"ProductName": "X"})


def test_serialize_product_preserves_order():
    """
    Given a ProductRow 
    When serialize_product executes 
    Then the column order remains consistent.
    """

    # Arrange
    record = dal.ProductRow("P1", "Name", Decimal("1.25"), True)

    # Act
    serialized = dal.serialize_product(record)

    # Assert
    assert serialized == ["P1", "Name", Decimal("1.25"), True]


def test_deserialize_product_constructs_dataclass():
    """
    Given worksheet values 
    When deserialize_product runs 
    Then a ProductRow is created with coerced types.
    """

    # Arrange
    raw_row = ["P9", "Bar", "2.75", True]

    # Act
    record = dal.deserialize_product(raw_row)

    # Assert
    assert record.product_id == "P9"
    assert record.sell_price == Decimal("2.75")
