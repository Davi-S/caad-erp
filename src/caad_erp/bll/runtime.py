
import logging
import typing as t
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl.workbook import Workbook

from caad_erp import data_manager

from caad_erp.constants import EXPECTED_SCHEMA_VERSION

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RuntimeContext:
    """Container for configuration and workbook references used by the BLL."""

    settings: data_manager.ConfigSettings
    workbook: Workbook
    _cache: t.Dict[str, t.Dict[str, t.Any]] = field(
        default_factory=dict, repr=False, compare=False)


def persist_context(context: RuntimeContext) -> None:
    """Persist any in-memory workbook changes to disk.

    Args:
        context (RuntimeContext): Runtime context whose workbook should be
            saved.

    The function supplies :attr:`RuntimeContext.settings.data_file` directly to
    the data layer to ensure saves always target the configured workbook path.
    In-memory caches remain valid because the workbook handle is unchanged
    after the save completes.
    """
    data_manager.save_workbook(
        context.workbook,
        destination=context.settings.data_file,
    )
    logger.info("Persisted workbook '%s'", context.settings.data_file)


def refresh_context(context: RuntimeContext) -> RuntimeContext:
    """Reload the workbook to discard unsaved modifications.

    Args:
        context (RuntimeContext): Runtime context whose settings should be
            reused.

    Returns:
        RuntimeContext: Fresh context containing a newly opened workbook and
            an empty cache.

    Raises:
        FileNotFoundError: If the backing workbook cannot be reloaded.

    This is effectively a "revert" operation that drops in-memory edits and
    hands back a pristine workbook pointer. Because a new :class:`RuntimeContext`
    is produced, any cached data from the previous context is discarded.
    """
    workbook = data_manager.refresh_workbook(context.settings.data_file)
    logger.info("Reloaded workbook '%s'", context.settings.data_file)
    return RuntimeContext(settings=context.settings, workbook=workbook)


def _get_cache_bucket(context: RuntimeContext, name: str) -> t.Dict[str, t.Any]:
    """Return a mutable cache bucket dedicated to the supplied name.

    The business logic layer maintains in-memory caches keyed by domain area
    (products, salesmen, transactions). This helper retrieves or initializes
    the bucket associated with ``name``. Buckets are simple dictionaries that
    store precomputed query results, significantly reducing repeated workbook
    scans.

    Args:
        context (RuntimeContext): Runtime state carrying the shared cache
            dictionary.
        name (str): Logical bucket name to fetch or create.

    Returns:
        dict[str, Any]: Mutable mapping used to cache derived collections for a
            specific domain entity set.
    """

    bucket = context._cache.get(name)
    if bucket is None:
        logger.debug("Initializing cache bucket '%s'", name)
        bucket = {}
        context._cache[name] = bucket
    return bucket


def _invalidate_cache(context: RuntimeContext, *names: str) -> None:
    """Evict one or more cache buckets after mutating workbook state.

    Following write operations, invalidation ensures subsequent reads rebuild
    their caches from the updated workbook rather than serving stale data.

    Args:
        context (RuntimeContext): Active runtime context whose cache should be
            pruned.
        *names (str): Variable-length list of bucket identifiers to remove.
            Missing buckets are ignored gracefully so callers can request
            targeted invalidation without defensive checks.    
    """

    if not names:
        return

    logger.debug("Invalidating cache buckets: %s", ", ".join(names))

    for name in names:
        context._cache.pop(name, None)


def load_runtime_context(config_path: t.Optional[Path] = None) -> RuntimeContext:
    """Load configuration settings and a live workbook for the BLL.

    The helper forms the foundation for all business logic calls by resolving
    ``config.ini``, parsing settings, and opening the Excel workbook that
    stores transactional data. The resulting :class:`RuntimeContext` bundles the
    immutable settings with a mutable workbook handle and an empty cache store.

    Args:
        config_path (Path | None): Optional override path for the configuration
            file. When omitted the data layer performs its upward search from
            the current working directory.

    Returns:
        RuntimeContext: Fully populated context ready for orchestration
            functions.

    Raises:
        FileNotFoundError: If the configuration file or workbook cannot be
            located.
        KeyError: When mandatory configuration options are missing.
    """
    located_config = data_manager.find_config_file(config_path)
    resolved_config = Path(located_config).expanduser().resolve()
    parser = data_manager.read_config(resolved_config)
    settings = data_manager.parse_settings(
        parser, base_path=resolved_config.parent)
    workbook = data_manager.open_workbook(settings.data_file)
    logger.info("Loaded runtime context for workbook '%s'", settings.data_file)
    return RuntimeContext(settings=settings, workbook=workbook)


def ensure_schema_version(context: RuntimeContext) -> None:
    """Validate workbook compatibility before mutating state.

    The CAAD ERP workbook evolves alongside the source code. This guard
    ensures the version stored in ``config.ini`` matches the application-level
    ``EXPECTED_SCHEMA_VERSION`` before later routines perform inserts.

    Args:
        context (RuntimeContext): Runtime context containing the resolved
            settings.

    Raises:
        RuntimeError: If the schema version declared in the configuration does
            not match ``EXPECTED_SCHEMA_VERSION``.
    """
    if context.settings.schema_version != EXPECTED_SCHEMA_VERSION:
        logger.error(
            "Workbook schema mismatch: expected %s, found %s",
            EXPECTED_SCHEMA_VERSION,
            context.settings.schema_version,
        )
        raise RuntimeError(
            f"Workbook schema mismatch: expected {EXPECTED_SCHEMA_VERSION}, found {context.settings.schema_version}"
        )

    logger.debug("Schema version '%s' validated",
                 context.settings.schema_version)
