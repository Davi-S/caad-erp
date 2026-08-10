from pathlib import Path

import pytest
from openpyxl.workbook import Workbook

from caad_erp import constants, dal
from caad_erp.bll import runtime, salesmen
from caad_erp.exceptions import BusinessRuleViolation, MissingReferenceError
from caad_erp.settings import AppSettings


def _make_context(workbook: Workbook) -> runtime.RuntimeContext:
    settings = AppSettings(
        data_file=Path("/tmp/data.xlsx"),
        lounge_name="Test Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S001",
    )
    return runtime.RuntimeContext(settings=settings, workbook=workbook)


def _seed_salesman(
    workbook: Workbook,
    salesman_id: str,
    salesman_name: str = "Salesman",
    is_active: bool = True,
) -> dal.SalesmanRow:
    row = dal.SalesmanRow(
        salesman_id=salesman_id,
        salesman_name=salesman_name,
        is_active=is_active,
    )
    dal.append_salesman(workbook, row)
    return row


def test_ensure_salesmen_cache_populates_missing_cache(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a runtime context with an empty salesmen cache bucket
    WHEN _ensure_salesmen_cache is called
    THEN all and by_id structures are populated from DAL iteration
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001", is_active=True)
    _seed_salesman(salesmen_workbook, "S002", is_active=False)

    # Act
    bucket = salesmen._ensure_salesmen_cache(context)

    # Assert
    assert len(bucket["all"]) == 2
    assert set(bucket["by_id"].keys()) == {"S001", "S002"}


def test_ensure_salesmen_cache_reuses_existing_cache(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a runtime context with a pre-populated salesmen cache bucket
    WHEN _ensure_salesmen_cache is called
    THEN the existing cached structures are reused without re-iterating DAL
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001")
    first_bucket = salesmen._ensure_salesmen_cache(context)

    _seed_salesman(salesmen_workbook, "S002")

    # Act
    second_bucket = salesmen._ensure_salesmen_cache(context)

    # Assert
    assert second_bucket is first_bucket
    assert len(second_bucket["all"]) == 1
    assert "S002" not in second_bucket["by_id"]


def test_list_salesmen_returns_all_results(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a cached salesmen bucket
    WHEN list_salesmen is called
    THEN it returns all records
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001", is_active=True)
    _seed_salesman(salesmen_workbook, "S002", is_active=False)

    # Act
    result = salesmen.list_salesmen(context)

    # Assert
    assert [row.salesman_id for row in result] == ["S001", "S002"]


def test_list_salesmen_returns_copy_not_original_reference(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN cached salesman collections
    WHEN list_salesmen is called
    THEN a list copy is returned so callers cannot mutate cache internals
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001")

    # Act
    result = salesmen.list_salesmen(context)

    # Assert
    assert result is not context._cache["salesmen"]["all"]


def test_get_salesman_returns_matching_row(salesmen_workbook: Workbook) -> None:
    """
    GIVEN a cached by_id map containing a requested salesman id
    WHEN get_salesman is called
    THEN the corresponding SalesmanRow is returned
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    expected = _seed_salesman(salesmen_workbook, "S001", salesman_name="Alex")

    # Act
    result = salesmen.get_salesman(context, "S001")

    # Assert
    assert result == expected


def test_get_salesman_raises_missing_reference_for_unknown_id(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a cached by_id map without the requested salesman id
    WHEN get_salesman is called
    THEN MissingReferenceError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001")

    # Act / Assert
    with pytest.raises(MissingReferenceError):
        salesmen.get_salesman(context, "UNKNOWN")


def test_add_salesman_returns_record_on_success(salesmen_workbook: Workbook) -> None:
    """
    GIVEN a valid creation command for a new unique salesman
    WHEN add_salesman is called
    THEN a SalesmanRow is appended cache invalidated and the record returned
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    command = salesmen.SalesmanCommand(
        salesman_id="S001",
        salesman_name="Taylor",
        is_active=True,
    )

    # Act
    created = salesmen.add_salesman(context, command)

    # Assert
    assert created.salesman_id == "S001"
    assert created.salesman_name == "Taylor"
    assert created.is_active is True
    assert salesmen.get_salesman(context, "S001").salesman_name == "Taylor"


def test_add_salesman_trims_salesman_id_and_name_before_persisting(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a creation command with surrounding whitespace in salesman id and name
    WHEN add_salesman is called
    THEN normalized trimmed values are persisted
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act
    created = salesmen.add_salesman(
        context,
        salesmen.SalesmanCommand(
            salesman_id="  S001  ",
            salesman_name="  Taylor  ",
            is_active=True,
        ),
    )

    # Assert
    assert created.salesman_id == "S001"
    assert created.salesman_name == "Taylor"


def test_add_salesman_rejects_blank_salesman_id(salesmen_workbook: Workbook) -> None:
    """
    GIVEN a creation command with blank salesman id
    WHEN add_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.add_salesman(
            context,
            salesmen.SalesmanCommand(
                salesman_id="   ",
                salesman_name="Taylor",
                is_active=True,
            ),
        )


@pytest.mark.parametrize("salesman_name", [None, "", "   "])
def test_add_salesman_requires_nonblank_salesman_name(
    salesmen_workbook: Workbook,
    salesman_name,
) -> None:
    """
    GIVEN a creation command with missing or blank salesman_name
    WHEN add_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.add_salesman(
            context,
            salesmen.SalesmanCommand(
                salesman_id="S001",
                salesman_name=salesman_name,
                is_active=True,
            ),
        )


def test_add_salesman_requires_is_active(salesmen_workbook: Workbook) -> None:
    """
    GIVEN a creation command with is_active omitted
    WHEN add_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.add_salesman(
            context,
            salesmen.SalesmanCommand(
                salesman_id="S001",
                salesman_name="Taylor",
                is_active=None,
            ),
        )


def test_add_salesman_rejects_duplicate_salesman_id(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a creation command whose salesman id already exists in cache
    WHEN add_salesman is called
    THEN BusinessRuleViolation is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001", salesman_name="Original")

    # Act / Assert
    with pytest.raises(BusinessRuleViolation):
        salesmen.add_salesman(
            context,
            salesmen.SalesmanCommand(
                salesman_id="S001",
                salesman_name="Duplicate",
                is_active=True,
            ),
        )


def test_update_salesman_returns_updated_record_on_success(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN a valid update command targeting an existing salesman
    WHEN update_salesman is called
    THEN DAL update executes cache is invalidated and updated row is returned
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001", salesman_name="Old")
    salesmen.list_salesmen(context)  # warm cache

    # Act
    updated = salesmen.update_salesman(
        context,
        salesmen.SalesmanCommand(salesman_id="S001", salesman_name="Updated"),
    )

    # Assert
    assert updated.salesman_id == "S001"
    assert updated.salesman_name == "Updated"
    assert salesmen.get_salesman(context, "S001").salesman_name == "Updated"


def test_update_salesman_trims_salesman_id_and_name_before_persisting(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN an update command with surrounding whitespace in salesman id and name
    WHEN update_salesman is called
    THEN normalized trimmed values are used for lookup and persistence
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001", salesman_name="Old")

    # Act
    updated = salesmen.update_salesman(
        context,
        salesmen.SalesmanCommand(salesman_id="  S001  ", salesman_name="  New Name  "),
    )

    # Assert
    assert updated.salesman_id == "S001"
    assert updated.salesman_name == "New Name"


def test_update_salesman_rejects_blank_salesman_id(salesmen_workbook: Workbook) -> None:
    """
    GIVEN an update command with blank salesman id
    WHEN update_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.update_salesman(
            context,
            salesmen.SalesmanCommand(salesman_id="   ", salesman_name="Updated"),
        )


def test_update_salesman_rejects_blank_salesman_name(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN an update command with salesman_name provided as blank text
    WHEN update_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001")

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.update_salesman(
            context,
            salesmen.SalesmanCommand(salesman_id="S001", salesman_name="   "),
        )


def test_update_salesman_requires_at_least_one_field(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN an update command with only salesman id and no mutable fields
    WHEN update_salesman is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)
    _seed_salesman(salesmen_workbook, "S001")

    # Act / Assert
    with pytest.raises(ValueError):
        salesmen.update_salesman(context, salesmen.SalesmanCommand(salesman_id="S001"))


def test_update_salesman_maps_dal_key_error_to_missing_reference(
    salesmen_workbook: Workbook,
) -> None:
    """
    GIVEN DAL update_salesman raises KeyError for an unknown salesman
    WHEN update_salesman is called
    THEN MissingReferenceError is raised
    """
    # Arrange
    context = _make_context(salesmen_workbook)

    # Act / Assert
    with pytest.raises(MissingReferenceError):
        salesmen.update_salesman(
            context,
            salesmen.SalesmanCommand(salesman_id="S999", salesman_name="Updated"),
        )
