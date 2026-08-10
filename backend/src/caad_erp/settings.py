"""Centralized application settings for CAAD ERP."""

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


def _discover_config_file(explicit_path: Optional[Path] = None) -> Path:
    """Find the configuration file, honoring overrides when provided."""

    if explicit_path is not None:
        return Path(explicit_path).expanduser()

    current = Path.cwd()
    for directory in (current, *current.parents):
        candidate = directory / CONFIG_FILE_NAME
        if candidate.exists():
            return candidate.resolve()

    raise FileNotFoundError(f"Configuration file not found: {CONFIG_FILE_NAME}")


def _parse_settings(parser: configparser.ConfigParser, base_path: Path) -> AppSettings:
    """Extract and normalize settings values from a populated ``ConfigParser``."""

    try:
        data_file_raw = parser.get("System", "DataFile")
        lounge_name = parser.get("System", "LoungeName")
        schema_version = parser.get("System", "SchemaVersion")
        default_salesman = parser.get("Defaults", "DefaultSalesman")
    except (configparser.NoSectionError, configparser.NoOptionError) as exc:
        raise KeyError(f"Missing required configuration entry: {exc}") from exc

    data_file = Path(data_file_raw)
    if not data_file.is_absolute():
        data_file = (base_path / data_file).resolve()

    return AppSettings(
        data_file=data_file,
        lounge_name=lounge_name,
        schema_version=schema_version,
        default_salesman_id=default_salesman,
    )


def get_settings(config_path: Optional[Path] = None) -> AppSettings:
    """Discover, parse, and return application settings."""

    resolved = _discover_config_file(config_path).expanduser().resolve()

    if not resolved.exists():
        raise FileNotFoundError(f"Configuration file not found: {resolved}")

    parser = configparser.ConfigParser()
    parser.read(resolved)

    return _parse_settings(parser, resolved.parent)
