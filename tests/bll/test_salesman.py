from unittest.mock import Mock

import pytest

from caad_erp import bll, data_manager


def test_list_salesmen_excludes_inactive_by_default(monkeypatch, context):
    """list_salesmen should filter inactive rows unless instructed otherwise."""

    salesmen = [
        data_manager.SalesmanRow("S2", "Active", True),
        data_manager.SalesmanRow("S3", "Retired", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    result = bll.list_salesmen(context)

    assert {row.salesman_id for row in result} == {"S2"}
    iter_mock.assert_called_once_with(context.workbook)


def test_list_salesmen_reuses_cache_between_calls(monkeypatch, context):
    """list_salesmen should only hit the data layer once per context."""

    salesmen = [
        data_manager.SalesmanRow("S-cache", "Cached", True),
        data_manager.SalesmanRow("S-inactive", "Hidden", False),
    ]
    iter_mock = Mock(return_value=salesmen)
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    first = bll.list_salesmen(context)
    second = bll.list_salesmen(context, include_inactive=True)

    assert {row.salesman_id for row in first} == {"S-cache"}
    assert {row.salesman_id for row in second} == {"S-cache", "S-inactive"}
    iter_mock.assert_called_once_with(context.workbook)


def test_get_salesman_returns_match(monkeypatch, context):
    """get_salesman should fetch active salesmen."""

    salesmen = [data_manager.SalesmanRow("S8", "Jordan", True)]
    monkeypatch.setattr(data_manager, "iter_salesmen",
                        Mock(return_value=salesmen))

    salesman = bll.get_salesman(context, "S8")

    assert salesman.salesman_name == "Jordan"


def test_get_salesman_reuses_cache_after_first_lookup(monkeypatch, context):
    """Salesman lookups should be served from cache after first access."""

    salesman_row = data_manager.SalesmanRow("S-cache", "Cached", True)
    iter_mock = Mock(return_value=[salesman_row])
    monkeypatch.setattr(data_manager, "iter_salesmen", iter_mock)

    first = bll.get_salesman(context, "S-cache")
    second = bll.get_salesman(context, "S-cache")

    assert first is second
    iter_mock.assert_called_once_with(context.workbook)


def test_add_salesman_appends_record_and_invalidates_cache(monkeypatch, context):
    """add_salesman should persist a SalesmanRow and clear the cache bucket."""

    monkeypatch.setattr(data_manager, "iter_salesmen", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(data_manager, "append_salesman", append_mock)

    result = bll.add_salesman(
        context,
        salesman_id="S-001",
        salesman_name="Jamie",
        is_active=True,
    )

    append_mock.assert_called_once()
    workbook_arg, record_arg = append_mock.call_args[0]
    assert workbook_arg is context.workbook
    assert record_arg == result
    assert result.salesman_id == "S-001"
    assert "salesmen" not in context._cache


def test_add_salesman_rejects_duplicate_id(monkeypatch, context):
    """Existing SalesmanIDs should block add_salesman calls."""

    existing = data_manager.SalesmanRow("S-001", "Existing", True)
    monkeypatch.setattr(data_manager, "iter_salesmen",
                        Mock(return_value=[existing]))
    append_mock = Mock()
    monkeypatch.setattr(data_manager, "append_salesman", append_mock)

    with pytest.raises(bll.BusinessRuleViolation):
        bll.add_salesman(
            context,
            salesman_id="S-001",
            salesman_name="Duplicate",
            is_active=True,
        )

    append_mock.assert_not_called()


def test_add_salesman_requires_nonempty_name(monkeypatch, context):
    """add_salesman should validate the provided salesman name."""

    monkeypatch.setattr(data_manager, "iter_salesmen", Mock(return_value=[]))
    append_mock = Mock()
    monkeypatch.setattr(data_manager, "append_salesman", append_mock)

    with pytest.raises(ValueError):
        bll.add_salesman(
            context,
            salesman_id="S-EMPTY",
            salesman_name="   ",
            is_active=True,
        )

    append_mock.assert_not_called()


def test_update_salesman_delegates_and_refreshes_cache(monkeypatch, context):
    """update_salesman should call the DAL, clear caches, and reflect new data."""

    original_bucket: dict[str, object] = {}
    context._cache["salesmen"] = original_bucket

    captured: dict[str, object] = {}

    def fake_update(workbook, salesman_id, *, field_values):
        captured["workbook"] = workbook
        captured["salesman_id"] = salesman_id
        captured["field_values"] = field_values

    updated_rows = [
        data_manager.SalesmanRow("S-001", "Alex", False)
    ]

    monkeypatch.setattr(data_manager, "update_salesman", fake_update)
    monkeypatch.setattr(data_manager, "iter_salesmen",
                        Mock(return_value=updated_rows))

    result = bll.update_salesman(context, "  S-001  ", is_active=False)

    assert result.salesman_id == "S-001"
    assert result.is_active is False
    assert captured["workbook"] is context.workbook
    assert captured["salesman_id"] == "S-001"
    assert captured["field_values"] == {"IsActive": False}
    assert context._cache["salesmen"] is not original_bucket


def test_update_salesman_requires_changes(context):
    """update_salesman should reject calls without any updates."""

    with pytest.raises(ValueError):
        bll.update_salesman(context, "S-002")


def test_update_salesman_unknown_id_raises(monkeypatch, context):
    """Missing salesmen should surface as MissingReferenceError."""

    monkeypatch.setattr(
        data_manager,
        "update_salesman",
        Mock(side_effect=KeyError("Salesman not found")),
    )

    with pytest.raises(bll.MissingReferenceError):
        bll.update_salesman(context, "UNKNOWN", is_active=False)
