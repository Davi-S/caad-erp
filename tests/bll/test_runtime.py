from dataclasses import replace
from unittest.mock import Mock

import pytest

from caad_erp import bll, constants
from caad_erp import dal


def test_load_runtime_context_returns_context(monkeypatch, tmp_path):
    """load_runtime_context should assemble settings and workbook into a context."""

    config_path = tmp_path / "config.ini"
    parser = Mock(name="parser")
    parsed_settings = dal.ConfigSettings(
        data_file=tmp_path / "master.xlsx",
        lounge_name="Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S-DEFAULT",
    )
    workbook = Mock(name="workbook")

    find_config_file = Mock(return_value=config_path)
    read_config = Mock(return_value=parser)
    parse_settings = Mock(return_value=parsed_settings)
    open_workbook = Mock(return_value=workbook)

    monkeypatch.setattr(dal, "find_config_file", find_config_file)
    monkeypatch.setattr(dal, "read_config", read_config)
    monkeypatch.setattr(dal, "parse_settings", parse_settings)
    monkeypatch.setattr(dal, "open_workbook", open_workbook)

    context = bll.load_runtime_context(config_path)

    assert context.settings is parsed_settings
    assert context.workbook is workbook
    find_config_file.assert_called_once_with(config_path)
    read_config.assert_called_once_with(config_path.resolve())
    parse_settings.assert_called_once_with(
        parser, base_path=config_path.resolve().parent)
    open_workbook.assert_called_once_with(parsed_settings.data_file)


def test_ensure_schema_version_rejects_mismatch(context):
    """Schema mismatches should surface a RuntimeError with clear messaging."""

    bad_settings = replace(context.settings, schema_version="0.9")
    bad_context = bll.RuntimeContext(
        settings=bad_settings, workbook=context.workbook)
    with pytest.raises(RuntimeError):
        bll.ensure_schema_version(bad_context)


def test_persist_context_writes_to_disk(monkeypatch, context):
    """persist_context should flush workbook changes to disk."""

    save_mock = Mock()
    monkeypatch.setattr(dal, "save_workbook", save_mock)

    bll.persist_context(context)

    save_mock.assert_called_once_with(
        context.workbook, destination=context.settings.data_file)


def test_refresh_context_reloads_from_disk(monkeypatch, settings):
    """refresh_context should discard in-memory workbook state and reload."""

    refreshed_workbook = Mock(name="reloaded")
    refresh_mock = Mock(return_value=refreshed_workbook)
    monkeypatch.setattr(dal, "refresh_workbook", refresh_mock)

    original = bll.RuntimeContext(settings=settings, workbook=Mock())
    reloaded_context = bll.refresh_context(original)

    refresh_mock.assert_called_once_with(settings.data_file)
    assert reloaded_context.workbook is refreshed_workbook
    assert reloaded_context.settings is settings
    assert reloaded_context is not original
