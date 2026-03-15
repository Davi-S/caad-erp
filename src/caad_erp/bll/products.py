"""Product-centric business logic built atop the data access layer.

The module caches workbook queries, exposes CRUD-like helpers for individual
products, and centralizes input validation. Functions prefer ``RuntimeContext``
objects to ensure callers operate on pre-validated configuration and share a
memoized cache across requests.
"""

import logging
import typing as t
import dataclasses
from decimal import Decimal

from caad_erp import dal, exceptions

from . import runtime

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class ProductCommand:
    """Command payload used by product create and update workflows."""

    product_id: str
    product_name: t.Optional[str] = None
    sell_price: t.Optional[Decimal] = None
    is_active: t.Optional[bool] = None


def _ensure_products_cache(context: runtime.RuntimeContext) -> t.Dict[str, t.Any]:
    """Populate the product cache bucket on demand.

    By storing both the full list and derivative structures, higher-level
    helpers can service different query patterns without touching the workbook
    again.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, t.Any]: Bucket containing ``all`` products, ``active``
            products, and a ``by_id`` lookup dictionary. Reuses prior
            computations when available.
    """

    bucket = runtime.get_cache_bucket(context, "products")
    if "all" not in bucket:
        all_products = list(dal.iter_products(context.workbook))
        bucket["all"] = all_products
        bucket["active"] = [
            product for product in all_products if product.is_active]
        bucket["by_id"] = {
            product.product_id: product for product in all_products}
        logger.debug(
            "Populated products cache with %d entries (%d active)",
            len(all_products),
            len(bucket["active"]),
        )
    return bucket


def list_products(context: runtime.RuntimeContext, *, include_inactive: bool = False) -> t.List[dal.ProductRow]:
    """Return cached product rows optionally filtered by active status.

    The helper interrogates the memoized product bucket so the workbook is not
    re-scanned between calls. When ``include_inactive`` is ``False`` only rows
    whose ``ProductRow.is_active`` flag evaluates to ``True`` are returned,
    preserving the default behavior expected by point-of-sale workflows.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        include_inactive (bool): When ``True`` the result includes soft-deleted
            or inactive products. The default is to surface only active entries.

    Returns:
        list[dal.ProductRow]: Copy of the cached product dataset in
            sheet order.
    """
    cache = _ensure_products_cache(context)
    source = cache["all"] if include_inactive else cache["active"]
    return list(source)


def get_product(context: runtime.RuntimeContext, product_id: str) -> dal.ProductRow:
    """Resolve a product record by its identifier.

    The lookup leverages the product cache for near constant-time access and
    raises :class:`MissingReferenceError` when the workbook does not contain
    the requested identifier.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        product_id (str): Identifier populated in the ``Products`` sheet.

    Returns:
        dal.ProductRow: Matching product dataclass sourced from cache.

    Raises:
        MissingReferenceError: If ``product_id`` is absent from the workbook.
    """
    cache = _ensure_products_cache(context)
    try:
        return cache["by_id"][product_id]
    except KeyError as exc:
        logger.warning("Product lookup failed for id '%s'", product_id)
        raise exceptions.MissingReferenceError(
            f"Unknown product id: {product_id}") from exc


def update_product(
    context: runtime.RuntimeContext,
    command: ProductCommand,
) -> dal.ProductRow:
    """Update selected fields for an existing product and refresh caches."""

    normalized_id = command.product_id.strip()
    if not normalized_id:
        logger.error("Product update rejected: blank product_id")
        raise ValueError("Product ID must be provided")

    field_values: dict[str, t.Any] = {}

    if command.product_name is not None:
        normalized_name = command.product_name.strip()
        if not normalized_name:
            logger.error("Product update rejected: blank product_name")
            raise ValueError("Product name must be provided")
        field_values["ProductName"] = normalized_name

    if command.sell_price is not None:
        price = command.sell_price
        if price < Decimal("0"):
            logger.error(
                "Product update rejected: negative sell_price '%s'", price)
            raise ValueError("Sell price must be zero or positive")

        field_values["SellPrice"] = price

    if command.is_active is not None:
        field_values["IsActive"] = command.is_active

    if not field_values:
        logger.error("Product update rejected: no fields provided")
        raise ValueError("At least one field must be provided to update")

    try:
        dal.update_product(
            context.workbook, normalized_id, field_values=field_values)
    except KeyError as exc:
        logger.warning("Product update failed for id '%s'", normalized_id)
        raise exceptions.MissingReferenceError(
            f"Unknown product id: {normalized_id}") from exc

    runtime.invalidate_cache(context, "products")
    updated = get_product(context, normalized_id)
    logger.info(
        "Updated product '%s' fields: %s",
        normalized_id,
        ", ".join(field_values.keys()),
    )
    return updated


def add_product(
    context: runtime.RuntimeContext,
    command: ProductCommand,
) -> dal.ProductRow:
    """Append a product row after enforcing catalog invariants.

    Args:
        context (RuntimeContext): Active runtime context encapsulating settings
            and workbook references.
        command (ProductCommand): Structured command that must provide all
            mutable fields when creating a product.

    Returns:
        dal.ProductRow: Persisted product record represented as a DAL
            dataclass.

    Raises:
        ValueError: If identifiers, names, or monetary values fail validation.
        BusinessRuleViolation: When attempting to register a duplicate product
            identifier.
    """

    normalized_id = command.product_id.strip()
    if not normalized_id:
        logger.error("Product creation rejected: blank product_id")
        raise ValueError("Product ID must be provided")

    if command.product_name is None:
        logger.error("Product creation rejected: missing product_name")
        raise ValueError("Product name must be provided")
    normalized_name = command.product_name.strip()
    if not normalized_name:
        logger.error("Product creation rejected: blank product_name")
        raise ValueError("Product name must be provided")

    if command.sell_price is None:
        logger.error("Product creation rejected: missing sell_price")
        raise ValueError("Sell price must be provided")

    price = command.sell_price
    if price < Decimal("0"):
        logger.error(
            "Product creation rejected: negative sell_price '%s'", price)
        raise ValueError("Sell price must be zero or positive")

    if command.is_active is None:
        logger.error("Product creation rejected: missing is_active")
        raise ValueError("is_active must be provided")

    bucket = _ensure_products_cache(context)
    if normalized_id in bucket["by_id"]:
        logger.error(
            "Product creation rejected: duplicate id '%s'", normalized_id)
        raise exceptions.BusinessRuleViolation(
            f"Product '{normalized_id}' already exists")

    record = dal.ProductRow(
        product_id=normalized_id,
        product_name=normalized_name,
        sell_price=price,
        is_active=command.is_active,
    )

    dal.append_product(context.workbook, record)
    runtime.invalidate_cache(context, "products")
    logger.info(
        "Registered product '%s' (%s) with sell price %s",
        record.product_id,
        record.product_name,
        record.sell_price,
    )
    return record
