import pytest

from caad_erp import dal, constants


def test_iter_salesmen_yields_salesman_rows(master_workbook_path):
    """Given workbook salesman data When iter_salesmen runs Then SalesmanRow entries return."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    salesmen = workbook[constants.SheetName.SALESMEN.value]
    salesmen.append(["S2", "Morgan", True])
    dal.save_workbook(workbook, master_workbook_path)

    # Act
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(refreshed))

    # Assert
    assert rows[0].salesman_id == "S-DEFAULT"
    assert any(row.salesman_id == "S2" for row in rows)


def test_append_salesman_adds_row(master_workbook_path):
    """Given a salesman record When append_salesman executes Then the sheet receives the row."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    record = dal.SalesmanRow(
        salesman_id="S9",
        salesman_name="Jamie",
        is_active=False,
    )

    # Act
    dal.append_salesman(workbook, record)
    dal.save_workbook(workbook, master_workbook_path)
    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(refreshed))

    # Assert
    assert any(row.salesman_id == "S9" for row in rows)


def test_update_salesman_modifies_existing_row(master_workbook_path):
    """Given an existing salesman When update_salesman changes fields Then the sheet reflects the edit."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.SALESMEN.value]
    sheet.append(["S500", "Taylor", True])
    dal.save_workbook(workbook, master_workbook_path)

    # Act
    reloaded = dal.open_workbook(master_workbook_path)
    dal.update_salesman(reloaded, "S500", field_values={"IsActive": False})
    dal.save_workbook(reloaded, master_workbook_path)
    final = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(final))

    # Assert
    assert any(row.salesman_id ==
               "S500" and row.is_active is False for row in rows)


def test_update_salesman_missing_raises(master_workbook_path):
    """Given an unknown salesman When update_salesman runs Then KeyError is raised."""

    # Arrange
    workbook = dal.open_workbook(master_workbook_path)

    # Act / Assert
    with pytest.raises(KeyError):
        dal.update_salesman(workbook, "MISSING",
                            field_values={"IsActive": False})


def test_serialize_salesman_preserves_order():
    """Given a SalesmanRow When serialize_salesman executes Then values remain in sheet order."""

    # Arrange
    record = dal.SalesmanRow("S1", "Sam", False)

    # Act
    serialized = dal.serialize_salesman(record)

    # Assert
    assert serialized == ["S1", "Sam", False]


def test_deserialize_salesman_constructs_dataclass():
    """Given raw salesman values When deserialize_salesman runs Then a SalesmanRow is produced."""

    # Arrange
    raw_row = ["S9", "Alex", False]

    # Act
    record = dal.deserialize_salesman(raw_row)

    # Assert
    assert record.salesman_name == "Alex"
    assert record.is_active is False
