"""Transaction workflows coordinating validation and persistence.

The module defines command dataclasses that describe user intent for sales,
restocks, write-offs, credit payments, and inventory snapshots. High-level
functions transform those commands into normalized transaction rows, enforce
business rules through centralized validators, and maintain cache coherence so
reporting modules observe consistent state.
"""

import datetime
import logging
import typing as t
import dataclasses
from decimal import Decimal

from caad_erp import constants, dal, exceptions

from . import products, runtime, salesmen

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class SaleCommand:
    """User intent for creating a ``SALE`` transaction."""

    product_id: str
    salesman_id: str
    quantity: Decimal
    total_revenue: Decimal
    payment_type: constants.PaymentType
    notes: t.Optional[str] = None


@dataclasses.dataclass(frozen=True)
class RestockCommand:
    """User intent for creating a ``RESTOCK`` transaction."""

    product_id: str
    salesman_id: str
    quantity: Decimal
    total_cost: Decimal
    notes: t.Optional[str] = None


@dataclasses.dataclass(frozen=True)
class WriteOffCommand:
    """User intent for creating a ``WRITE_OFF`` transaction."""

    product_id: str
    salesman_id: str
    quantity: Decimal
    notes: t.Optional[str] = None


@dataclasses.dataclass(frozen=True)
class CreditPaymentCommand:
    """User intent for logging a ``CREDIT_PAYMENT`` transaction."""

    linked_transaction_id: str
    salesman_id: str
    total_revenue: Decimal
    payment_type: constants.PaymentType
    notes: t.Optional[str] = None


@dataclasses.dataclass(frozen=True)
class OpenStockCommand:
    """Instruction for creating an ``OPEN_STOCK`` transaction during archiving."""

    product_id: str
    salesman_id: str
    quantity: Decimal
    total_revenue: Decimal


TransactionCommand = t.Union[
    SaleCommand,
    RestockCommand,
    WriteOffCommand,
    CreditPaymentCommand,
    OpenStockCommand,
]


@dataclasses.dataclass(frozen=True)
class VoidCommand:
    """User intent for voiding a prior transaction."""

    linked_transaction_id: str
    replacement_command: t.Optional[TransactionCommand]
    notes: t.Optional[str] = None


def _ensure_transactions_cache(context: runtime.RuntimeContext) -> t.Dict[str, t.Any]:
    """Populate the transaction log cache bucket on demand.

    Because transactions are immutable after creation, caching the full list
    and a dictionary keyed by ``transaction_id`` avoids repeated worksheet
    scans even for complex reporting operations.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, t.Any]: Bucket containing ``all`` transactions and a ``by_id``
            dictionary for quick primary key lookups.
    """

    bucket = runtime._get_cache_bucket(context, "transactions")
    if "all" not in bucket:
        all_transactions = list(
            dal.iter_transactions(context.workbook))
        bucket["all"] = all_transactions
        bucket["by_id"] = {
            transaction.transaction_id: transaction for transaction in all_transactions}
        logger.debug(
            "Populated transactions cache with %d entries",
            len(all_transactions),
        )
    return bucket


def generate_transaction_id(when: datetime.datetime) -> str:
    """Generate a sortable transaction identifier using UTC timestamps.

    Args:
        when (datetime): Timestamp used for deterministically producing
            the identifier.

    Returns:
        str: Identifier formed as ``YYYYMMDDHHMMSSffffff``.

    The format preserves chronological ordering and packs microseconds to avoid
    collisions when multiple transactions occur within the same second. Caller
    supplied timestamps allow deterministic identifiers during testing or data
    migrations.
    """
    return when.strftime('%Y%m%d%H%M%S%f')


def require_positive_quantity(quantity: Decimal) -> None:
    """Validate that a quantity is strictly positive.

    Args:
        quantity (Decimal): Quantity supplied by a command object.

    Raises:
        ValueError: If ``quantity`` is zero or negative.

    Inventory adjustments that decrease stock convert the quantity into a
    negative value later in the pipeline, so callers always submit positive
    magnitudes here. Using :class:`ValueError` keeps the guard consistent with
    other validation helpers in the module.
    """
    if quantity <= Decimal("0"):
        logger.error("Quantity validation failed: %s", quantity)
        raise ValueError("Quantity must be greater than zero")


def require_nonnegative_money(amount: Decimal) -> None:
    """Validate that a monetary value is nonnegative.

    Args:
        amount (Decimal): Currency value supplied by a command object.

    Raises:
        ValueError: If ``amount`` is less than zero.

    Monetary fields are stored as signed decimals within the transaction logger.
    This helper ensures upstream workflows never pass negative revenue or cost
    figures without explicitly opting into that behavior.
    """
    if amount < Decimal("0"):
        logger.error("Monetary value validation failed: %s", amount)
        raise ValueError("Amount must be zero or positive")


def list_transactions(context: runtime.RuntimeContext) -> t.List[dal.TransactionRow]:
    """Fetch the immutable transaction log from cache.

    The returned list is a shallow copy of the cached sequence so callers can
    freely sort or filter without mutating the shared cache. Entries remain in
    workbook order, matching the append-only transaction log semantics.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        list[dal.TransactionRow]: Snapshot of the entire transaction log in
            workbook order.
    """
    cache = _ensure_transactions_cache(context)
    return list(cache["all"])


def get_transaction(context: runtime.RuntimeContext, transaction_id: str) -> dal.TransactionRow:
    """Retrieve a transaction row by its primary identifier.

    Transactions are resolved from the cached ``by_id`` mapping and returned as
    immutable dataclasses. An unknown identifier triggers a
    :class:`MissingReferenceError` to signal data integrity issues immediately.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        transaction_id (str): Transaction identifier from the log sheet.

    Returns:
        dal.TransactionRow: Matching transaction dataclass fetched from cache.

    Raises:
        MissingReferenceError: If the log lacks the supplied identifier.
    """
    cache = _ensure_transactions_cache(context)
    try:
        return cache["by_id"][transaction_id]
    except KeyError as exc:
        logger.warning("Transaction lookup failed for id '%s'", transaction_id)
        raise exceptions.MissingReferenceError(
            f"Unknown transaction id: {transaction_id}") from exc


def record_sale(context: runtime.RuntimeContext, command: SaleCommand) -> dal.TransactionRow:
    """Validate and append a ``SALE`` transaction to the logger.

    The workflow ensures products and salesmen are active, enforces positive
    quantities, verifies monetary values, generates a unique identifier, and
    persists the resulting transaction. Quantities are stored as negative
    deltas to reflect stock depletion, and revenue is attributed directly to
    the sale. The transaction cache is invalidated so subsequent reads observe
    the new entry.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (SaleCommand): Structured intent describing the sale request.

    Returns:
        dal.TransactionRow: Newly appended sale transaction.

    Raises:
        BusinessRuleViolation: If the referenced product or salesman is
            inactive or the payment type is unsupported.
        MissingReferenceError: If the product or salesman identifiers are
            unknown.
        ValueError: When quantity or revenue validations fail.
    """
    now = datetime.datetime.now(datetime.UTC)
    product = products.get_product(context, command.product_id)
    if not product.is_active:
        logger.warning("Attempted sale on inactive product '%s'",
                       command.product_id)
        raise exceptions.BusinessRuleViolation(
            f"Product '{command.product_id}' is inactive")
    salesman = salesmen.get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        logger.warning(
            "Attempted sale with inactive salesman '%s'", command.salesman_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)
    if not isinstance(command.payment_type, constants.PaymentType):
        logger.error("Unsupported payment type provided: %s",
                     command.payment_type)
        raise exceptions.BusinessRuleViolation(
            f"Unsupported payment type: {command.payment_type}")

    transaction_id = generate_transaction_id(when=now)
    transaction = build_sale_transaction(
        command, transaction_id=transaction_id, timestamp=now)
    dal.append_transaction(context.workbook, transaction)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded SALE transaction '%s' for product '%s' (quantity=%s, revenue=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def build_sale_transaction(command: SaleCommand, *, transaction_id: str, timestamp: datetime.datetime) -> dal.TransactionRow:
    """Materialize a :class:`SaleCommand` into a DAL transaction row.

    Args:
        command (SaleCommand): User intent describing the sale.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        dal.TransactionRow: Row ready for persistence via the data
            layer.

    Quantities are stored as negative values to indicate stock depletion, and
    costs remain zero because they are captured during restock events. The
    payment type is serialized from the enum into the workbook's expected text
    representation.
    """
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
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_restock(context: runtime.RuntimeContext, command: RestockCommand) -> dal.TransactionRow:
    """Validate and append a ``RESTOCK`` transaction.

    Stock increases must specify positive quantities and nonnegative costs. The
    generated transaction records quantity additions and stores costs as
    negative values so that later profit calculations can sum without special
    logic.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (RestockCommand): Structured restock intent.

    Returns:
        dal.TransactionRow: Newly appended restock entry.

    Raises:
        BusinessRuleViolation: If the targeted product is inactive.
        MissingReferenceError: When the referenced product cannot be located.
        ValueError: If quantity or total cost validations fail.
    """
    now = datetime.datetime.now(datetime.UTC)
    product = products.get_product(context, command.product_id)
    if not product.is_active:
        logger.warning(
            "Attempted restock on inactive product '%s'", command.product_id)
        raise exceptions.BusinessRuleViolation(
            f"Product '{command.product_id}' is inactive")
    salesman = salesmen.get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        logger.warning(
            "Attempted restock with inactive salesman '%s'", command.salesman_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(abs(command.total_cost))

    transaction_id = generate_transaction_id(when=now)
    transaction = build_restock_transaction(
        command, transaction_id=transaction_id, timestamp=now)
    dal.append_transaction(context.workbook, transaction)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded RESTOCK transaction '%s' for product '%s' (quantity=%s, cost=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_cost,
    )
    return transaction


def build_restock_transaction(command: RestockCommand, *, transaction_id: str, timestamp: datetime.datetime) -> dal.TransactionRow:
    """Materialize a :class:`RestockCommand` into a DAL transaction row.

    Args:
        command (RestockCommand): User intent describing the restock.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        dal.TransactionRow: Row ready for persistence via the data
            layer.

    Restocks add inventory, so the quantity is expressed as a positive value.
    Costs are encoded as negative amounts, aligning with the transaction log's
    convention that expenses subtract from profit.
    """
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
        total_revenue=Decimal("0.00"),
        total_cost=cost_value,
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_write_off(context: runtime.RuntimeContext, command: WriteOffCommand) -> dal.TransactionRow:
    """Validate and append a ``WRITE_OFF`` transaction.

    Write-offs reduce inventory without affecting revenue or cost ledgers. The
    quantity is recorded as a negative change to ensure downstream inventory
    calculations treat the write-off as a depletion.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (WriteOffCommand): Structured write-off intent.

    Returns:
        dal.TransactionRow: Newly appended write-off entry.

    Raises:
        BusinessRuleViolation: If the product is inactive.
        MissingReferenceError: When the referenced product id is unknown.
        ValueError: If the quantity fails validation.
    """
    now = datetime.datetime.now(datetime.UTC)
    product = products.get_product(context, command.product_id)
    if not product.is_active:
        logger.warning(
            "Attempted write-off on inactive product '%s'", command.product_id)
        raise exceptions.BusinessRuleViolation(
            f"Product '{command.product_id}' is inactive")
    salesman = salesmen.get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        logger.warning(
            "Attempted write-off with inactive salesman '%s'", command.salesman_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)

    transaction_id = generate_transaction_id(when=now)
    transaction = build_write_off_transaction(
        command, transaction_id=transaction_id, timestamp=now)
    dal.append_transaction(context.workbook, transaction)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded WRITE_OFF transaction '%s' for product '%s' (quantity=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
    )
    return transaction


def build_write_off_transaction(command: WriteOffCommand, *, transaction_id: str, timestamp: datetime.datetime) -> dal.TransactionRow:
    """Materialize a :class:`WriteOffCommand` into a DAL transaction row.

    Args:
        command (WriteOffCommand): User intent describing the write-off.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        dal.TransactionRow: Row ready for persistence via the data
            layer.

    Write-offs reduce stock without touching revenue or cost columns. The
    constructed row therefore contains a negative quantity delta and zeroed
    monetary amounts.
    """
    quantity_change = -abs(command.quantity)
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.WRITE_OFF.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=command.notes,
    )


def record_credit_payment(context: runtime.RuntimeContext, command: CreditPaymentCommand) -> dal.TransactionRow:
    """Append a ``CREDIT_PAYMENT`` transaction linked to an outstanding sale.

    Before persisting, the routine verifies that the referenced sale truly
    represents outstanding credit. The resulting transaction keeps quantity at
    zero while attributing cash revenue to the linked sale identifier.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (CreditPaymentCommand): Structured credit payment intent.

    Returns:
        dal.TransactionRow: Newly appended credit payment entry.

    Raises:
        BusinessRuleViolation: If the referenced sale is not eligible for
            credit payment linkage.
        MissingReferenceError: When the linked transaction identifier is
            unknown.
        ValueError: If the payment amount is negative.
    """
    now = datetime.datetime.now(datetime.UTC)
    linked_sale = get_transaction(context, command.linked_transaction_id)
    validate_credit_sale_link(linked_sale)
    require_nonnegative_money(command.total_revenue)
    if not isinstance(command.payment_type, constants.PaymentType):
        logger.error(
            "Unsupported payment type provided for credit payment: %s", command.payment_type)
        raise exceptions.BusinessRuleViolation(
            f"Unsupported payment type: {command.payment_type}")
    salesman = salesmen.get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        logger.warning(
            "Attempted credit payment with inactive salesman '%s'", command.salesman_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{command.salesman_id}' is inactive")

    transaction_id = generate_transaction_id(when=now)
    transaction = build_credit_payment_transaction(
        command,
        transaction_id=transaction_id,
        timestamp=now,
        product_id=linked_sale.product_id,
    )
    dal.append_transaction(context.workbook, transaction)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded CREDIT_PAYMENT '%s' linked to '%s' (amount=%s)",
        transaction.transaction_id,
        command.linked_transaction_id,
        command.total_revenue,
    )
    return transaction


def build_credit_payment_transaction(command: CreditPaymentCommand, *, transaction_id: str, timestamp: datetime.datetime, product_id: t.Optional[str] = None) -> dal.TransactionRow:
    """Materialize a :class:`CreditPaymentCommand` into a DAL transaction row.

    Args:
        command (CreditPaymentCommand): User intent describing the credit
            payment.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.
        product_id (str | None): t.Optional product identifier inferred from the
            linked sale.

    Returns:
        dal.TransactionRow: Row ready for persistence via the data
            layer.

    Credit payments do not affect stock, so the quantity is fixed at zero. The
    helper records the payment type supplied by the caller so downstream
    reporting can distinguish how the credit was settled. The linked sale
    identifier is copied for traceability.
    """
    return dal.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=constants.TransactionType.CREDIT_PAYMENT.value,
        product_id=product_id,
        salesman_id=command.salesman_id,
        payment_type=command.payment_type.value,
        quantity_change=Decimal("0"),
        total_revenue=command.total_revenue,
        total_cost=Decimal("0.00"),
        linked_transaction_id=command.linked_transaction_id,
        notes=command.notes,
    )


def validate_credit_sale_link(transaction: dal.TransactionRow) -> None:
    """Ensure a sale transaction qualifies for credit payment linkage.

    Args:
        transaction (dal.TransactionRow): Transaction row purportedly
            representing a credit sale.

    Raises:
        BusinessRuleViolation: If ``transaction`` is not a credit sale eligible
            for a payment linkage.

    Credit payments are only allowed to target sales that were recorded on
    credit, have not yet reported revenue, and are not already linked to another
    transaction. These conditions prevent double-settling or misclassifying a
    cash sale as credit.
    """
    if transaction.transaction_type != constants.TransactionType.SALE.value:
        logger.error(
            "Credit payment validation failed: transaction '%s' is not a sale",
            transaction.transaction_id,
        )
        raise exceptions.BusinessRuleViolation(
            "Credit payments must reference a SALE transaction")
    if transaction.payment_type != constants.PaymentType.ON_CREDIT.value:
        logger.error(
            "Credit payment validation failed: transaction '%s' payment type is '%s'",
            transaction.transaction_id,
            transaction.payment_type,
        )
        raise exceptions.BusinessRuleViolation(
            "Linked sale is not recorded as credit")
    if transaction.total_revenue > Decimal("0"):
        logger.error(
            "Credit payment validation failed: transaction '%s' already reports revenue",
            transaction.transaction_id,
        )
        raise exceptions.BusinessRuleViolation(
            "Linked credit sale already reports revenue")
    if transaction.linked_transaction_id is not None:
        logger.error(
            "Credit payment validation failed: transaction '%s' already links to '%s'",
            transaction.transaction_id,
            transaction.linked_transaction_id,
        )
        raise exceptions.BusinessRuleViolation(
            "Linked sale already references another transaction")


def record_open_stock(context: runtime.RuntimeContext, command: OpenStockCommand) -> dal.TransactionRow:
    """Append an ``OPEN_STOCK`` transaction for period initialization.

    Opening stock transactions seed beginning-of-period inventory. Quantities
    are stored as positive adjustments, and any associated valuation is
    recorded in ``total_revenue`` to make subsequent summaries aware of the
    starting inventory worth.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (OpenStockCommand): Structured open stock intent.

    Returns:
        dal.TransactionRow: Newly appended open stock entry.

    Raises:
        BusinessRuleViolation: If the targeted product is inactive.
        MissingReferenceError: When the product identifier is unknown.
        ValueError: If quantity or revenue validations fail.
    """
    now = datetime.datetime.now(datetime.UTC)
    product = products.get_product(context, command.product_id)
    if not product.is_active:
        logger.warning(
            "Attempted open stock on inactive product '%s'", command.product_id)
        raise exceptions.BusinessRuleViolation(
            f"Product '{command.product_id}' is inactive")
    salesman = salesmen.get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        logger.warning(
            "Attempted open stock with inactive salesman '%s'", command.salesman_id)
        raise exceptions.BusinessRuleViolation(
            f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)

    transaction_id = generate_transaction_id(when=now)
    transaction = build_open_stock_transaction(
        command, transaction_id=transaction_id, timestamp=now)
    dal.append_transaction(context.workbook, transaction)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded OPEN_STOCK transaction '%s' for product '%s' (quantity=%s, value=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def build_open_stock_transaction(command: OpenStockCommand, *, transaction_id: str, timestamp: datetime.datetime) -> dal.TransactionRow:
    """Materialize an :class:`OpenStockCommand` into a DAL transaction row.

    Args:
        command (OpenStockCommand): User intent describing the opening stock.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        dal.TransactionRow: Row ready for persistence via the data
            layer.

    Opening stock transactions provide a baseline for inventory and valuation
    reports, so the helper records the quantity as a positive adjustment and
    propagates ``total_revenue`` unchanged to capture the initial valuation.
    """
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
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )


def record_void(context: runtime.RuntimeContext, command: VoidCommand) -> t.List[dal.TransactionRow]:
    """Record a ``VOID`` reversal and optional replacement transactions.

    The function first writes the reversal entry that negates the target
    transaction, then optionally records a replacement command provided by the
    caller, chaining through the appropriate ``record_*`` function. Transaction
    caches are invalidated before each write to ensure consistency, so any
    subsequent reads or balance calculations reflect the updated logger.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (VoidCommand): Structured void intent including optional
            replacement data.

    Returns:
        list[dal.TransactionRow]: Sequence containing the reversal and
            any replacement transactions appended as part of the operation.

    Raises:
        BusinessRuleViolation: If the target transaction cannot be voided or
            the replacement command type is unsupported.
        MissingReferenceError: When the referenced transaction is unknown.
    """
    now = datetime.datetime.now(datetime.UTC)
    logger.info("Recording VOID for transaction '%s'",
                command.linked_transaction_id)
    target = get_transaction(context, command.linked_transaction_id)
    validate_void_target(target)

    reversal = build_void_transaction(
        target, timestamp=now, notes=command.notes)
    dal.append_transaction(context.workbook, reversal)
    runtime._invalidate_cache(context, "transactions")
    logger.info(
        "Recorded VOID reversal '%s' for transaction '%s'",
        reversal.transaction_id,
        target.transaction_id,
    )

    results: t.List[dal.TransactionRow] = [reversal]
    replacement = command.replacement_command
    if replacement is None:
        return results

    if isinstance(replacement, SaleCommand):
        results.append(record_sale(context, replacement))
    elif isinstance(replacement, RestockCommand):
        results.append(record_restock(context, replacement))
    elif isinstance(replacement, WriteOffCommand):
        results.append(record_write_off(context, replacement))
    elif isinstance(replacement, CreditPaymentCommand):
        results.append(record_credit_payment(context, replacement))
    elif isinstance(replacement, OpenStockCommand):
        results.append(record_open_stock(context, replacement))
    else:
        raise exceptions.BusinessRuleViolation(
            "Unsupported replacement command type")

    return results


def build_void_transaction(transaction: dal.TransactionRow, *, timestamp: datetime.datetime, notes: t.Optional[str]) -> dal.TransactionRow:
    """Create a reversal transaction that negates a prior entry.

    Args:
        transaction (dal.TransactionRow): Original transaction being
            reversed.
        timestamp (datetime): Timestamp to apply to the reversal entry.
        notes (str | None): t.Optional contextual notes to persist alongside the
            reversal.

    Returns:
        dal.TransactionRow: Synthetic ``VOID`` transaction that
            negates the quantities, costs, and revenues of ``transaction``.

    The reversal mirrors the original transaction's identifiers while flipping
    all numeric deltas and storing the original identifier in
    ``linked_transaction_id``. Consumers can use this metadata to establish
    audit trails.
    """
    return dal.TransactionRow(
        transaction_id=generate_transaction_id(when=timestamp),
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


def validate_void_target(transaction: dal.TransactionRow) -> None:
    """Confirm that a transaction may be voided under business rules.

    Args:
        transaction (dal.TransactionRow): Transaction row selected for
            voiding.

    Raises:
        BusinessRuleViolation: If the transaction type is ineligible for
            voiding.

    VOID and CREDIT_PAYMENT transactions are intentionally immutable because a
    second void would create loops and credit payments represent actual cash
    settlements. Attempting to void these entries surfaces a domain error.
    """
    if transaction.transaction_type == constants.TransactionType.VOID.value:
        logger.error("Cannot void transaction '%s' because it is already a void",
                     transaction.transaction_id)
        raise exceptions.BusinessRuleViolation(
            "Cannot void a VOID transaction")
    if transaction.transaction_type == constants.TransactionType.CREDIT_PAYMENT.value:
        logger.error(
            "Cannot void transaction '%s' because it is a credit payment",
            transaction.transaction_id,
        )
        raise exceptions.BusinessRuleViolation(
            "Cannot void a credit payment transaction")
