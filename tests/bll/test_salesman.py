from unittest.mock import Mock

import pytest

from caad_erp import bll, dal, exceptions


def test_list_salesmen_excludes_inactive_by_default(monkeypatch, context):
    """
    Given inactive salesmen 
    When listing without overrides 
    Then inactive rows stay hidden.
    """

    # Arrange
    salesmen = [
        dal.SalesmanRow("S2", "Active", True),
        dal.SalesmanRow("S3", "Retired", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(dal, "iter_salesmen", iter_mock)

    # Act
    result = bll.list_salesmen(context)

    # Assert
    assert {row.salesman_id for row in result} == {"S2"}
    iter_mock.assert_called_once_with(context.workbook)


def test_list_salesmen_reuses_cache_between_calls(monkeypatch, context):
    """
    Given cached salesmen 
    When requesting active and full lists 
    Then the DAL is queried only once.
    """

    # Arrange
    salesmen = [
        dal.SalesmanRow("S-cache", "Cached", True),
        dal.SalesmanRow("S-inactive", "Hidden", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(dal, "iter_salesmen", iter_mock)

    # Act
    first = bll.list_salesmen(context)
    second = bll.list_salesmen(context, include_inactive=True)

    # Assert
    assert {row.salesman_id for row in first} == {"S-cache"}
    assert {row.salesman_id for row in second} == {"S-cache", "S-inactive"}
    iter_mock.assert_called_once_with(context.workbook)


def test_get_salesman_returns_match(monkeypatch, context):
    """
    Given a known salesman 
    When fetched by ID 
    Then the hydrated row matches the catalog.
    """

    # Arrange
    salesmen = [dal.SalesmanRow("S8", "Jordan", True)]
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=salesmen))

    # Act
    salesman = bll.get_salesman(context, "S8")

    # Assert
    assert salesman.salesman_name == "Jordan"


def test_get_salesman_reuses_cache_after_first_lookup(monkeypatch, context):
    """
    Given a fresh salesman cache 
    When the same ID is requested twice 
    Then the second call is served from cache.
    """

    # Arrange
    salesman_row = dal.SalesmanRow("S-cache", "Cached", True)
    iter_mock = Mock(return_value=[salesman_row])
    monkeypatch.setattr(dal, "iter_salesmen", iter_mock)

    # Act
    first = bll.get_salesman(context, "S-cache")
    second = bll.get_salesman(context, "S-cache")

    # Assert
    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_add_salesman_appends_record_and_invalidates_cache(monkeypatch, context):
    """
    Given a new salesman 
    When add_salesman executes 
    Then the row persists and cache clears.
    """

    # Arrange
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_salesman", append_mock)

    # Act
    result = bll.add_salesman(
        context,
        salesman_id="S-001",
        salesman_name="Jamie",
        is_active=True,
    )

    # Assert
    append_mock.assert_called_once()
    workbook_arg, record_arg = append_mock.call_args[0]
    assert workbook_arg is context.workbook
    assert record_arg == result
    assert result.salesman_id == "S-001"
    assert "salesmen" not in context._cache


def test_add_salesman_rejects_duplicate_id(monkeypatch, context):
    """
    Given an existing salesman ID 
    When add_salesman runs 
    Then a business rule violation prevents duplication.
    """

    # Arrange
    existing = dal.SalesmanRow("S-001", "Existing", True)
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=[existing]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_salesman", append_mock)

    # Act
    with pytest.raises(exceptions.BusinessRuleViolation):
        bll.add_salesman(
            context,
            salesman_id="S-001",
            salesman_name="Duplicate",
            is_active=True,
        )

    # Assert
    append_mock.assert_not_called()


def test_add_salesman_requires_nonempty_name(monkeypatch, context):
    """
    Given a blank name 
    When add_salesman is invoked 
    Then validation raises ValueError.
    """

    # Arrange
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(dal, "append_salesman", append_mock)

    # Act
    with pytest.raises(ValueError):
        bll.add_salesman(
            context,
            salesman_id="S-EMPTY",
            salesman_name="   ",
            is_active=True,
        )

    # Assert
    append_mock.assert_not_called()


def test_update_salesman_delegates_and_refreshes_cache(monkeypatch, context):
    """
    Given cached salesman data 
    When update_salesman runs 
    Then DAL updates and cache refreshes.
    """

    # Arrange
    original_bucket: dict[str, object] = {}
    context._cache["salesmen"] = original_bucket
    captured: dict[str, object] = {}

    def fake_update(workbook, salesman_id, *, field_values):
        captured["workbook"] = workbook
        captured["salesman_id"] = salesman_id
        captured["field_values"] = field_values

    updated_rows = [dal.SalesmanRow("S-001", "Alex", False)]
    monkeypatch.setattr(dal, "update_salesman", fake_update)
    monkeypatch.setattr(dal, "iter_salesmen", Mock(return_value=updated_rows))

    # Act
    result = bll.update_salesman(context, "  S-001  ", is_active=False)

    # Assert
    assert result.salesman_id == "S-001"
    assert result.is_active is False
    assert captured["workbook"] is context.workbook
    assert captured["salesman_id"] == "S-001"
    assert captured["field_values"] == {"IsActive": False}
    assert context._cache["salesmen"] is not original_bucket


def test_update_salesman_requires_changes(context):
    """
    Given no update fields 
    When update_salesman executes 
    Then ValueError highlights the missing changes.
    """

    # Arrange
    salesman_id = "S-002"

    # Act
    with pytest.raises(ValueError) as exc_info:
        bll.update_salesman(context, salesman_id)

    # Assert
    assert str(exc_info.value) == "At least one field must be provided to update"


def test_update_salesman_unknown_id_raises(monkeypatch, context):
    """
    Given an unknown salesman ID 
    When update_salesman hits the DAL 
    Then a missing reference error is raised.
    """

    # Arrange
    monkeypatch.setattr(
        dal,
        "update_salesman",
        Mock(side_effect=KeyError("Salesman not found")),
    )

    # Act
    with pytest.raises(exceptions.MissingReferenceError) as exc_info:
        bll.update_salesman(context, "UNKNOWN", is_active=False)

    # Assert
    assert "UNKNOWN" in str(exc_info.value)
