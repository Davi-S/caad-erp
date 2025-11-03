import logging
import typing as t

from caad_erp import data_manager

from caad_erp.exceptions import BusinessRuleViolation, MissingReferenceError
from ..runtime import RuntimeContext, _get_cache_bucket, _invalidate_cache

logger = logging.getLogger(__name__)


def _ensure_salesmen_cache(context: RuntimeContext) -> t.Dict[str, t.Any]:
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

    bucket = _get_cache_bucket(context, "salesmen")
    if "all" not in bucket:
        all_salesmen = list(data_manager.iter_salesmen(context.workbook))
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


def list_salesmen(context: RuntimeContext, *, include_inactive: bool = False) -> t.List[data_manager.SalesmanRow]:
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
        list[data_manager.SalesmanRow]: Copy of the cached salesman dataset in
            sheet order.
    """
    cache = _ensure_salesmen_cache(context)
    source = cache["all"] if include_inactive else cache["active"]
    return list(source)


def get_salesman(context: RuntimeContext, salesman_id: str) -> data_manager.SalesmanRow:
    """Resolve a salesman record by its identifier.

    The lookup uses the salesman cache, ensuring repeated calls do not revisit
    the Excel sheet. Unknown identifiers surface as
    :class:`MissingReferenceError` instances to keep error handling consistent.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        salesman_id (str): Identifier populated in the ``Salesmen`` sheet.

    Returns:
        data_manager.SalesmanRow: Matching salesman dataclass retrieved from cache.

    Raises:
        MissingReferenceError: If ``salesman_id`` cannot be located.
    """
    cache = _ensure_salesmen_cache(context)
    try:
        return cache["by_id"][salesman_id]
    except KeyError as exc:
        logger.warning("Salesman lookup failed for id '%s'", salesman_id)
        raise MissingReferenceError(
            f"Unknown salesman id: {salesman_id}") from exc


def add_salesman(
    context: RuntimeContext,
    *,
    salesman_id: str,
    salesman_name: str,
    is_active: bool = True,
) -> data_manager.SalesmanRow:
    """Register a salesman while enforcing identifier uniqueness.

    Args:
        context (RuntimeContext): Runtime context providing workbook access.
        salesman_id (str): Unique identifier stored in the ``Salesmen`` sheet.
        salesman_name (str): Display name recorded next to the identifier.
        is_active (bool): Activation flag for the new salesman. Defaults to
            ``True``.

    Returns:
        data_manager.SalesmanRow: Persisted salesman dataclass.

    Raises:
        ValueError: If id or name values are blank.
        BusinessRuleViolation: When a salesman with the requested identifier
            already exists.
    """

    normalized_id = salesman_id.strip()
    if not normalized_id:
        logger.error("Salesman creation rejected: blank salesman_id")
        raise ValueError("Salesman ID must be provided")

    normalized_name = salesman_name.strip()
    if not normalized_name:
        logger.error("Salesman creation rejected: blank salesman_name")
        raise ValueError("Salesman name must be provided")

    bucket = _ensure_salesmen_cache(context)
    if normalized_id in bucket["by_id"]:
        logger.error(
            "Salesman creation rejected: duplicate id '%s'", normalized_id)
        raise BusinessRuleViolation(
            f"Salesman '{normalized_id}' already exists")

    record = data_manager.SalesmanRow(
        salesman_id=normalized_id,
        salesman_name=normalized_name,
        is_active=is_active,
    )

    data_manager.append_salesman(context.workbook, record)
    _invalidate_cache(context, "salesmen")
    logger.info("Registered salesman '%s' (%s)",
                record.salesman_id, record.salesman_name)
    return record


def update_salesman(
    context: RuntimeContext,
    salesman_id: str,
    *,
    salesman_name: t.Optional[str] = None,
    is_active: t.Optional[bool] = None,
) -> data_manager.SalesmanRow:
    """Update selected fields for a salesman and refresh caches."""

    normalized_id = salesman_id.strip()
    if not normalized_id:
        logger.error("Salesman update rejected: blank salesman_id")
        raise ValueError("Salesman ID must be provided")

    field_values: dict[str, t.Any] = {}

    if salesman_name is not None:
        normalized_name = str(salesman_name).strip()
        if not normalized_name:
            logger.error("Salesman update rejected: blank salesman_name")
            raise ValueError("Salesman name must be provided")
        field_values["SalesmanName"] = normalized_name

    if is_active is not None:
        if not isinstance(is_active, bool):
            logger.error(
                "Salesman update rejected: non-boolean is_active '%s'", is_active)
            raise ValueError("is_active must be a boolean value")
        field_values["IsActive"] = is_active

    if not field_values:
        logger.error("Salesman update rejected: no fields provided")
        raise ValueError("At least one field must be provided to update")

    try:
        data_manager.update_salesman(
            context.workbook, normalized_id, field_values=field_values)
    except KeyError as exc:
        logger.warning("Salesman update failed for id '%s'", normalized_id)
        raise MissingReferenceError(
            f"Unknown salesman id: {normalized_id}") from exc

    _invalidate_cache(context, "salesmen")
    updated = get_salesman(context, normalized_id)
    logger.info(
        "Updated salesman '%s' fields: %s",
        normalized_id,
        ", ".join(field_values.keys()),
    )
    return updated
