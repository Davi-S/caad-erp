"""Reporting helpers that derive analytics from cached transactions.

Utilities in this module consume the read-heavy caches maintained by the
business logic layer to compute inventory balances and profit summaries without
touching the workbook on every call. Callers receive plain dictionaries that
are convenient for CLI formatting or downstream integrations.
"""

import dataclasses
import logging
import typing as t
import collections
from decimal import Decimal

from caad_erp import constants, exceptions

from . import products, runtime, transactions

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class OutstandingDebt:
    """Snapshot describing an outstanding credit balance."""

    transaction_id: str
    timestamp_iso: str
    product_id: t.Optional[str]
    salesman_id: t.Optional[str]
    quantity: Decimal
    expected_amount: Decimal
    amount_paid: Decimal
    balance: Decimal


def calculate_inventory(context: runtime.RuntimeContext) -> t.Dict[str, Decimal]:
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
    for transaction in transactions._ensure_transactions_cache(context)["all"]:
        if transaction.product_id is None:
            continue
        current = inventory.get(transaction.product_id, Decimal("0"))
        inventory[transaction.product_id] = current + \
            transaction.quantity_change
    logger.debug("Calculated inventory balances for %d products",
                 len(inventory))
    return inventory


def calculate_profit_summary(context: runtime.RuntimeContext) -> t.Dict[str, Decimal]:
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
    for transaction in transactions._ensure_transactions_cache(context)["all"]:
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


def calculate_outstanding_debts(context: runtime.RuntimeContext) -> t.Dict[str, t.Any]:
    """Compute outstanding balances for credit sales.

    The report inspects cached transactions to locate ``SALE`` entries logged
    with ``PaymentType`` ``OnCredit`` that have not been voided and determines
    how much remains unpaid after credit payments are applied. Expected amounts
    come from either explicitly recorded negative revenue on the sale or, when
    absent, the product's current ``SellPrice`` multiplied by the sale quantity.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        dict[str, Any]: Mapping containing ``balances``, a list of
            :class:`OutstandingDebt`, and ``total_outstanding`` summarising the
            remaining credit across all sales.
    """

    cache = transactions._ensure_transactions_cache(context)
    all_transactions = cache["all"]

    payments_by_sale: dict[str, Decimal] = collections.defaultdict(lambda: Decimal("0.00"))
    voided_sales: set[str] = set()

    for entry in all_transactions:
        if (
            entry.transaction_type
            == constants.TransactionType.CREDIT_PAYMENT.value
            and entry.linked_transaction_id
        ):
            payments_by_sale[entry.linked_transaction_id] += entry.total_revenue
        elif (
            entry.transaction_type == constants.TransactionType.VOID.value
            and entry.linked_transaction_id
        ):
            voided_sales.add(entry.linked_transaction_id)

    balances: list[OutstandingDebt] = []
    total_balance = Decimal("0.00")

    for entry in all_transactions:
        if entry.transaction_type != constants.TransactionType.SALE.value:
            continue
        if entry.payment_type != constants.PaymentType.ON_CREDIT.value:
            continue
        if entry.transaction_id in voided_sales:
            continue

        quantity = abs(entry.quantity_change)
        expected_from_transaction = (
            -entry.total_revenue if entry.total_revenue < Decimal("0") else Decimal("0.00")
        )

        expected_from_price = Decimal("0.00")
        if entry.product_id is not None:
            try:
                product = products.get_product(context, entry.product_id)
            except exceptions.MissingReferenceError:
                logger.warning(
                    "Skipping price lookup for missing product '%s' referenced by credit sale '%s'",
                    entry.product_id,
                    entry.transaction_id,
                )
            else:
                expected_from_price = product.sell_price * quantity

        expected_amount = (
            expected_from_transaction
            if expected_from_transaction > Decimal("0.00")
            else expected_from_price
        )

        if expected_amount <= Decimal("0.00"):
            continue

        amount_paid = payments_by_sale.get(
            entry.transaction_id, Decimal("0.00"))
        balance = expected_amount - amount_paid
        if balance <= Decimal("0.00"):
            continue

        debt = OutstandingDebt(
            transaction_id=entry.transaction_id,
            timestamp_iso=entry.timestamp_iso,
            product_id=entry.product_id,
            salesman_id=entry.salesman_id,
            quantity=quantity,
            expected_amount=expected_amount,
            amount_paid=amount_paid,
            balance=balance,
        )
        balances.append(debt)
        total_balance += balance

    logger.debug(
        "Calculated outstanding debts for %d credit sales (total=%s)",
        len(balances),
        total_balance,
    )
    return {
        "balances": balances,
        "total_outstanding": total_balance,
    }
