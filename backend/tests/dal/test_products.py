import pytest

from caad_erp.dal import products


def _sample_product(
    product_id: str = "P-001",
    product_name: str = "Soda",
    sell_price: int = 550,
    is_active: bool = True,
) -> products.ProductRow:
    return products.ProductRow(
        product_id=product_id,
        product_name=product_name,
        sell_price=sell_price,
        is_active=is_active,
    )


def test_iter_products_yields_product_row_instances(products_workbook) -> None:
    """
    GIVEN a products sheet with populated rows
    WHEN iter_products is called
    THEN it yields ProductRow instances
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])

    # Act
    records = list(products.iter_products(products_workbook))

    # Assert
    assert len(records) == 1
    assert isinstance(records[0], products.ProductRow)


def test_iter_products_yields_all_non_empty_rows(products_workbook) -> None:
    """
    GIVEN a products sheet with non-empty data rows
    WHEN iter_products is called
    THEN it yields all non-empty rows
    """
    # Arrange
    sheet = products_workbook["Products"]
    sheet.append(["P-001", "Soda", 550, True])
    sheet.append([None, None, None, None])
    sheet.append(["P-002", "Juice", 600, True])
    sheet.append(["P-003", "Water", 300, False])

    # Act
    records = list(products.iter_products(products_workbook))

    # Assert
    assert [record.product_id for record in records] == ["P-001", "P-002", "P-003"]


def test_iter_products_empty_sheet_yields_nothing(products_workbook) -> None:
    """
    GIVEN a header-only products sheet
    WHEN iter_products is called
    THEN it yields no rows
    """
    # Arrange

    # Act
    records = list(products.iter_products(products_workbook))

    # Assert
    assert not records


def test_iter_products_skips_fully_empty_rows(products_workbook) -> None:
    """
    GIVEN a products sheet containing fully empty rows
    WHEN iter_products is called
    THEN fully empty rows are skipped
    """
    # Arrange
    sheet = products_workbook["Products"]
    sheet.append([None, None, None, None])
    sheet.append(["P-001", "Soda", 550, True])
    sheet.append([None, None, None, None])

    # Act
    records = list(products.iter_products(products_workbook))

    # Assert
    assert len(records) == 1
    assert records[0].product_id == "P-001"


def test_iter_products_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Products sheet
    WHEN iter_products is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook("Salesmen", ["SalesmanID", "SalesmanName", "IsActive"])

    # Act / Assert
    with pytest.raises(KeyError):
        list(products.iter_products(workbook))


def test_append_product_increases_row_count_by_one(products_workbook) -> None:
    """
    GIVEN a products sheet with existing rows
    WHEN append_product is called
    THEN row count increases by one
    """
    # Arrange
    sheet = products_workbook["Products"]
    before_count = sheet.max_row
    record = _sample_product()

    # Act
    products.append_product(products_workbook, record)

    # Assert
    assert sheet.max_row == before_count + 1


def test_append_product_stores_correct_values(products_workbook) -> None:
    """
    GIVEN a product record
    WHEN append_product is called
    THEN record values are persisted unchanged
    """
    # Arrange
    record = _sample_product()

    # Act
    products.append_product(products_workbook, record)
    last_row = list(
        products_workbook["Products"].iter_rows(min_row=2, values_only=True)
    )[-1]

    # Assert
    assert last_row == ("P-001", "Soda", 550, True)


def test_append_product_column_ordering(products_workbook) -> None:
    """
    GIVEN a product record
    WHEN append_product is called
    THEN values are written in ProductID ProductName SellPrice IsActive order
    """
    # Arrange
    record = products.ProductRow(
        product_id="P-010",
        product_name="Energy Drink",
        sell_price=990,
        is_active=False,
    )

    # Act
    products.append_product(products_workbook, record)
    last_row = list(
        products_workbook["Products"].iter_rows(min_row=2, values_only=True)
    )[-1]

    # Assert
    assert last_row == ("P-010", "Energy Drink", 990, False)


def test_append_product_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Products sheet
    WHEN append_product is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook("Salesmen", ["SalesmanID", "SalesmanName", "IsActive"])

    # Act / Assert
    with pytest.raises(KeyError):
        products.append_product(workbook, _sample_product())


def test_update_product_updates_single_field(products_workbook) -> None:
    """
    GIVEN an existing product row
    WHEN update_product is called with one field
    THEN only that field is updated
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])

    # Act
    products.update_product(
        products_workbook,
        "P-001",
        field_values={"ProductName": "Soda Zero"},
    )
    row = next(
        iter(products_workbook["Products"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row == ("P-001", "Soda Zero", 550, True)


def test_update_product_updates_multiple_fields_simultaneously(
    products_workbook,
) -> None:
    """
    GIVEN an existing product row
    WHEN update_product is called with multiple fields
    THEN all requested fields are updated
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 500, True])

    # Act
    products.update_product(
        products_workbook,
        "P-001",
        field_values={"ProductName": "Soda Zero", "SellPrice": 625},
    )
    row = next(
        iter(products_workbook["Products"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row == ("P-001", "Soda Zero", 625, True)


def test_update_product_leaves_other_fields_unchanged(products_workbook) -> None:
    """
    GIVEN an existing product row
    WHEN update_product is called for selected fields
    THEN unselected fields remain unchanged
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])

    # Act
    products.update_product(
        products_workbook,
        "P-001",
        field_values={"ProductName": "Soda Zero"},
    )
    row = next(
        iter(products_workbook["Products"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row[0] == "P-001"
    assert row[2] == 550
    assert row[3] is True


def test_update_product_raises_key_error_for_missing_product_id(
    products_workbook,
) -> None:
    """
    GIVEN a missing product id
    WHEN update_product is called
    THEN it raises KeyError
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])

    # Act / Assert
    with pytest.raises(KeyError, match="Product not found"):
        products.update_product(
            products_workbook,
            "P-999",
            field_values={"ProductName": "Unknown"},
        )


def test_update_product_raises_key_error_for_unknown_column_name(
    products_workbook,
) -> None:
    """
    GIVEN an unknown field name
    WHEN update_product is called
    THEN it raises KeyError
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])

    # Act / Assert
    with pytest.raises(KeyError, match="Unknown product field"):
        products.update_product(
            products_workbook,
            "P-001",
            field_values={"NotAColumn": "Value"},
        )


def test_update_product_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Products sheet
    WHEN update_product is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook("Salesmen", ["SalesmanID", "SalesmanName", "IsActive"])

    # Act / Assert
    with pytest.raises(KeyError):
        products.update_product(workbook, "P-001", field_values={"ProductName": "Soda"})


def test_update_product_empty_field_values_is_no_op(products_workbook) -> None:
    """
    GIVEN an existing product row and empty field_values
    WHEN update_product is called
    THEN no workbook values are changed
    """
    # Arrange
    products_workbook["Products"].append(["P-001", "Soda", 550, True])
    before = next(
        iter(products_workbook["Products"].iter_rows(min_row=2, values_only=True))
    )

    # Act
    products.update_product(products_workbook, "P-001", field_values={})
    after = next(
        iter(products_workbook["Products"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert after == before


def test_serialize_product_returns_correct_column_order() -> None:
    """
    GIVEN a ProductRow record
    WHEN _serialize_product is called
    THEN values are returned in canonical column order
    """
    # Arrange
    record = products.ProductRow(
        product_id="P-001",
        product_name="Soda",
        sell_price=550,
        is_active=False,
    )

    # Act
    serialized = products._serialize_product(record)

    # Assert
    assert serialized == ["P-001", "Soda", 550, False]


def test_deserialize_product_returns_product_row_instance() -> None:
    """
    GIVEN a valid raw product row
    WHEN _deserialize_product is called
    THEN it returns a ProductRow instance
    """
    # Arrange
    raw_row = ["P-001", "Soda", 550, True]

    # Act
    result = products._deserialize_product(raw_row)

    # Assert
    assert isinstance(result, products.ProductRow)


@pytest.mark.parametrize(
    "raw_row, expected_product_id, expected_product_name",
    [
        ([123, 456, 100, True], "123", "456"),
        (["P-001", 789, 200, False], "P-001", "789"),
    ],
)
def test_deserialize_product_coerces_text_fields_to_str(
    raw_row,
    expected_product_id,
    expected_product_name,
) -> None:
    """
    GIVEN raw rows with non-string ProductID or ProductName
    WHEN _deserialize_product is called
    THEN textual fields are coerced to string
    """
    # Arrange

    # Act
    result = products._deserialize_product(raw_row)

    # Assert
    assert result.product_id == expected_product_id
    assert result.product_name == expected_product_name
    assert isinstance(result.product_id, str)
    assert isinstance(result.product_name, str)


@pytest.mark.parametrize(
    "raw_row, expected_sell_price",
    [
        (["P-001", "Soda", None, True], 0),
        (["P-001", "Soda", 5, True], 5),
    ],
)
def test_deserialize_product_normalizes_sell_price(
    raw_row,
    expected_sell_price,
) -> None:
    """
    GIVEN raw rows with SellPrice as None
    WHEN _deserialize_product is called
    THEN SellPrice is normalized to the expected integer value
    """
    # Arrange

    # Act
    result = products._deserialize_product(raw_row)

    # Assert
    assert result.sell_price == expected_sell_price
    assert isinstance(result.sell_price, int)


def test_deserialize_product_coerces_is_active_to_bool() -> None:
    """
    GIVEN a raw row with IsActive value
    WHEN _deserialize_product is called
    THEN IsActive is coerced to bool
    """
    # Arrange
    raw_true = ["P-001", "Soda", 550, 1]
    raw_false = ["P-002", "Water", 300, 0]

    # Act
    result_true = products._deserialize_product(raw_true)
    result_false = products._deserialize_product(raw_false)

    # Assert
    assert result_true.is_active is True
    assert result_false.is_active is False
    assert isinstance(result_true.is_active, bool)
    assert isinstance(result_false.is_active, bool)


@pytest.mark.parametrize(
    "raw_row", [["P-001"], ["P-001", "Soda"], ["P-001", "Soda", 100]]
)
def test_deserialize_product_raises_index_error_for_short_row(raw_row) -> None:
    """
    GIVEN a short raw row missing required columns
    WHEN _deserialize_product is called
    THEN it raises IndexError
    """
    # Arrange

    # Act / Assert
    with pytest.raises(IndexError):
        products._deserialize_product(raw_row)


@pytest.mark.parametrize(
    "raw_row",
    [
        ["P-001", "Soda", "abc", True],
        ["P-001", "Soda", "12,34", True],
        ["P-001", "Soda", 12.34, True],
    ],
)
def test_deserialize_product_raises_value_error_for_invalid_sell_price(raw_row) -> None:
    """
    GIVEN a raw row with invalid SellPrice
    WHEN _deserialize_product is called
    THEN it raises a value error
    """
    # Arrange

    # Act / Assert
    with pytest.raises(ValueError):
        products._deserialize_product(raw_row)
