import configparser
import dataclasses
import logging
import typing as t
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_FILE_NAME = "config.ini"


@dataclasses.dataclass(frozen=True)
class ConfigSettings:
    """Typed representation of the ``config.ini`` settings we care about."""

    data_file: Path
    lounge_name: str
    schema_version: str
    default_salesman_id: str


def find_config_file(explicit_path: t.Optional[Path] = None) -> Path:
    """Locate the configuration file that controls how the data layer behaves.

    If the caller provides ``explicit_path`` the value is returned immediately
    without any verification, which allows the caller to deliberately target a
    non-standard location. When no explicit path is given the function walks up
    from the current working directory toward the filesystem root looking for a
    file named ``CONFIG_FILE_NAME``. The first match that exists on disk is
    considered authoritative.

    Args:
        explicit_path (Path | None): Optional path to use instead of performing
            the upward search. May be relative to the current working directory.

    Returns:
        Path: The path provided by the caller or the discovered configuration
            file. The path is *not* resolved or validated when supplied
            explicitly.

    Raises:
        FileNotFoundError: If the search exhausts all parent directories without
            finding ``CONFIG_FILE_NAME``.
    """

    if explicit_path:
        logger.debug("Using explicit config path '%s'", explicit_path)
        return explicit_path

    # Walk upwards from the current working directory looking for CONFIG_FILE_NAME
    current = Path.cwd()
    root = current.anchor or Path(current.root) if hasattr(
        current, "root") else Path(current.root)
    for p in (current, *current.parents):
        candidate = p / CONFIG_FILE_NAME
        if candidate.exists():
            logger.debug("Discovered config file at '%s'", candidate)
            return candidate

    logger.error("Configuration file '%s' not found starting from '%s'",
                 CONFIG_FILE_NAME, current)
    raise FileNotFoundError(
        f"Configuration file not found: {CONFIG_FILE_NAME}")


def read_config(config_path: Path) -> configparser.ConfigParser:
    """Load ``config.ini`` and return a populated ``ConfigParser`` instance.

    The function expands user home references (``~``), resolves the absolute
    path, and validates that the file exists before parsing it. Callers receive
    the ``ConfigParser`` even if individual sections are missing; validation of
    required entries happens in :func:`parse_settings`.

    Args:
        config_path (Path): Path to the configuration file, relative or
            absolute.

    Returns:
        configparser.ConfigParser: Initialized parser containing the raw
            configuration data.

    Raises:
        FileNotFoundError: If ``config_path`` does not exist after expansion and
            resolution.
    """

    config_path = config_path.expanduser().resolve()
    logger.debug("Reading configuration file '%s'", config_path)
    if not config_path.exists():
        logger.error("Configuration file not found at '%s'", config_path)
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    parser = configparser.ConfigParser()
    parser.read(config_path)
    logger.debug("Loaded configuration data from '%s'", config_path)
    return parser


def parse_settings(parser: configparser.ConfigParser, *, base_path: t.Optional[Path] = None) -> ConfigSettings:
    """Convert a ``ConfigParser`` into strongly typed :class:`ConfigSettings`.

    The function validates that all required options are present under the
    expected sections and normalizes the configured data file path. Relative
    paths are expanded against ``base_path`` when provided, or against the
    current working directory as a fallback. Resulting paths are resolved to an
    absolute form to ensure downstream consumers operate on canonical values.

    Args:
        parser (configparser.ConfigParser): Parsed configuration data.
        base_path (Path | None): Directory to use as the anchor for relative
            ``DataFile`` entries. Defaults to :func:`Path.cwd` when omitted.

    Returns:
        ConfigSettings: Immutable settings container with resolved data file
            path, lounge metadata, schema version, and default salesman id.

    Raises:
        KeyError: If one of the required sections or options is missing from the
            configuration.
    """

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
        if base_path is None:
            base_path = Path.cwd()
        data_file_path = (base_path / data_file_path).resolve()

    settings = ConfigSettings(
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
