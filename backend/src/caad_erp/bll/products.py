"""Product-centric business logic built atop the data access layer.

The module caches workbook queries, exposes CRUD-like helpers for individual
products, and centralizes input validation. Functions prefer ``RuntimeContext``
objects to ensure callers operate on pre-validated configuration and share a
memoized cache across requests.
"""

import dataclasses
import logging
import typing as t

from caad_erp import dal
from caad_erp.bll import rules, runtime

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class ProductCommand:
    """Command payload used by product create and update workflows."""

    product_id: str
    product_name: str | None = None
    sell_price: int | None = None
    is_active: bool | None = None


# Rationale (Product Update Workflow):
# 1. Non-blank Identifiers (DEVELOPER_GUIDE.md #Column Types):
#    - ProductID and ProductName stay as text and must be non-empty strings.
# 2. Suggested Sell Price (DEVELOPER_GUIDE.md #Sell Price):
#    - Product.SellPrice is a suggested price for UI convenience and must be >= 0 if provided.
#      Actual transaction revenue is calculated per sale.
PRODUCT_UPDATE_RULES: list[rules.BaseRule] = [
    rules.NON_EMPTY_PRODUCT_ID,
    rules.NON_EMPTY_PRODUCT_NAME,
    rules.NONNEGATIVE_SELL_PRICE,
    rules.AT_LEAST_ONE_PRODUCT_FIELD,
]

# Rationale (Product Creation Workflow):
# 1. Mandatory Attributes:
#    - All product creations must explicitly specify a non-blank ID, non-blank name,
#      non-negative suggested sell price, and active status flag.
PRODUCT_ADD_RULES: list[rules.BaseRule] = [
    rules.NON_EMPTY_PRODUCT_ID,
    rules.REQUIRED_PRODUCT_NAME,
    rules.REQUIRED_SELL_PRICE,
    rules.REQUIRED_IS_ACTIVE,
]


def _ensure_products_cache(context: runtime.RuntimeContext) -> dict[str, t.Any]:
    """Populate the product cache bucket on demand.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, t.Any]: Bucket containing ``all`` products and a ``by_id``
            lookup dictionary. Reuses prior computations when available.
    """
    bucket = runtime.get_cache_bucket(context, "products")
    if "all" not in bucket:
        all_products = list(dal.iter_products(context.workbook))
        bucket["all"] = all_products
        bucket["by_id"] = {product.product_id: product for product in all_products}
        logger.debug(
            "Populated products cache with %d entries",
            len(all_products),
        )
    return bucket


def list_products(context: runtime.RuntimeContext) -> list[dal.ProductRow]:
    """Return every cached product row."""
    cache = _ensure_products_cache(context)
    return list(cache["all"])


def get_product(context: runtime.RuntimeContext, product_id: str) -> dal.ProductRow:
    """Resolve a product record by its identifier.

    Raises ProductNotFoundError if product_id is absent from the workbook.
    """
    cache = _ensure_products_cache(context)
    try:
        return cache["by_id"][product_id]
    except KeyError as exc:
        logger.warning("Product lookup failed for id '%s'", product_id)
        raise rules.ProductNotFoundError(
            f"[Product Exists] Unknown product id: {product_id}"
        ) from exc


def update_product(
    context: runtime.RuntimeContext,
    command: ProductCommand,
) -> dal.ProductRow:
    """Update selected fields for an existing product and refresh caches."""
    rules.enforce_rules(context, command, PRODUCT_UPDATE_RULES)

    normalized_id = command.product_id.strip()
    field_values: dict[str, t.Any] = {}

    if command.product_name is not None:
        field_values["ProductName"] = command.product_name.strip()
    if command.sell_price is not None:
        field_values["SellPrice"] = command.sell_price
    if command.is_active is not None:
        field_values["IsActive"] = command.is_active

    try:
        dal.update_product(context.workbook, normalized_id, field_values=field_values)
    except KeyError as exc:
        logger.warning("Product update failed for id '%s'", normalized_id)
        raise rules.ProductNotFoundError(
            f"[Product Exists] Unknown product id: {normalized_id}"
        ) from exc

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
    """Append a product row after enforcing catalog invariants."""
    rules.enforce_rules(context, command, PRODUCT_ADD_RULES)

    normalized_id = command.product_id.strip()
    normalized_name = command.product_name.strip() if command.product_name else ""
    price = command.sell_price if command.sell_price is not None else 0

    bucket = _ensure_products_cache(context)
    if normalized_id in bucket["by_id"]:
        logger.error("Product creation rejected: duplicate id '%s'", normalized_id)
        raise rules.DuplicateProductError(f"Product '{normalized_id}' already exists")

    record = dal.ProductRow(
        product_id=normalized_id,
        product_name=normalized_name,
        sell_price=price,
        is_active=bool(command.is_active),
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
