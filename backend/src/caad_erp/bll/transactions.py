"""Transaction workflows coordinating validation and persistence.

The module defines command dataclasses that describe user intent for sales,
restocks, write-offs, credit payments, and inventory snapshots. High-level
functions transform those commands into normalized transaction rows, enforce
business rules through centralized validators, and maintain cache coherence so
reporting modules observe consistent state.
"""

import dataclasses
import datetime
import logging
import typing as t

from caad_erp import constants, dal
from caad_erp.bll import rules, runtime

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class SaleCommand:
    """User intent for creating a ``SALE`` transaction."""

    product_id: str
    salesman_id: str
    quantity: int
    total_revenue: int
    payment_type: constants.PaymentType
    notes: str | None = None


@dataclasses.dataclass(frozen=True)
class RestockCommand:
    """User intent for creating a ``RESTOCK`` transaction."""

    product_id: str
    salesman_id: str
    quantity: int
    total_cost: int
    notes: str | None = None


@dataclasses.dataclass(frozen=True)
class WriteOffCommand:
    """User intent for creating a ``WRITE_OFF`` transaction."""

    product_id: str
    salesman_id: str
    quantity: int
    notes: str | None = None


@dataclasses.dataclass(frozen=True)
class CreditPaymentCommand:
    """User intent for logging a ``CREDIT_PAYMENT`` transaction."""

    linked_transaction_id: str
    salesman_id: str
    total_revenue: int
    payment_type: constants.PaymentType
    notes: str | None = None


@dataclasses.dataclass(frozen=True)
class OpenStockCommand:
    """Instruction for creating an ``OPEN_STOCK`` transaction during archiving."""

    product_id: str
    salesman_id: str
    quantity: int
    total_revenue: int


@dataclasses.dataclass(frozen=True)
class VoidCommand:
    """User intent for voiding a prior transaction."""

    linked_transaction_id: str
    notes: str | None = None


# Rationale (Single Sale Workflow):
# 1. Soft-Delete Protection (DEVELOPER_GUIDE.md #Soft-delete):
#    - Inactive products and salesmen cannot participate in new sales so they instantly vanish
#      from POS views and active catalog selections.
#    - However, historical catalog rows remain in Products/Salesmen sheets to ensure past
#      TransactionLog rows are never orphaned or corrupted.
# 2. Flexible Discounts (DEVELOPER_GUIDE.md #Discounts):
#    - Revenue is not hard-coded to suggested Product.SellPrice. Custom prices and discounts
#      are handled by allowing any total_revenue >= 0.
# 3. Stock Availability Enforcement (DEVELOPER_GUIDE.md #Stock Availability Enforcement):
#    - SUM(QuantityChange) derives real-time inventory. Sales reduce stock and cannot exceed
#      currently available inventory balances.
RECORD_SALE_RULES: list[rules.BaseRule] = [
    rules.PRODUCT_EXISTS,
    rules.PRODUCT_IS_ACTIVE,
    rules.SALESMAN_EXISTS,
    rules.SALESMAN_IS_ACTIVE,
    rules.POSITIVE_QUANTITY,
    rules.NONNEGATIVE_REVENUE,
    rules.SUFFICIENT_STOCK,
]

# Rationale (Restock Workflow):
# 1. Active Catalog Attribution (DEVELOPER_GUIDE.md #RESTOCK):
#    - Inventory restocks increase physical stock (> 0) and must be attributed to an active product
#      and active salesman.
# 2. Donated & Promotional Items (DEVELOPER_GUIDE.md #RESTOCK / #Separate Revenue and Cost Columns):
#    - Total cost is stored as a negative delta in TotalCost.
#    - Total cost of 0 is explicitly allowed to support donated items, promotional samples,
#      or free inventory additions without breaking cost accounting.
RECORD_RESTOCK_RULES: list[rules.BaseRule] = [
    rules.PRODUCT_EXISTS,
    rules.PRODUCT_IS_ACTIVE,
    rules.SALESMAN_EXISTS,
    rules.SALESMAN_IS_ACTIVE,
    rules.POSITIVE_QUANTITY,
    rules.NONNEGATIVE_COST,
]

# Rationale (Write-Off Workflow):
# 1. Spoilage & Loss Tracking (DEVELOPER_GUIDE.md #WRITE_OFF):
#    - Write-offs represent inventory loss (spoilage, theft, loss, damage) without revenue or cost deltas.
# 2. Stock Balance Guard (DEVELOPER_GUIDE.md #Stock Availability Enforcement):
#    - Write-off quantities must be positive and cannot exceed currently available inventory.
RECORD_WRITE_OFF_RULES: list[rules.BaseRule] = [
    rules.PRODUCT_EXISTS,
    rules.PRODUCT_IS_ACTIVE,
    rules.SALESMAN_EXISTS,
    rules.SALESMAN_IS_ACTIVE,
    rules.POSITIVE_QUANTITY,
    rules.SUFFICIENT_WRITE_OFF_STOCK,
]

# Rationale (Credit Payment Workflow):
# 1. Credit Sale Link (DEVELOPER_GUIDE.md #Sell on Credit & Flexible Credit Payments):
#    - Must reference a valid SALE transaction recorded with PaymentType='OnCredit'.
# 2. Void Immutability Guard (DEVELOPER_GUIDE.md #Error Correction & Voiding Credit Payments):
#    - Voided sales cannot accept credit payments to prevent phantom debt settlements and keep audit logs immutable.
# 3. Flexible Payments & Overpayments (DEVELOPER_GUIDE.md #Overpayments & Interest):
#    - Payment amount must be strictly > 0. Payments are intentionally NOT capped by remaining debt,
#      allowing salesmen to record partial payments, full settlements, interest, or late fees.
# 4. Active Salesman:
#    - Cash collection must be logged by an active salesman.
RECORD_CREDIT_PAYMENT_RULES: list[rules.BaseRule] = [
    rules.CREDIT_SALE_LINK_ELIGIBLE,
    rules.POSITIVE_REVENUE,
    rules.SALESMAN_EXISTS,
    rules.SALESMAN_IS_ACTIVE,
]

# Rationale (Open Stock Workflow):
# 1. Period Initialization (DEVELOPER_GUIDE.md #OPEN_STOCK / #Archive Script):
#    - OPEN_STOCK entries seed beginning-of-period inventory during archive processing for active catalog items.
RECORD_OPEN_STOCK_RULES: list[rules.BaseRule] = [
    rules.PRODUCT_EXISTS,
    rules.PRODUCT_IS_ACTIVE,
    rules.SALESMAN_EXISTS,
    rules.SALESMAN_IS_ACTIVE,
    rules.POSITIVE_QUANTITY,
    rules.NONNEGATIVE_REVENUE,
]


def _ensure_transactions_cache(context: runtime.RuntimeContext) -> dict[str, t.Any]:
    bucket = runtime.get_cache_bucket(context, "transactions")
    if "all" not in bucket:
        all_transactions = list(dal.iter_transactions(context.workbook))
        bucket["all"] = all_transactions
        bucket["by_id"] = {
            transaction.transaction_id: transaction for transaction in all_transactions
        }
        logger.debug(
            "Populated transactions cache with %d entries",
            len(all_transactions),
        )
    return bucket


def _generate_transaction_id(when: datetime.datetime) -> str:
    return when.strftime("%Y%m%d%H%M%S%f")


def list_transactions(context: runtime.RuntimeContext) -> list[dal.TransactionRow]:
    cache = _ensure_transactions_cache(context)
    return list(cache["all"])


def get_transaction(
    context: runtime.RuntimeContext, transaction_id: str
) -> dal.TransactionRow:
    cache = _ensure_transactions_cache(context)
    try:
        return cache["by_id"][transaction_id]
    except KeyError as exc:
        logger.warning("Transaction lookup failed for id '%s'", transaction_id)
        raise rules.TransactionNotFoundError(
            f"[Transaction Exists] Unknown transaction id: {transaction_id}"
        ) from exc


def record_sale(
    context: runtime.RuntimeContext, command: SaleCommand
) -> dal.TransactionRow:
    """Validate and append a ``SALE`` transaction to the logger."""
    now = datetime.datetime.now(datetime.UTC)
    rules.enforce_rules(context, command, RECORD_SALE_RULES)

    transaction_id = _generate_transaction_id(when=now)
    transaction = _build_sale_transaction(
        command, transaction_id=transaction_id, timestamp=now
    )
    dal.append_transaction(context.workbook, transaction)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded SALE transaction '%s' for product '%s' (quantity=%s, revenue=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def record_bulk_sale(
    context: runtime.RuntimeContext, commands: list[SaleCommand]
) -> list[dal.TransactionRow]:
    """Validate and append a list of ``SALE`` transactions atomically."""
    rules.enforce_rules(context, commands, [rules.NON_EMPTY_BULK_SALE])

    for command in commands:
        rules.enforce_rules(
            context, command, RECORD_SALE_RULES[:-1]
        )  # validate individual item checks

    rules.enforce_rules(context, commands, [rules.BULK_SUFFICIENT_STOCK])

    recorded: list[dal.TransactionRow] = []
    for command in commands:
        recorded.append(record_sale(context, command))

    return recorded


def _build_sale_transaction(
    command: SaleCommand, *, transaction_id: str, timestamp: datetime.datetime
) -> dal.TransactionRow:
    quantity_change = -abs(command.quantity)
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.SALE.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=command.payment_type.value,
        quantity_change=quantity_change,
        total_revenue=command.total_revenue,
        total_cost=0,
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_restock(
    context: runtime.RuntimeContext, command: RestockCommand
) -> dal.TransactionRow:
    """Validate and append a ``RESTOCK`` transaction."""
    now = datetime.datetime.now(datetime.UTC)
    rules.enforce_rules(context, command, RECORD_RESTOCK_RULES)

    transaction_id = _generate_transaction_id(when=now)
    transaction = _build_restock_transaction(
        command, transaction_id=transaction_id, timestamp=now
    )
    dal.append_transaction(context.workbook, transaction)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded RESTOCK transaction '%s' for product '%s' (quantity=%s, cost=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_cost,
    )
    return transaction


def _build_restock_transaction(
    command: RestockCommand, *, transaction_id: str, timestamp: datetime.datetime
) -> dal.TransactionRow:
    quantity_change = abs(command.quantity)
    cost_value = -abs(command.total_cost)
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.RESTOCK.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=0,
        total_cost=cost_value,
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_write_off(
    context: runtime.RuntimeContext, command: WriteOffCommand
) -> dal.TransactionRow:
    """Validate and append a ``WRITE_OFF`` transaction."""
    now = datetime.datetime.now(datetime.UTC)
    rules.enforce_rules(context, command, RECORD_WRITE_OFF_RULES)

    transaction_id = _generate_transaction_id(when=now)
    transaction = _build_write_off_transaction(
        command, transaction_id=transaction_id, timestamp=now
    )
    dal.append_transaction(context.workbook, transaction)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded WRITE_OFF transaction '%s' for product '%s' (quantity=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
    )
    return transaction


def _build_write_off_transaction(
    command: WriteOffCommand, *, transaction_id: str, timestamp: datetime.datetime
) -> dal.TransactionRow:
    quantity_change = -abs(command.quantity)
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.WRITE_OFF.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=0,
        total_cost=0,
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_credit_payment(
    context: runtime.RuntimeContext, command: CreditPaymentCommand
) -> dal.TransactionRow:
    """Append a ``CREDIT_PAYMENT`` transaction linked to an outstanding sale."""
    now = datetime.datetime.now(datetime.UTC)
    rules.enforce_rules(context, command, RECORD_CREDIT_PAYMENT_RULES)
    linked_sale = get_transaction(context, command.linked_transaction_id)

    transaction_id = _generate_transaction_id(when=now)
    transaction = _build_credit_payment_transaction(
        command,
        transaction_id=transaction_id,
        timestamp=now,
        product_id=linked_sale.product_id,
    )
    dal.append_transaction(context.workbook, transaction)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded CREDIT_PAYMENT '%s' linked to '%s' (amount=%s)",
        transaction.transaction_id,
        command.linked_transaction_id,
        command.total_revenue,
    )
    return transaction


def _build_credit_payment_transaction(
    command: CreditPaymentCommand,
    *,
    transaction_id: str,
    timestamp: datetime.datetime,
    product_id: str,
) -> dal.TransactionRow:
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.CREDIT_PAYMENT.value,
        product_id=product_id,
        salesman_id=command.salesman_id,
        payment_type=command.payment_type.value,
        quantity_change=0,
        total_revenue=command.total_revenue,
        total_cost=0,
        linked_transaction_id=command.linked_transaction_id,
        notes=command.notes,
    )


def record_open_stock(
    context: runtime.RuntimeContext, command: OpenStockCommand
) -> dal.TransactionRow:
    """Append an ``OPEN_STOCK`` transaction for period initialization."""
    now = datetime.datetime.now(datetime.UTC)
    rules.enforce_rules(context, command, RECORD_OPEN_STOCK_RULES)

    transaction_id = _generate_transaction_id(when=now)
    transaction = _build_open_stock_transaction(
        command, transaction_id=transaction_id, timestamp=now
    )
    dal.append_transaction(context.workbook, transaction)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded OPEN_STOCK transaction '%s' for product '%s' (quantity=%s, value=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def _build_open_stock_transaction(
    command: OpenStockCommand, *, transaction_id: str, timestamp: datetime.datetime
) -> dal.TransactionRow:
    quantity_change = abs(command.quantity)
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.OPEN_STOCK.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=command.total_revenue,
        total_cost=0,
        linked_transaction_id=None,
        notes=None,
    )


def record_void(
    context: runtime.RuntimeContext, command: VoidCommand
) -> dal.TransactionRow:
    """Record a ``VOID`` reversal negating a prior transaction."""
    now = datetime.datetime.now(datetime.UTC)
    logger.info("Recording VOID for transaction '%s'", command.linked_transaction_id)
    target = get_transaction(context, command.linked_transaction_id)
    rules.enforce_rules(context, target, [rules.VOID_TARGET_ELIGIBLE])

    reversal = _build_void_transaction(target, timestamp=now, notes=command.notes)
    dal.append_transaction(context.workbook, reversal)
    runtime.invalidate_cache(context, "transactions")
    logger.info(
        "Recorded VOID reversal '%s' for transaction '%s'",
        reversal.transaction_id,
        target.transaction_id,
    )
    return reversal


def _build_void_transaction(
    transaction: dal.TransactionRow,
    *,
    timestamp: datetime.datetime,
    notes: str | None,
) -> dal.TransactionRow:
    return dal.TransactionRow(
        transaction_id=_generate_transaction_id(when=timestamp),
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.VOID.value,
        product_id=transaction.product_id,
        salesman_id=transaction.salesman_id,
        payment_type=transaction.payment_type,
        quantity_change=-transaction.quantity_change,
        total_revenue=-transaction.total_revenue,
        total_cost=-transaction.total_cost,
        linked_transaction_id=transaction.transaction_id,
        notes=notes,
    )
