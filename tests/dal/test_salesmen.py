import pytest

from caad_erp import dal, constants


def test_iter_salesmen_yields_salesman_rows(master_workbook_path):
    """iter_salesmen should expose SalesmanRow objects."""

    workbook = dal.open_workbook(master_workbook_path)
    salesmen = workbook[constants.SheetName.SALESMEN.value]
    salesmen.append(["S2", "Morgan", True])
    dal.save_workbook(workbook, master_workbook_path)

    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(refreshed))
    assert rows[0].salesman_id == "S-DEFAULT"
    assert any(row.salesman_id == "S2" for row in rows)


def test_append_salesman_adds_row(master_workbook_path):
    """append_salesman should append the record to the Salesmen sheet."""

    workbook = dal.open_workbook(master_workbook_path)
    record = dal.SalesmanRow(
        salesman_id="S9",
        salesman_name="Jamie",
        is_active=False,
    )
    dal.append_salesman(workbook, record)
    dal.save_workbook(workbook, master_workbook_path)

    refreshed = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(refreshed))
    assert any(row.salesman_id == "S9" for row in rows)


def test_update_salesman_modifies_existing_row(master_workbook_path):
    """update_salesman should support partial field merges."""

    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.SALESMEN.value]
    sheet.append(["S500", "Taylor", True])
    dal.save_workbook(workbook, master_workbook_path)

    reloaded = dal.open_workbook(master_workbook_path)
    dal.update_salesman(
        reloaded, "S500", field_values={"IsActive": False})
    dal.save_workbook(reloaded, master_workbook_path)

    final = dal.open_workbook(master_workbook_path)
    rows = list(dal.iter_salesmen(final))
    assert any(row.salesman_id ==
               "S500" and row.is_active is False for row in rows)


def test_update_salesman_missing_raises(master_workbook_path):
    """Attempting to update a missing salesman should raise KeyError."""

    workbook = dal.open_workbook(master_workbook_path)
    with pytest.raises(KeyError):
        dal.update_salesman(
            workbook, "MISSING", field_values={"IsActive": False})


def test_serialize_salesman_preserves_order():
    """serialize_salesman should output values in sheet order."""

    record = dal.SalesmanRow("S1", "Sam", False)
    assert dal.serialize_salesman(record) == ["S1", "Sam", False]


def test_deserialize_salesman_constructs_dataclass():
    """deserialize_salesman should create a SalesmanRow from raw values."""

    record = dal.deserialize_salesman(["S9", "Alex", False])
    assert record.salesman_name == "Alex"
    assert record.is_active is False
