"""Centralized application settings for CAAD ERP.

This module consolidates discovery and parsing of the ``config.ini`` file used
throughout the application. Callers interact with the strongly typed
:class:`AppSettings` dataclass via :func:`get_settings`.
"""

import configparser
import dataclasses
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

CONFIG_FILE_NAME = "config.ini"


@dataclasses.dataclass(frozen=True)
class AppSettings:
    """Typed representation of settings loaded from ``config.ini``."""

    data_file: Path
    lounge_name: str
    schema_version: str
    default_salesman_id: str


def discover_config_file(explicit_path: Optional[Path] = None) -> Path:
    """Find the configuration file, honoring overrides when provided."""

    if explicit_path is not None:
        candidate = Path(explicit_path).expanduser()
        logger.debug("Using explicit config path '%s'", candidate)
        return candidate

    current = Path.cwd()
    for directory in (current, *current.parents):
        candidate = directory / CONFIG_FILE_NAME
        if candidate.exists():
            logger.debug("Discovered config file at '%s'", candidate)
            return candidate.resolve()

    logger.error(
        "Configuration file '%s' not found starting from '%s'",
        CONFIG_FILE_NAME,
        current,
    )
    raise FileNotFoundError(
        f"Configuration file not found: {CONFIG_FILE_NAME}")


def read_config(config_path: Path) -> configparser.ConfigParser:
    """Read and parse an INI file, returning a populated ``ConfigParser``."""

    resolved = Path(config_path).expanduser().resolve()
    logger.debug("Reading configuration file '%s'", resolved)
    if not resolved.exists():
        logger.error("Configuration file not found at '%s'", resolved)
        raise FileNotFoundError(f"Configuration file not found: {resolved}")

    parser = configparser.ConfigParser()
    parser.read(resolved)
    return parser


def parse_settings(parser: configparser.ConfigParser, *, base_path: Optional[Path] = None) -> AppSettings:
    """Convert raw parser data into immutable :class:`AppSettings`."""

    try:
        data_file_raw = parser.get("System", "DataFile")
        lounge_name = parser.get("System", "LoungeName")
        schema_version = parser.get("System", "SchemaVersion")
        default_salesman = parser.get("Defaults", "DefaultSalesman")
    except (configparser.NoSectionError, configparser.NoOptionError) as exc:
        logger.error("Missing required configuration entry: %s", exc)
        raise KeyError(f"Missing required configuration entry: {exc}") from exc

    data_file_path = Path(data_file_raw)
    if not data_file_path.is_absolute():
        anchor = base_path if base_path is not None else Path.cwd()
        data_file_path = (anchor / data_file_path).resolve()

    settings = AppSettings(
        data_file=data_file_path,
        lounge_name=lounge_name,
        schema_version=schema_version,
        default_salesman_id=default_salesman,
    )

    logger.debug(
        "Parsed settings: data_file='%s', lounge='%s', schema='%s', default_salesman='%s'",
        settings.data_file,
        settings.lounge_name,
        settings.schema_version,
        settings.default_salesman_id,
    )

    return settings


def load_settings(config_path: Path) -> AppSettings:
    """Load settings from a specific path, bypassing config discovery."""

    resolved = Path(config_path).expanduser().resolve()
    parser = read_config(resolved)
    return parse_settings(parser, base_path=resolved.parent)


def get_settings(config_path: Optional[Path] = None) -> AppSettings:
    """Resolve, parse, and cache settings for the supplied config path."""

    located = discover_config_file(config_path)
    return load_settings(located)
