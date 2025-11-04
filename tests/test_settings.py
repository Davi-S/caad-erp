import configparser
from pathlib import Path

import pytest

from caad_erp import settings


def test_discover_config_file_respects_explicit_path(config_file: Path):
    """
    Given an explicit config path 
    When discover_config_file executes 
    Then the same path is returned.
    """

    # Arrange
    explicit_path = config_file

    # Act
    result = settings.discover_config_file(explicit_path)

    # Assert
    assert result == explicit_path


def test_discover_config_file_discovers_in_cwd(tmp_path, monkeypatch):
    """
    Given a directory containing config.ini 
    When discover_config_file auto-discovers 
    Then the config path resolves.
    """

    # Arrange
    config_dir = tmp_path / "nested"
    config_dir.mkdir(parents=True)
    config_file = config_dir / "config.ini"
    config_file.write_text("[System]\nDataFile=master_workbook.xlsx")
    monkeypatch.chdir(config_dir)

    # Act
    result = settings.discover_config_file()

    # Assert
    assert result == config_file


def test_discover_config_file_raises_when_missing(tmp_path, monkeypatch):
    """
    Given no config files present 
    When discover_config_file runs 
    Then FileNotFoundError surfaces.
    """

    # Arrange
    monkeypatch.chdir(tmp_path)

    # Act / Assert
    with pytest.raises(FileNotFoundError):
        settings.discover_config_file()


def test_read_config_loads_sections(config_file: Path):
    """
    Given a valid config file 
    When read_config executes 
    Then the sections load correctly.
    """

    # Arrange
    target_path = config_file

    # Act
    parser = settings.read_config(target_path)

    # Assert
    assert parser.get("System", "LoungeName") == "Test Lounge"
    assert parser.get("Defaults", "DefaultSalesman") == "S-DEFAULT"


def test_read_config_missing_file_raises(tmp_path):
    """
    Given a missing config path 
    When read_config executes 
    Then FileNotFoundError is raised.
    """

    # Arrange
    missing_path = tmp_path / "not_there.ini"

    # Act / Assert
    with pytest.raises(FileNotFoundError):
        settings.read_config(missing_path)


def test_parse_settings_resolves_relative_paths(config_factory):
    """
    Given relative workbook paths 
    When parse_settings loads them 
    Then the paths anchor to the config directory.
    """

    # Arrange
    parser = configparser.ConfigParser()
    bundle = config_factory(make_relative=True)
    parser.read(bundle.config_path)

    # Act
    loaded = settings.parse_settings(
        parser, base_path=bundle.config_path.parent)

    # Assert
    assert loaded.data_file == (
        bundle.config_path.parent / bundle.workbook_path.name).resolve()
    assert loaded.default_salesman_id == "S-DEFAULT"


def test_parse_settings_requires_expected_sections(tmp_path):
    """
    Given missing required sections 
    When parse_settings validates 
    Then KeyError is raised.
    """

    # Arrange
    parser = configparser.ConfigParser()
    parser.read_string("[Other]\nvalue=1")

    # Act / Assert
    with pytest.raises(KeyError):
        settings.parse_settings(parser, base_path=tmp_path)


def test_load_settings_reads_and_caches(config_file: Path, monkeypatch):
