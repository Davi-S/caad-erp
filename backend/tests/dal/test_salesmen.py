import pytest

from caad_erp.dal import salesmen


def _sample_salesman(
    salesman_id: str = "S-001",
    salesman_name: str = "Alice",
    is_active: bool = True,
) -> salesmen.SalesmanRow:
    return salesmen.SalesmanRow(
        salesman_id=salesman_id,
        salesman_name=salesman_name,
        is_active=is_active,
    )


def test_iter_salesmen_yields_salesman_row_instances(salesmen_workbook) -> None:
    """
    GIVEN a salesmen sheet with populated rows
    WHEN iter_salesmen is called
    THEN it yields SalesmanRow instances
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act
    records = list(salesmen.iter_salesmen(salesmen_workbook))

    # Assert
    assert len(records) == 1
    assert isinstance(records[0], salesmen.SalesmanRow)


def test_iter_salesmen_yields_all_non_empty_rows(salesmen_workbook) -> None:
    """
    GIVEN a salesmen sheet with non-empty data rows
    WHEN iter_salesmen is called
    THEN it yields all non-empty rows
    """
    # Arrange
    sheet = salesmen_workbook["Salesmen"]
    sheet.append(["S-001", "Alice", True])
    sheet.append([None, None, None])
    sheet.append(["S-002", "Bruno", True])

    # Act
    records = list(salesmen.iter_salesmen(salesmen_workbook))

    # Assert
    assert [record.salesman_id for record in records] == ["S-001", "S-002"]


def test_iter_salesmen_empty_sheet_yields_nothing(salesmen_workbook) -> None:
    """
    GIVEN a header-only salesmen sheet
    WHEN iter_salesmen is called
    THEN it yields no rows
    """
    # Arrange

    # Act
    records = list(salesmen.iter_salesmen(salesmen_workbook))

    # Assert
    assert not records


def test_iter_salesmen_skips_fully_empty_rows(salesmen_workbook) -> None:
    """
    GIVEN a salesmen sheet containing fully empty rows
    WHEN iter_salesmen is called
    THEN fully empty rows are skipped
    """
    # Arrange
    sheet = salesmen_workbook["Salesmen"]
    sheet.append([None, None, None])
    sheet.append(["S-001", "Alice", True])
    sheet.append([None, None, None])

    # Act
    records = list(salesmen.iter_salesmen(salesmen_workbook))

    # Assert
    assert len(records) == 1
    assert records[0].salesman_id == "S-001"


def test_iter_salesmen_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Salesmen sheet
    WHEN iter_salesmen is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook(
        "Products", ["ProductID", "ProductName", "SellPrice", "IsActive"]
    )

    # Act / Assert
    with pytest.raises(KeyError):
        list(salesmen.iter_salesmen(workbook))


def test_append_salesman_increases_row_count_by_one(salesmen_workbook) -> None:
    """
    GIVEN a salesmen sheet with existing rows
    WHEN append_salesman is called
    THEN row count increases by one
    """
    # Arrange
    sheet = salesmen_workbook["Salesmen"]
    before_count = sheet.max_row
    record = _sample_salesman()

    # Act
    salesmen.append_salesman(salesmen_workbook, record)

    # Assert
    assert sheet.max_row == before_count + 1


def test_append_salesman_stores_correct_values(salesmen_workbook) -> None:
    """
    GIVEN a salesman record
    WHEN append_salesman is called
    THEN record values are persisted unchanged
    """
    # Arrange
    record = _sample_salesman()

    # Act
    salesmen.append_salesman(salesmen_workbook, record)
    last_row = list(
        salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True)
    )[-1]

    # Assert
    assert last_row == ("S-001", "Alice", True)


def test_append_salesman_column_ordering(salesmen_workbook) -> None:
    """
    GIVEN a salesman record
    WHEN append_salesman is called
    THEN values are written in SalesmanID SalesmanName IsActive order
    """
    # Arrange
    record = salesmen.SalesmanRow(
        salesman_id="S-010", salesman_name="Carla", is_active=False
    )

    # Act
    salesmen.append_salesman(salesmen_workbook, record)
    last_row = list(
        salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True)
    )[-1]

    # Assert
    assert last_row == ("S-010", "Carla", False)


def test_append_salesman_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Salesmen sheet
    WHEN append_salesman is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook(
        "Products", ["ProductID", "ProductName", "SellPrice", "IsActive"]
    )

    # Act / Assert
    with pytest.raises(KeyError):
        salesmen.append_salesman(workbook, _sample_salesman())


def test_update_salesman_updates_single_field(salesmen_workbook) -> None:
    """
    GIVEN an existing salesman row
    WHEN update_salesman is called with one field
    THEN only that field is updated
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act
    salesmen.update_salesman(
        salesmen_workbook,
        "S-001",
        field_values={"SalesmanName": "Alicia"},
    )
    row = next(
        iter(salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row == ("S-001", "Alicia", True)


def test_update_salesman_updates_multiple_fields_simultaneously(
    salesmen_workbook,
) -> None:
    """
    GIVEN an existing salesman row
    WHEN update_salesman is called with multiple fields
    THEN all requested fields are updated
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act
    salesmen.update_salesman(
        salesmen_workbook,
        "S-001",
        field_values={"SalesmanName": "Alicia", "IsActive": False},
    )
    row = next(
        iter(salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row == ("S-001", "Alicia", False)


def test_update_salesman_leaves_other_fields_unchanged(salesmen_workbook) -> None:
    """
    GIVEN an existing salesman row
    WHEN update_salesman is called for selected fields
    THEN unselected fields remain unchanged
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act
    salesmen.update_salesman(
        salesmen_workbook,
        "S-001",
        field_values={"SalesmanName": "Alicia"},
    )
    row = next(
        iter(salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert row[0] == "S-001"
    assert row[2] is True


def test_update_salesman_raises_key_error_for_missing_salesman_id(
    salesmen_workbook,
) -> None:
    """
    GIVEN a missing salesman id
    WHEN update_salesman is called
    THEN it raises KeyError
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act / Assert
    with pytest.raises(KeyError, match="Salesman not found"):
        salesmen.update_salesman(
            salesmen_workbook,
            "S-999",
            field_values={"SalesmanName": "Ghost"},
        )


def test_update_salesman_raises_key_error_for_unknown_column_name(
    salesmen_workbook,
) -> None:
    """
    GIVEN an unknown field name
    WHEN update_salesman is called
    THEN it raises KeyError
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])

    # Act / Assert
    with pytest.raises(KeyError, match="Unknown salesman field"):
        salesmen.update_salesman(
            salesmen_workbook,
            "S-001",
            field_values={"BadColumn": "x"},
        )


def test_update_salesman_raises_key_error_for_missing_sheet(make_workbook) -> None:
    """
    GIVEN a workbook without a Salesmen sheet
    WHEN update_salesman is called
    THEN it raises KeyError
    """
    # Arrange
    workbook = make_workbook(
        "Products", ["ProductID", "ProductName", "SellPrice", "IsActive"]
    )

    # Act / Assert
    with pytest.raises(KeyError):
        salesmen.update_salesman(
            workbook, "S-001", field_values={"SalesmanName": "Alicia"}
        )


def test_update_salesman_empty_field_values_is_no_op(salesmen_workbook) -> None:
    """
    GIVEN an existing salesman row and empty field_values
    WHEN update_salesman is called
    THEN no workbook values are changed
    """
    # Arrange
    salesmen_workbook["Salesmen"].append(["S-001", "Alice", True])
    before = next(
        iter(salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True))
    )

    # Act
    salesmen.update_salesman(salesmen_workbook, "S-001", field_values={})
    after = next(
        iter(salesmen_workbook["Salesmen"].iter_rows(min_row=2, values_only=True))
    )

    # Assert
    assert after == before


def test_serialize_salesman_returns_correct_column_order() -> None:
    """
    GIVEN a SalesmanRow record
    WHEN _serialize_salesman is called
    THEN values are returned in canonical column order
    """
    # Arrange
    record = salesmen.SalesmanRow(
        salesman_id="S-001", salesman_name="Alice", is_active=False
    )

    # Act
    serialized = salesmen._serialize_salesman(record)

    # Assert
    assert serialized == ["S-001", "Alice", False]


def test_deserialize_salesman_returns_salesman_row_instance() -> None:
    """
    GIVEN a valid raw salesman row
    WHEN _deserialize_salesman is called
    THEN it returns a SalesmanRow instance
    """
    # Arrange
    raw_row = ["S-001", "Alice", True]

    # Act
    result = salesmen._deserialize_salesman(raw_row)

    # Assert
    assert isinstance(result, salesmen.SalesmanRow)


@pytest.mark.parametrize(
    "raw_row, expected_salesman_id, expected_salesman_name",
    [
        ([123, 456, True], "123", "456"),
        (["S-001", 789, False], "S-001", "789"),
    ],
)
def test_deserialize_salesman_coerces_text_fields_to_str(
    raw_row,
    expected_salesman_id,
    expected_salesman_name,
) -> None:
    """
    GIVEN raw rows with non-string SalesmanID or SalesmanName
    WHEN _deserialize_salesman is called
    THEN textual fields are coerced to string
    """
    # Arrange

    # Act
    result = salesmen._deserialize_salesman(raw_row)

    # Assert
    assert result.salesman_id == expected_salesman_id
    assert result.salesman_name == expected_salesman_name
    assert isinstance(result.salesman_id, str)
    assert isinstance(result.salesman_name, str)


def test_deserialize_salesman_coerces_is_active_to_bool() -> None:
    """
    GIVEN a raw row with IsActive value
    WHEN _deserialize_salesman is called
    THEN IsActive is coerced to bool
    """
    # Arrange
    raw_true = ["S-001", "Alice", 1]
    raw_false = ["S-002", "Bruno", 0]

    # Act
    result_true = salesmen._deserialize_salesman(raw_true)
    result_false = salesmen._deserialize_salesman(raw_false)

    # Assert
    assert result_true.is_active is True
    assert result_false.is_active is False
    assert isinstance(result_true.is_active, bool)
    assert isinstance(result_false.is_active, bool)


@pytest.mark.parametrize("raw_row", [["S-001"], ["S-001", "Alice"]])
def test_deserialize_salesman_raises_index_error_for_short_row(raw_row) -> None:
    """
    GIVEN a short raw row missing required columns
    WHEN _deserialize_salesman is called
    THEN it raises IndexError
    """
    # Arrange

    # Act / Assert
    with pytest.raises(IndexError):
        salesmen._deserialize_salesman(raw_row)
