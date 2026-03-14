"""Product-centric business logic built atop the data access layer.

The module caches workbook queries, exposes CRUD-like helpers for individual
products, and centralizes input validation. Functions prefer ``RuntimeContext``
objects to ensure callers operate on pre-validated configuration and share a
memoized cache across requests.
"""

import logging
import typing as t
from decimal import Decimal, InvalidOperation

from caad_erp import dal, exceptions

from . import runtime

logger = logging.getLogger(__name__)


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
    product_id: str,
    *,
    product_name: t.Optional[str] = None,
    sell_price: t.Optional[Decimal] = None,
    is_active: t.Optional[bool] = None,
) -> dal.ProductRow:
    """Update selected fields for an existing product and refresh caches."""

    normalized_id = product_id.strip()
    if not normalized_id:
        logger.error("Product update rejected: blank product_id")
        raise ValueError("Product ID must be provided")

    field_values: dict[str, t.Any] = {}

    if product_name is not None:
        normalized_name = str(product_name).strip()
        if not normalized_name:
            logger.error("Product update rejected: blank product_name")
            raise ValueError("Product name must be provided")
        field_values["ProductName"] = normalized_name

    if sell_price is not None:
        try:
            price = sell_price if isinstance(
                sell_price, Decimal) else Decimal(sell_price)
        except (InvalidOperation, TypeError) as exc:
            logger.error(
                "Product update rejected: invalid sell_price '%s'", sell_price)
            raise ValueError(
                "Sell price must be a valid decimal number") from exc

        if price < Decimal("0"):
            logger.error(
                "Product update rejected: negative sell_price '%s'", price)
            raise ValueError("Sell price must be zero or positive")

        field_values["SellPrice"] = price

    if is_active is not None:
        if not isinstance(is_active, bool):
            logger.error(
                "Product update rejected: non-boolean is_active '%s'", is_active)
            raise ValueError("is_active must be a boolean value")
        field_values["IsActive"] = is_active

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
    *,
    product_id: str,
    product_name: str,
    sell_price: Decimal,
    is_active: bool = True,
) -> dal.ProductRow:
    """Append a product row after enforcing catalog invariants.

    Args:
        context (RuntimeContext): Active runtime context encapsulating settings
            and workbook references.
        product_id (str): Identifier to assign in the ``Products`` sheet.
        product_name (str): Human-friendly name stored alongside the id.
        sell_price (Decimal): Default sale price used when recording sales.
        is_active (bool): Initial activation state. Defaults to ``True``.

    Returns:
        dal.ProductRow: Persisted product record represented as a DAL
            dataclass.

    Raises:
        ValueError: If identifiers, names, or monetary values fail validation.
        BusinessRuleViolation: When attempting to register a duplicate product
            identifier.
    """

    normalized_id = product_id.strip()
    if not normalized_id:
        logger.error("Product creation rejected: blank product_id")
        raise ValueError("Product ID must be provided")

    normalized_name = product_name.strip()
    if not normalized_name:
        logger.error("Product creation rejected: blank product_name")
        raise ValueError("Product name must be provided")

    try:
        price = sell_price if isinstance(
            sell_price, Decimal) else Decimal(sell_price)
    except (InvalidOperation, TypeError) as exc:
        logger.error(
            "Product creation rejected: invalid sell_price '%s'", sell_price)
        raise ValueError("Sell price must be a valid decimal number") from exc

    if price < Decimal("0"):
        logger.error(
            "Product creation rejected: negative sell_price '%s'", price)
        raise ValueError("Sell price must be zero or positive")

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
        is_active=is_active,
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
