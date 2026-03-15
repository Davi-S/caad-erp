"""Salesman management routines for the business logic layer.

This module wraps raw workbook operations with input validation, cache
management, and friendly dataclass returns. Centralized logic keeps
command handlers focused on parsing user intent while this module enforces
invariants and active status checks.
"""

import logging
import typing as t
import dataclasses

from caad_erp import dal, exceptions

from . import runtime

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class SalesmanCommand:
    """Command payload used by salesman create and update workflows."""

    salesman_id: str
    salesman_name: t.Optional[str] = None
    is_active: t.Optional[bool] = None


def _ensure_salesmen_cache(context: runtime.RuntimeContext) -> t.Dict[str, t.Any]:
    """Populate the salesman cache bucket on demand.

    The bucket mirrors the structure used for products so public APIs can rely
    on a consistent shape when retrieving cached data.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, t.Any]: Bucket containing ``all`` salesmen, ``active`` salesmen,
            and a ``by_id`` lookup dictionary.
    """

    bucket = runtime.get_cache_bucket(context, "salesmen")
    if "all" not in bucket:
        all_salesmen = list(dal.iter_salesmen(context.workbook))
        bucket["all"] = all_salesmen
        bucket["active"] = [
            salesman for salesman in all_salesmen if salesman.is_active]
        bucket["by_id"] = {
            salesman.salesman_id: salesman for salesman in all_salesmen}
        logger.debug(
            "Populated salesmen cache with %d entries (%d active)",
            len(all_salesmen),
            len(bucket["active"]),
        )
    return bucket


def list_salesmen(context: runtime.RuntimeContext, *, include_inactive: bool = False) -> t.List[dal.SalesmanRow]:
    """Return cached salesman rows optionally filtered by active status.

    Like :func:`list_products`, this helper operates on the memoized salesman
    bucket to avoid workbook iteration. Callers opt into seeing inactive
    records when they need historical reporting or audit trails.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        include_inactive (bool): When ``True`` exposes inactive salesmen.
            Defaults to active-only listings for operational flows.

    Returns:
        list[dal.SalesmanRow]: Copy of the cached salesman dataset in
            sheet order.
    """
    cache = _ensure_salesmen_cache(context)
    source = cache["all"] if include_inactive else cache["active"]
    return list(source)


def get_salesman(context: runtime.RuntimeContext, salesman_id: str) -> dal.SalesmanRow:
    """Resolve a salesman record by its identifier.

    The lookup uses the salesman cache, ensuring repeated calls do not revisit
    the Excel sheet. Unknown identifiers surface as
    :class:`MissingReferenceError` instances to keep error handling consistent.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        salesman_id (str): Identifier populated in the ``Salesmen`` sheet.

    Returns:
        dal.SalesmanRow: Matching salesman dataclass retrieved from cache.

    Raises:
        MissingReferenceError: If ``salesman_id`` cannot be located.
    """
    cache = _ensure_salesmen_cache(context)
    try:
        return cache["by_id"][salesman_id]
    except KeyError as exc:
        logger.warning("Salesman lookup failed for id '%s'", salesman_id)
        raise exceptions.MissingReferenceError(
            f"Unknown salesman id: {salesman_id}") from exc


def add_salesman(
    context: runtime.RuntimeContext,
    command: SalesmanCommand,
) -> dal.SalesmanRow:
    """Register a salesman while enforcing identifier uniqueness.

    Args:
        context (RuntimeContext): Runtime context providing workbook access.
        command (SalesmanCommand): Structured command that must provide all
            mutable fields when creating a salesman.

    Returns:
        dal.SalesmanRow: Persisted salesman dataclass.

    Raises:
        ValueError: If id or name values are blank.
        BusinessRuleViolation: When a salesman with the requested identifier
            already exists.
    """

    normalized_id = command.salesman_id.strip()
    if not normalized_id:
        logger.error("Salesman creation rejected: blank salesman_id")
        raise ValueError("Salesman ID must be provided")

    if command.salesman_name is None:
        logger.error("Salesman creation rejected: missing salesman_name")
        raise ValueError("Salesman name must be provided")
    normalized_name = command.salesman_name.strip()
    if not normalized_name:
        logger.error("Salesman creation rejected: blank salesman_name")
        raise ValueError("Salesman name must be provided")

    if command.is_active is None:
        logger.error("Salesman creation rejected: missing is_active")
        raise ValueError("is_active must be provided")

    bucket = _ensure_salesmen_cache(context)
    if normalized_id in bucket["by_id"]:
        logger.error(
            "Salesman creation rejected: duplicate id '%s'", normalized_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{normalized_id}' already exists")

    record = dal.SalesmanRow(
        salesman_id=normalized_id,
        salesman_name=normalized_name,
        is_active=command.is_active,
    )

    dal.append_salesman(context.workbook, record)
    runtime.invalidate_cache(context, "salesmen")
    logger.info("Registered salesman '%s' (%s)",
                record.salesman_id, record.salesman_name)
    return record


def update_salesman(
    context: runtime.RuntimeContext,
    command: SalesmanCommand,
) -> dal.SalesmanRow:
    """Update selected fields for a salesman and refresh caches."""

    normalized_id = command.salesman_id.strip()
    if not normalized_id:
        logger.error("Salesman update rejected: blank salesman_id")
        raise ValueError("Salesman ID must be provided")

    field_values: dict[str, t.Any] = {}

    if command.salesman_name is not None:
        normalized_name = command.salesman_name.strip()
        if not normalized_name:
            logger.error("Salesman update rejected: blank salesman_name")
            raise ValueError("Salesman name must be provided")
        field_values["SalesmanName"] = normalized_name

    if command.is_active is not None:
        field_values["IsActive"] = command.is_active

    if not field_values:
        logger.error("Salesman update rejected: no fields provided")
        raise ValueError("At least one field must be provided to update")

    try:
        dal.update_salesman(
            context.workbook, normalized_id, field_values=field_values)
    except KeyError as exc:
        logger.warning("Salesman update failed for id '%s'", normalized_id)
        raise exceptions.MissingReferenceError(
            f"Unknown salesman id: {normalized_id}") from exc

    runtime.invalidate_cache(context, "salesmen")
    updated = get_salesman(context, normalized_id)
    logger.info(
        "Updated salesman '%s' fields: %s",
        normalized_id,
        ", ".join(field_values.keys()),
    )
    return updated
