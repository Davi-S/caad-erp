"""Salesman management routines for the business logic layer.

This module wraps raw workbook operations with input validation, cache
management, and friendly dataclass returns. Centralized logic keeps
command handlers focused on parsing user intent while this module enforces
invariants and active status checks.
"""

import dataclasses
import logging
import typing as t

from caad_erp import dal
from caad_erp.bll import rules, runtime

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class SalesmanCommand:
    """Command payload used by salesman create and update workflows."""

    salesman_id: str
    salesman_name: str | None = None
    is_active: bool | None = None


# Rationale (Salesman Update Workflow):
# 1. Non-blank Identifiers (DEVELOPER_GUIDE.md #Salesmen):
#    - SalesmanID and SalesmanName must be non-empty text identifiers.
SALESMAN_UPDATE_RULES: list[rules.BaseRule] = [
    rules.NON_EMPTY_SALESMAN_ID,
    rules.NON_EMPTY_SALESMAN_NAME,
    rules.AT_LEAST_ONE_SALESMAN_FIELD,
]

# Rationale (Salesman Creation Workflow):
# 1. Mandatory Attributes:
#    - All salesman creations must explicitly specify a non-blank ID, non-blank name,
#      and active status flag.
SALESMAN_ADD_RULES: list[rules.BaseRule] = [
    rules.NON_EMPTY_SALESMAN_ID,
    rules.REQUIRED_SALESMAN_NAME,
    rules.REQUIRED_IS_ACTIVE,
]


def _ensure_salesmen_cache(context: runtime.RuntimeContext) -> dict[str, t.Any]:
    """Populate the salesman cache bucket on demand."""
    bucket = runtime.get_cache_bucket(context, "salesmen")
    if "all" not in bucket:
        all_salesmen = list(dal.iter_salesmen(context.workbook))
        bucket["all"] = all_salesmen
        bucket["by_id"] = {salesman.salesman_id: salesman for salesman in all_salesmen}
        logger.debug(
            "Populated salesmen cache with %d entries",
            len(all_salesmen),
        )
    return bucket


def list_salesmen(context: runtime.RuntimeContext) -> list[dal.SalesmanRow]:
    """Return every cached salesman row."""
    cache = _ensure_salesmen_cache(context)
    return list(cache["all"])


def get_salesman(context: runtime.RuntimeContext, salesman_id: str) -> dal.SalesmanRow:
    """Resolve a salesman record by its identifier.

    Raises SalesmanNotFoundError if salesman_id cannot be located.
    """
    cache = _ensure_salesmen_cache(context)
    try:
        return cache["by_id"][salesman_id]
    except KeyError as exc:
        logger.warning("Salesman lookup failed for id '%s'", salesman_id)
        raise rules.SalesmanNotFoundError(
            f"[Salesman Exists] Unknown salesman id: {salesman_id}"
        ) from exc


def add_salesman(
    context: runtime.RuntimeContext,
    command: SalesmanCommand,
) -> dal.SalesmanRow:
    """Register a salesman while enforcing identifier uniqueness."""
    rules.enforce_rules(context, command, SALESMAN_ADD_RULES)

    normalized_id = command.salesman_id.strip()
    normalized_name = command.salesman_name.strip() if command.salesman_name else ""

    bucket = _ensure_salesmen_cache(context)
    if normalized_id in bucket["by_id"]:
        logger.error("Salesman creation rejected: duplicate id '%s'", normalized_id)
        raise rules.DuplicateSalesmanError(f"Salesman '{normalized_id}' already exists")

    record = dal.SalesmanRow(
        salesman_id=normalized_id,
        salesman_name=normalized_name,
        is_active=bool(command.is_active),
    )

    dal.append_salesman(context.workbook, record)
    runtime.invalidate_cache(context, "salesmen")
    logger.info(
        "Registered salesman '%s' (%s)", record.salesman_id, record.salesman_name
    )
    return record


def update_salesman(
    context: runtime.RuntimeContext,
    command: SalesmanCommand,
) -> dal.SalesmanRow:
    """Update selected fields for a salesman and refresh caches."""
    rules.enforce_rules(context, command, SALESMAN_UPDATE_RULES)

    normalized_id = command.salesman_id.strip()
    field_values: dict[str, t.Any] = {}

    if command.salesman_name is not None:
        field_values["SalesmanName"] = command.salesman_name.strip()
    if command.is_active is not None:
        field_values["IsActive"] = command.is_active

    try:
        dal.update_salesman(context.workbook, normalized_id, field_values=field_values)
    except KeyError as exc:
        logger.warning("Salesman update failed for id '%s'", normalized_id)
        raise rules.SalesmanNotFoundError(
            f"[Salesman Exists] Unknown salesman id: {normalized_id}"
        ) from exc

    runtime.invalidate_cache(context, "salesmen")
    updated = get_salesman(context, normalized_id)
    logger.info(
        "Updated salesman '%s' fields: %s",
        normalized_id,
        ", ".join(field_values.keys()),
    )
    return updated
