import configparser
from pathlib import Path

import pytest

from caad_erp import dal


def test_find_config_file_respects_explicit_path(config_file: Path):
    """Supplying an explicit path should be treated as the winning answer."""

    result = dal.find_config_file(config_file)
    assert result == config_file


def test_find_config_file_discovers_in_cwd(tmp_path, monkeypatch):
    """Auto-discovery should locate config.ini in the working directory tree."""

    config_dir = tmp_path / "nested"
    config_dir.mkdir(parents=True)
    config_file = config_dir / "config.ini"
    config_file.write_text("[System]\nDataFile=master_workbook.xlsx")
    monkeypatch.chdir(config_dir)

    result = dal.find_config_file()
    assert result == config_file


def test_find_config_file_raises_when_missing(tmp_path, monkeypatch):
    """Absent configuration should surface a clear FileNotFoundError."""

    monkeypatch.chdir(tmp_path)
    with pytest.raises(FileNotFoundError):
        dal.find_config_file()


def test_read_config_loads_sections(config_file: Path):
    """read_config should return a populated ConfigParser."""

    parser = dal.read_config(config_file)
    assert parser.get("System", "LoungeName") == "Test Lounge"
    assert parser.get("Defaults", "DefaultSalesman") == "S-DEFAULT"


def test_read_config_missing_file_raises(tmp_path):
    """Missing files should propagate a FileNotFoundError."""

    with pytest.raises(FileNotFoundError):
        dal.read_config(tmp_path / "not_there.ini")


def test_parse_settings_resolves_relative_paths(config_factory):
    """Relative DataFile entries should be anchored to the config location."""

    parser = configparser.ConfigParser()
    bundle = config_factory(make_relative=True)
    parser.read(bundle.config_path)
    settings = dal.parse_settings(
        parser, base_path=bundle.config_path.parent)
    assert settings.data_file == (
        bundle.config_path.parent / bundle.workbook_path.name).resolve()
    assert settings.default_salesman_id == "S-DEFAULT"


def test_parse_settings_requires_expected_sections(tmp_path):
    """Missing keys should result in a descriptive KeyError."""

    parser = configparser.ConfigParser()
    parser.read_string("[Other]\nvalue=1")
    with pytest.raises(KeyError):
        dal.parse_settings(parser, base_path=tmp_path)
