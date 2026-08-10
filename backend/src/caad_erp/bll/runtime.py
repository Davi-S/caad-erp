"""Runtime scaffolding shared by the business logic layer.

This module orchestrates configuration discovery, workbook lifecycle
management, and in-memory caching. Public helpers expose a single
``RuntimeContext`` dataclass that callers pass to product, salesman, or
transaction routines to guarantee consistent state sharing.
"""

import dataclasses
import logging
import typing as t
from pathlib import Path

from openpyxl.workbook import Workbook

from caad_erp import constants, dal, settings

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class RuntimeContext:
    """Container for configuration and workbook references used by the BLL."""

    settings: settings.AppSettings
    workbook: Workbook
    _cache: dict[str, dict[str, t.Any]] = dataclasses.field(
        default_factory=dict, repr=False, compare=False
    )


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
    dal.save_workbook(
        context.workbook,
        destination=context.settings.data_file,
    )
    logger.info("Persisted workbook '%s'", context.settings.data_file)


def get_cache_bucket(context: RuntimeContext, name: str) -> dict[str, t.Any]:
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


def invalidate_cache(context: RuntimeContext, *names: str) -> None:
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


def load_context(config_path: Path | None = None) -> RuntimeContext:
    """Build a runtime context from configuration and workbook resources.

    This helper obtains immutable configuration data via
    :func:`caad_erp.settings.get_settings`, opens the configured workbook, and
    returns the aggregated :class:`RuntimeContext`. Callers may supply an
    explicit ``config_path`` to bypass automatic discovery; otherwise the
    settings package searches upward from the current working directory for the
    canonical ``config.ini``.

    Args:
        config_path: Optional path to the configuration file. When ``None`` the
            settings loader performs its default discovery logic.

    Returns:
        RuntimeContext: Contains the resolved :class:`AppSettings`, an open
        ``Workbook`` instance, and an empty cache for downstream operations.

    Raises:
        FileNotFoundError: Propagated when the configuration file or workbook
            cannot be located at the resolved path.
        KeyError: Raised if the configuration file is missing required
            sections or options.
        PermissionError: Bubble-up from :func:`dal.open_workbook` when the
            workbook file exists but cannot be opened due to filesystem
            restrictions.
    """

    app_settings = settings.get_settings(config_path)
    workbook = dal.open_workbook(app_settings.data_file)
    logger.info("Loaded runtime context for workbook '%s'", app_settings.data_file)
    return RuntimeContext(settings=app_settings, workbook=workbook)


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
    if context.settings.schema_version != constants.EXPECTED_SCHEMA_VERSION:
        logger.error(
            "Workbook schema mismatch: expected %s, found %s",
            constants.EXPECTED_SCHEMA_VERSION,
            context.settings.schema_version,
        )
        raise RuntimeError(
            f"Workbook schema mismatch: expected {constants.EXPECTED_SCHEMA_VERSION}, found {context.settings.schema_version}"
        )

    logger.debug("Schema version '%s' validated", context.settings.schema_version)
