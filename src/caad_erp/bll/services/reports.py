import logging
import typing as t
from decimal import Decimal

from ..runtime import RuntimeContext
from .transactions import _ensure_transactions_cache

logger = logging.getLogger(__name__)


def calculate_inventory(context: RuntimeContext) -> t.Dict[str, Decimal]:
    """Compute inventory balances from the transaction logger.

    The routine iterates over the cached transaction list, ignoring entries
    with no ``ProductID`` (for example, credit payments) and accumulating the
    signed ``quantity_change`` values per product. The resulting mapping mirrors
    the on-hand stock after applying every log entry in chronological order.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        dict[str, Decimal]: Mapping of ``ProductID`` to cumulative quantity
            derived by summing ``quantity_change`` across transactions.
    """
    inventory: t.Dict[str, Decimal] = {}
    for transaction in _ensure_transactions_cache(context)["all"]:
        if transaction.product_id is None:
            continue
        current = inventory.get(transaction.product_id, Decimal("0"))
        inventory[transaction.product_id] = current + \
            transaction.quantity_change
    logger.debug("Calculated inventory balances for %d products",
                 len(inventory))
    return inventory


def calculate_profit_summary(context: RuntimeContext) -> t.Dict[str, Decimal]:
    """Produce aggregate revenue, cost, and profit metrics.

    Aggregate values are derived from cached transactions so repeated calls do
    not touch the workbook. Profit is computed as ``total_revenue + total_cost``
    because costs are recorded as negative numbers in the transaction logger.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        dict[str, Decimal]: t.Dictionary containing ``total_revenue``,
            ``total_cost``, and ``profit`` values derived from cached
            transactions.
    """
    total_revenue = Decimal("0")
    total_cost = Decimal("0")
    for transaction in _ensure_transactions_cache(context)["all"]:
        total_revenue += transaction.total_revenue
        total_cost += transaction.total_cost
    profit = total_revenue + total_cost
    logger.debug(
        "Calculated profit summary: revenue=%s cost=%s profit=%s",
        total_revenue,
        total_cost,
        profit,
    )
    return {
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "profit": profit,
    }
