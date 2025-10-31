"""Business logic layer for Lounge ERP.

This module contains the rule engine that orchestrates the immutable
``TransactionLog`` model. It consumes the Data Access Layer (DAL) for all I/O
while ensuring every mutation passes through the domain rules described in the
architecture guide.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from openpyxl.workbook import Workbook

from . import data_manager, log
from .constants import EXPECTED_SCHEMA_VERSION, PaymentType, TransactionType


class BusinessRuleViolation(Exception):
    """Raised when a requested operation violates a domain constraint."""


class MissingReferenceError(BusinessRuleViolation):
    """Raised when a referenced product, salesman, or transaction is unknown."""


@dataclass(frozen=True)
class RuntimeContext:
    """Container for configuration and workbook references used by the BLL."""

    settings: data_manager.ConfigSettings
    workbook: Workbook
    _cache: Dict[str, Dict[str, Any]] = field(default_factory=dict, repr=False, compare=False)


@dataclass(frozen=True)
class SaleCommand:
    """User intent for creating a ``SALE`` transaction."""

    product_id: str
    salesman_id: str
    quantity: Decimal
    total_revenue: Decimal
    payment_type: PaymentType
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None


@dataclass(frozen=True)
class RestockCommand:
    """User intent for creating a ``RESTOCK`` transaction."""

    product_id: str
    quantity: Decimal
    total_cost: Decimal
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None


@dataclass(frozen=True)
class WriteOffCommand:
    """User intent for creating a ``WRITE_OFF`` transaction."""

    product_id: str
    quantity: Decimal
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None


@dataclass(frozen=True)
class CreditPaymentCommand:
    """User intent for logging a ``CREDIT_PAYMENT`` transaction."""

    linked_transaction_id: str
    total_revenue: Decimal
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None


@dataclass(frozen=True)
class OpenStockCommand:
    """Instruction for creating an ``OPEN_STOCK`` transaction during archiving."""

    product_id: str
    quantity: Decimal
    total_revenue: Decimal
    timestamp: Optional[datetime] = None


TransactionCommand = Union[
    SaleCommand,
    RestockCommand,
    WriteOffCommand,
    CreditPaymentCommand,
    OpenStockCommand,
]


SUPPORTED_TRANSACTION_TYPES: tuple[TransactionType, ...] = (
    TransactionType.SALE,
    TransactionType.RESTOCK,
    TransactionType.WRITE_OFF,
    TransactionType.CREDIT_PAYMENT,
    TransactionType.OPEN_STOCK,
    TransactionType.VOID,
)


@dataclass(frozen=True)
class VoidCommand:
    """User intent for voiding a prior transaction."""

    linked_transaction_id: str
    replacement_command: Optional[TransactionCommand]
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None


def _resolve_timestamp(candidate: Optional[datetime]) -> datetime:
    """Resolve optional timestamps into consistent, timezone-aware values.

    Args:
        candidate (datetime | None): Caller-provided timestamp, usually sourced
            from a command object. When ``None`` the helper fabricates a
            timestamp so that downstream operations can rely on monotonic and
            comparable values.

    Returns:
        datetime: ``candidate`` normalized as-is when provided, otherwise the
            current UTC datetime generated via :func:`datetime.now`.
    """

    return candidate if candidate is not None else datetime.now(UTC)


def _get_cache_bucket(context: RuntimeContext, name: str) -> Dict[str, Any]:
    """Return a mutable cache bucket dedicated to the supplied name.

    The business logic layer maintains in-memory caches keyed by domain area
    (products, salesmen, transactions). This helper retrieves or initializes
    the bucket associated with ``name``. Buckets are simple dictionaries that
    store precomputed query results, significantly reducing repeated workbook
    scans.

    Args:
        context (RuntimeContext): Runtime state carrying the shared cache
            dictionary.
        name (str): Logical bucket name to fetch or create.

    Returns:
        dict[str, Any]: Mutable mapping used to cache derived collections for a
            specific domain entity set.
    """

    bucket = context._cache.get(name)
    if bucket is None:
        log.debug("Initializing cache bucket '%s'", name)
        bucket = {}
        context._cache[name] = bucket
    return bucket


def _invalidate_cache(context: RuntimeContext, *names: str) -> None:
    """Evict one or more cache buckets after mutating workbook state.
    
    Following write operations, invalidation ensures subsequent reads rebuild
    their caches from the updated workbook rather than serving stale data.

    Args:
        context (RuntimeContext): Active runtime context whose cache should be
            pruned.
        *names (str): Variable-length list of bucket identifiers to remove.
            Missing buckets are ignored gracefully so callers can request
            targeted invalidation without defensive checks.    
    """

    if not names:
        return

    log.debug("Invalidating cache buckets: %s", ", ".join(names))

    for name in names:
        context._cache.pop(name, None)


def _ensure_products_cache(context: RuntimeContext) -> Dict[str, Any]:
    """Populate the product cache bucket on demand.
    
    By storing both the full list and derivative structures, higher-level
    helpers can service different query patterns without touching the workbook
    again.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, Any]: Bucket containing ``all`` products, ``active``
            products, and a ``by_id`` lookup dictionary. Reuses prior
            computations when available.
    """

    bucket = _get_cache_bucket(context, "products")
    if "all" not in bucket:
        all_products = list(data_manager.iter_products(context.workbook))
        bucket["all"] = all_products
        bucket["active"] = [product for product in all_products if product.is_active]
        bucket["by_id"] = {product.product_id: product for product in all_products}
        log.debug(
            "Populated products cache with %d entries (%d active)",
            len(all_products),
            len(bucket["active"]),
        )
    return bucket


def _ensure_salesmen_cache(context: RuntimeContext) -> Dict[str, Any]:
    """Populate the salesman cache bucket on demand.
    
    The bucket mirrors the structure used for products so public APIs can rely
    on a consistent shape when retrieving cached data.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, Any]: Bucket containing ``all`` salesmen, ``active`` salesmen,
            and a ``by_id`` lookup dictionary.
    """

    bucket = _get_cache_bucket(context, "salesmen")
    if "all" not in bucket:
        all_salesmen = list(data_manager.iter_salesmen(context.workbook))
        bucket["all"] = all_salesmen
        bucket["active"] = [salesman for salesman in all_salesmen if salesman.is_active]
        bucket["by_id"] = {salesman.salesman_id: salesman for salesman in all_salesmen}
        log.debug(
            "Populated salesmen cache with %d entries (%d active)",
            len(all_salesmen),
            len(bucket["active"]),
        )
    return bucket


def _ensure_transactions_cache(context: RuntimeContext) -> Dict[str, Any]:
    """Populate the transaction log cache bucket on demand.
    
    Because transactions are immutable after creation, caching the full list
    and a dictionary keyed by ``transaction_id`` avoids repeated worksheet
    scans even for complex reporting operations.

    Args:
        context (RuntimeContext): Runtime state used to access the workbook and
            shared caches.

    Returns:
        dict[str, Any]: Bucket containing ``all`` transactions and a ``by_id``
            dictionary for quick primary key lookups.
    """

    bucket = _get_cache_bucket(context, "transactions")
    if "all" not in bucket:
        all_transactions = list(data_manager.iter_transactions(context.workbook))
        bucket["all"] = all_transactions
        bucket["by_id"] = {transaction.transaction_id: transaction for transaction in all_transactions}
        log.debug(
            "Populated transactions cache with %d entries",
            len(all_transactions),
        )
    return bucket


def load_runtime_context(config_path: Optional[Path] = None) -> RuntimeContext:
    """Load configuration settings and a live workbook for the BLL.

    The helper forms the foundation for all business logic calls by resolving
    ``config.ini``, parsing settings, and opening the Excel workbook that
    stores transactional data. The resulting :class:`RuntimeContext` bundles the
    immutable settings with a mutable workbook handle and an empty cache store.

    Args:
        config_path (Path | None): Optional override path for the configuration
            file. When omitted the data layer performs its upward search from
            the current working directory.

    Returns:
        RuntimeContext: Fully populated context ready for orchestration
            functions.

    Raises:
        FileNotFoundError: If the configuration file or workbook cannot be
            located.
        KeyError: When mandatory configuration options are missing.
    """
    located_config = data_manager.find_config_file(config_path)
    resolved_config = Path(located_config).expanduser().resolve()
    parser = data_manager.read_config(resolved_config)
    settings = data_manager.parse_settings(parser, base_path=resolved_config.parent)
    workbook = data_manager.open_workbook(settings.data_file)
    log.info("Loaded runtime context for workbook '%s'", settings.data_file)
    return RuntimeContext(settings=settings, workbook=workbook)


def ensure_schema_version(context: RuntimeContext) -> None:
    """Validate workbook compatibility before mutating state.

    The Lounge ERP workbook evolves alongside the source code. This guard
    ensures the version stored in ``config.ini`` matches the application-level
    ``EXPECTED_SCHEMA_VERSION`` before later routines perform inserts.

    Args:
        context (RuntimeContext): Runtime context containing the resolved
            settings.

    Raises:
        RuntimeError: If the schema version declared in the configuration does
            not match ``EXPECTED_SCHEMA_VERSION``.
    """
    if context.settings.schema_version != EXPECTED_SCHEMA_VERSION:
        log.error(
            "Workbook schema mismatch: expected %s, found %s",
            EXPECTED_SCHEMA_VERSION,
            context.settings.schema_version,
        )
        raise RuntimeError(
            "Workbook schema mismatch: expected %s, found %s"
            % (EXPECTED_SCHEMA_VERSION, context.settings.schema_version)
        )

    log.debug("Schema version '%s' validated", context.settings.schema_version)


def list_products(context: RuntimeContext, *, include_inactive: bool = False) -> List[data_manager.ProductRow]:
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
        list[data_manager.ProductRow]: Copy of the cached product dataset in
            sheet order.
    """
    cache = _ensure_products_cache(context)
    source = cache["all"] if include_inactive else cache["active"]
    return list(source)


def list_salesmen(context: RuntimeContext, *, include_inactive: bool = False) -> List[data_manager.SalesmanRow]:
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


def list_transactions(context: RuntimeContext) -> List[data_manager.TransactionRow]:
    """Fetch the immutable transaction log from cache.

    The returned list is a shallow copy of the cached sequence so callers can
    freely sort or filter without mutating the shared cache. Entries remain in
    workbook order, matching the append-only transaction log semantics.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        list[data_manager.TransactionRow]: Snapshot of the entire transaction log in
            workbook order.
    """
    cache = _ensure_transactions_cache(context)
    return list(cache["all"])


def get_product(context: RuntimeContext, product_id: str) -> data_manager.ProductRow:
    """Resolve a product record by its identifier.

    The lookup leverages the product cache for near constant-time access and
    raises :class:`MissingReferenceError` when the workbook does not contain
    the requested identifier.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        product_id (str): Identifier populated in the ``Products`` sheet.

    Returns:
        data_manager.ProductRow: Matching product dataclass sourced from cache.

    Raises:
        MissingReferenceError: If ``product_id`` is absent from the workbook.
    """
    cache = _ensure_products_cache(context)
    try:
        return cache["by_id"][product_id]
    except KeyError as exc:
        log.warning("Product lookup failed for id '%s'", product_id)
        raise MissingReferenceError(f"Unknown product id: {product_id}") from exc


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
        log.warning("Salesman lookup failed for id '%s'", salesman_id)
        raise MissingReferenceError(f"Unknown salesman id: {salesman_id}") from exc


def get_transaction(context: RuntimeContext, transaction_id: str) -> data_manager.TransactionRow:
    """Retrieve a transaction row by its primary identifier.

    Transactions are resolved from the cached ``by_id`` mapping and returned as
    immutable dataclasses. An unknown identifier triggers a
    :class:`MissingReferenceError` to signal data integrity issues immediately.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        transaction_id (str): Transaction identifier from the log sheet.

    Returns:
        data_manager.TransactionRow: Matching transaction dataclass fetched from cache.

    Raises:
        MissingReferenceError: If the log lacks the supplied identifier.
    """
    cache = _ensure_transactions_cache(context)
    try:
        return cache["by_id"][transaction_id]
    except KeyError as exc:
        log.warning("Transaction lookup failed for id '%s'", transaction_id)
        raise MissingReferenceError(f"Unknown transaction id: {transaction_id}") from exc


def calculate_inventory(context: RuntimeContext) -> Dict[str, Decimal]:
    """Compute inventory balances from the transaction log.

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
    inventory: Dict[str, Decimal] = {}
    for transaction in _ensure_transactions_cache(context)["all"]:
        if transaction.product_id is None:
            continue
        current = inventory.get(transaction.product_id, Decimal("0"))
        inventory[transaction.product_id] = current + transaction.quantity_change
    log.debug("Calculated inventory balances for %d products", len(inventory))
    return inventory


def calculate_profit_summary(context: RuntimeContext) -> Dict[str, Decimal]:
    """Produce aggregate revenue, cost, and profit metrics.

    Aggregate values are derived from cached transactions so repeated calls do
    not touch the workbook. Profit is computed as ``total_revenue + total_cost``
    because costs are recorded as negative numbers in the transaction log.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.

    Returns:
        dict[str, Decimal]: Dictionary containing ``total_revenue``,
            ``total_cost``, and ``profit`` values derived from cached
            transactions.
    """
    total_revenue = Decimal("0")
    total_cost = Decimal("0")
    for transaction in _ensure_transactions_cache(context)["all"]:
        total_revenue += transaction.total_revenue
        total_cost += transaction.total_cost
    profit = total_revenue + total_cost
    log.debug(
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


def record_sale(context: RuntimeContext, command: SaleCommand) -> data_manager.TransactionRow:
    """Validate and append a ``SALE`` transaction to the log.

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
        data_manager.TransactionRow: Newly appended sale transaction.

    Raises:
        BusinessRuleViolation: If the referenced product or salesman is
            inactive or the payment type is unsupported.
        MissingReferenceError: If the product or salesman identifiers are
            unknown.
        ValueError: When quantity or revenue validations fail.
    """
    product = get_product(context, command.product_id)
    if not product.is_active:
        log.warning("Attempted sale on inactive product '%s'", command.product_id)
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    salesman = get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        log.warning("Attempted sale with inactive salesman '%s'", command.salesman_id)
        raise BusinessRuleViolation(f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)
    if not isinstance(command.payment_type, PaymentType):
        log.error("Unsupported payment type provided: %s", command.payment_type)
        raise BusinessRuleViolation(f"Unsupported payment type: {command.payment_type}")

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_sale_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded SALE transaction '%s' for product '%s' (quantity=%s, revenue=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def record_restock(context: RuntimeContext, command: RestockCommand) -> data_manager.TransactionRow:
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
        data_manager.TransactionRow: Newly appended restock entry.

    Raises:
        BusinessRuleViolation: If the targeted product is inactive.
        MissingReferenceError: When the referenced product cannot be located.
        ValueError: If quantity or total cost validations fail.
    """
    product = get_product(context, command.product_id)
    if not product.is_active:
        log.warning("Attempted restock on inactive product '%s'", command.product_id)
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(abs(command.total_cost))

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_restock_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded RESTOCK transaction '%s' for product '%s' (quantity=%s, cost=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_cost,
    )
    return transaction


def record_write_off(context: RuntimeContext, command: WriteOffCommand) -> data_manager.TransactionRow:
    """Validate and append a ``WRITE_OFF`` transaction.

    Write-offs reduce inventory without affecting revenue or cost ledgers. The
    quantity is recorded as a negative change to ensure downstream inventory
    calculations treat the write-off as a depletion.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (WriteOffCommand): Structured write-off intent.

    Returns:
        data_manager.TransactionRow: Newly appended write-off entry.

    Raises:
        BusinessRuleViolation: If the product is inactive.
        MissingReferenceError: When the referenced product id is unknown.
        ValueError: If the quantity fails validation.
    """
    product = get_product(context, command.product_id)
    if not product.is_active:
        log.warning("Attempted write-off on inactive product '%s'", command.product_id)
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_write_off_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded WRITE_OFF transaction '%s' for product '%s' (quantity=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
    )
    return transaction


def record_credit_payment(context: RuntimeContext, command: CreditPaymentCommand) -> data_manager.TransactionRow:
    """Append a ``CREDIT_PAYMENT`` transaction linked to an outstanding sale.

    Before persisting, the routine verifies that the referenced sale truly
    represents outstanding credit. The resulting transaction keeps quantity at
    zero while attributing cash revenue to the linked sale identifier.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (CreditPaymentCommand): Structured credit payment intent.

    Returns:
        data_manager.TransactionRow: Newly appended credit payment entry.

    Raises:
        BusinessRuleViolation: If the referenced sale is not eligible for
            credit payment linkage.
        MissingReferenceError: When the linked transaction identifier is
            unknown.
        ValueError: If the payment amount is negative.
    """
    linked_sale = get_transaction(context, command.linked_transaction_id)
    validate_credit_sale_link(linked_sale)
    require_nonnegative_money(command.total_revenue)

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_credit_payment_transaction(
        command,
        transaction_id=transaction_id,
        timestamp=timestamp,
        product_id=linked_sale.product_id,
    )
    data_manager.append_transaction(context.workbook, transaction)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded CREDIT_PAYMENT '%s' linked to '%s' (amount=%s)",
        transaction.transaction_id,
        command.linked_transaction_id,
        command.total_revenue,
    )
    return transaction


def record_open_stock(context: RuntimeContext, command: OpenStockCommand) -> data_manager.TransactionRow:
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
        data_manager.TransactionRow: Newly appended open stock entry.

    Raises:
        BusinessRuleViolation: If the targeted product is inactive.
        MissingReferenceError: When the product identifier is unknown.
        ValueError: If quantity or revenue validations fail.
    """
    product = get_product(context, command.product_id)
    if not product.is_active:
        log.warning("Attempted open stock on inactive product '%s'", command.product_id)
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_open_stock_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded OPEN_STOCK transaction '%s' for product '%s' (quantity=%s, value=%s)",
        transaction.transaction_id,
        command.product_id,
        command.quantity,
        command.total_revenue,
    )
    return transaction


def record_void(context: RuntimeContext, command: VoidCommand) -> List[data_manager.TransactionRow]:
    """Record a ``VOID`` reversal and optional replacement transactions.

    The function first writes the reversal entry that negates the target
    transaction, then optionally records a replacement command provided by the
    caller, chaining through the appropriate ``record_*`` function. Transaction
    caches are invalidated before each write to ensure consistency, so any
    subsequent reads or balance calculations reflect the updated log.

    Args:
        context (RuntimeContext): Runtime context providing workbook access and
            caches.
        command (VoidCommand): Structured void intent including optional
            replacement data.

    Returns:
        list[data_manager.TransactionRow]: Sequence containing the reversal and
            any replacement transactions appended as part of the operation.

    Raises:
        BusinessRuleViolation: If the target transaction cannot be voided or
            the replacement command type is unsupported.
        MissingReferenceError: When the referenced transaction is unknown.
    """
    log.info("Recording VOID for transaction '%s'", command.linked_transaction_id)
    target = get_transaction(context, command.linked_transaction_id)
    validate_void_target(target)

    timestamp = _resolve_timestamp(command.timestamp)
    reversal = build_void_reversal(target, timestamp=timestamp, notes=command.notes)
    data_manager.append_transaction(context.workbook, reversal)
    _invalidate_cache(context, "transactions")
    log.info(
        "Recorded VOID reversal '%s' for transaction '%s'",
        reversal.transaction_id,
        target.transaction_id,
    )

    results: List[data_manager.TransactionRow] = [reversal]
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
        raise BusinessRuleViolation("Unsupported replacement command type")

    return results


def generate_transaction_id(*, prefix: str = "T", when: Optional[datetime] = None) -> str:
    """Generate a sortable transaction identifier using UTC timestamps.

    Args:
        prefix (str): Optional designator prepended to the identifier. Defaults
            to ``"T"`` for standard transactions but is overridden for voids.
        when (datetime | None): Timestamp used for deterministically producing
            the identifier. When ``None`` the current UTC time is used.

    Returns:
        str: Identifier formed as ``{prefix}{YYYYMMDDHHMMSSffffff}``.

    The format preserves chronological ordering and packs microseconds to avoid
    collisions when multiple transactions occur within the same second. Caller
    supplied timestamps allow deterministic identifiers during testing or data
    migrations.
    """
    when = when or _resolve_timestamp(None)
    return f"{prefix}{when.strftime('%Y%m%d%H%M%S%f')}"


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
        log.error("Quantity validation failed: %s", quantity)
        raise ValueError("Quantity must be greater than zero")


def require_nonnegative_money(amount: Decimal) -> None:
    """Validate that a monetary value is nonnegative.

    Args:
        amount (Decimal): Currency value supplied by a command object.

    Raises:
        ValueError: If ``amount`` is less than zero.

    Monetary fields are stored as signed decimals within the transaction log.
    This helper ensures upstream workflows never pass negative revenue or cost
    figures without explicitly opting into that behavior.
    """
    if amount < Decimal("0"):
        log.error("Monetary value validation failed: %s", amount)
        raise ValueError("Amount must be zero or positive")


def persist_context(context: RuntimeContext) -> None:
    """Persist any in-memory workbook changes to disk.

    Args:
        context (RuntimeContext): Runtime context whose workbook should be
            saved.

    The function supplies :attr:`RuntimeContext.settings.data_file` directly to
    the data layer to ensure saves always target the configured workbook path.
    In-memory caches remain valid because the workbook handle is unchanged
    after the save completes.
    """
    data_manager.save_workbook(
        context.workbook,
        destination=context.settings.data_file,
    )
    log.info("Persisted workbook '%s'", context.settings.data_file)


def refresh_context(context: RuntimeContext) -> RuntimeContext:
    """Reload the workbook to discard unsaved modifications.

    Args:
        context (RuntimeContext): Runtime context whose settings should be
            reused.

    Returns:
        RuntimeContext: Fresh context containing a newly opened workbook and
            an empty cache.

    Raises:
        FileNotFoundError: If the backing workbook cannot be reloaded.

    This is effectively a "revert" operation that drops in-memory edits and
    hands back a pristine workbook pointer. Because a new :class:`RuntimeContext`
    is produced, any cached data from the previous context is discarded.
    """
    workbook = data_manager.refresh_workbook(context.settings.data_file)
    log.info("Reloaded workbook '%s'", context.settings.data_file)
    return RuntimeContext(settings=context.settings, workbook=workbook)


def validate_credit_sale_link(transaction: data_manager.TransactionRow) -> None:
    """Ensure a sale transaction qualifies for credit payment linkage.

    Args:
        transaction (data_manager.TransactionRow): Transaction row purportedly
            representing a credit sale.

    Raises:
        BusinessRuleViolation: If ``transaction`` is not a credit sale eligible
            for a payment linkage.

    Credit payments are only allowed to target sales that were recorded on
    credit, have not yet reported revenue, and are not already linked to another
    transaction. These conditions prevent double-settling or misclassifying a
    cash sale as credit.
    """
    if transaction.transaction_type != TransactionType.SALE.value:
        log.error(
            "Credit payment validation failed: transaction '%s' is not a sale",
            transaction.transaction_id,
        )
        raise BusinessRuleViolation("Credit payments must reference a SALE transaction")
    if transaction.payment_type != PaymentType.ON_CREDIT.value:
        log.error(
            "Credit payment validation failed: transaction '%s' payment type is '%s'",
            transaction.transaction_id,
            transaction.payment_type,
        )
        raise BusinessRuleViolation("Linked sale is not recorded as credit")
    if transaction.total_revenue > Decimal("0"):
        log.error(
            "Credit payment validation failed: transaction '%s' already reports revenue",
            transaction.transaction_id,
        )
        raise BusinessRuleViolation("Linked credit sale already reports revenue")
    if transaction.linked_transaction_id is not None:
        log.error(
            "Credit payment validation failed: transaction '%s' already links to '%s'",
            transaction.transaction_id,
            transaction.linked_transaction_id,
        )
        raise BusinessRuleViolation("Linked sale already references another transaction")


def validate_void_target(transaction: data_manager.TransactionRow) -> None:
    """Confirm that a transaction may be voided under business rules.

    Args:
        transaction (data_manager.TransactionRow): Transaction row selected for
            voiding.

    Raises:
        BusinessRuleViolation: If the transaction type is ineligible for
            voiding.

    VOID and CREDIT_PAYMENT transactions are intentionally immutable because a
    second void would create loops and credit payments represent actual cash
    settlements. Attempting to void these entries surfaces a domain error.
    """
    if transaction.transaction_type == TransactionType.VOID.value:
        log.error("Cannot void transaction '%s' because it is already a void", transaction.transaction_id)
        raise BusinessRuleViolation("Cannot void a VOID transaction")
    if transaction.transaction_type == TransactionType.CREDIT_PAYMENT.value:
        log.error(
            "Cannot void transaction '%s' because it is a credit payment",
            transaction.transaction_id,
        )
        raise BusinessRuleViolation("Cannot void a credit payment transaction")


def build_void_reversal(transaction: data_manager.TransactionRow, *, timestamp: datetime, notes: Optional[str]) -> data_manager.TransactionRow:
    """Create a reversal transaction that negates a prior entry.

    Args:
        transaction (data_manager.TransactionRow): Original transaction being
            reversed.
        timestamp (datetime): Timestamp to apply to the reversal entry.
        notes (str | None): Optional contextual notes to persist alongside the
            reversal.

    Returns:
        data_manager.TransactionRow: Synthetic ``VOID`` transaction that
            negates the quantities, costs, and revenues of ``transaction``.

    The reversal mirrors the original transaction's identifiers while flipping
    all numeric deltas and storing the original identifier in
    ``linked_transaction_id``. Consumers can use this metadata to establish
    audit trails.
    """
    return data_manager.TransactionRow(
        transaction_id=generate_transaction_id(prefix="V", when=timestamp),
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.VOID.value,
        product_id=transaction.product_id,
        salesman_id=transaction.salesman_id,
        payment_type=transaction.payment_type,
        quantity_change=-transaction.quantity_change,
        total_revenue=-transaction.total_revenue,
        total_cost=-transaction.total_cost,
        linked_transaction_id=transaction.transaction_id,
        notes=notes,
    )


def build_sale_transaction(command: SaleCommand, *, transaction_id: str, timestamp: datetime) -> data_manager.TransactionRow:
    """Materialize a :class:`SaleCommand` into a DAL transaction row.

    Args:
        command (SaleCommand): User intent describing the sale.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        data_manager.TransactionRow: Row ready for persistence via the data
            layer.

    Quantities are stored as negative values to indicate stock depletion, and
    costs remain zero because they are captured during restock events. The
    payment type is serialized from the enum into the workbook's expected text
    representation.
    """
    quantity_change = -abs(command.quantity)
    return data_manager.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.SALE.value,
        product_id=command.product_id,
        salesman_id=command.salesman_id,
        payment_type=command.payment_type.value,
        quantity_change=quantity_change,
        total_revenue=command.total_revenue,
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=command.notes,
    )


def build_restock_transaction(command: RestockCommand, *, transaction_id: str, timestamp: datetime) -> data_manager.TransactionRow:
    """Materialize a :class:`RestockCommand` into a DAL transaction row.

    Args:
        command (RestockCommand): User intent describing the restock.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        data_manager.TransactionRow: Row ready for persistence via the data
            layer.

    Restocks add inventory, so the quantity is expressed as a positive value.
    Costs are encoded as negative amounts, aligning with the transaction log's
    convention that expenses subtract from profit.
    """
    quantity_change = abs(command.quantity)
    cost_value = -abs(command.total_cost)
    return data_manager.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.RESTOCK.value,
        product_id=command.product_id,
        salesman_id=None,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=Decimal("0.00"),
        total_cost=cost_value,
        linked_transaction_id=None,
        notes=command.notes,
    )


def build_write_off_transaction(command: WriteOffCommand, *, transaction_id: str, timestamp: datetime) -> data_manager.TransactionRow:
    """Materialize a :class:`WriteOffCommand` into a DAL transaction row.

    Args:
        command (WriteOffCommand): User intent describing the write-off.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        data_manager.TransactionRow: Row ready for persistence via the data
            layer.

    Write-offs reduce stock without touching revenue or cost columns. The
    constructed row therefore contains a negative quantity delta and zeroed
    monetary amounts.
    """
    quantity_change = -abs(command.quantity)
    return data_manager.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.WRITE_OFF.value,
        product_id=command.product_id,
        salesman_id=None,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=Decimal("0.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=command.notes,
    )


def build_credit_payment_transaction(command: CreditPaymentCommand, *, transaction_id: str, timestamp: datetime, product_id: Optional[str] = None) -> data_manager.TransactionRow:
    """Materialize a :class:`CreditPaymentCommand` into a DAL transaction row.

    Args:
        command (CreditPaymentCommand): User intent describing the credit
            payment.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.
        product_id (str | None): Optional product identifier inferred from the
            linked sale.

    Returns:
        data_manager.TransactionRow: Row ready for persistence via the data
            layer.

    Credit payments do not affect stock, so the quantity is fixed at zero. The
    helper uses ``PaymentType.CASH`` to record how the credit was settled and
    copies the linked sale identifier for traceability.
    """
    return data_manager.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.CREDIT_PAYMENT.value,
        product_id=product_id,
        salesman_id=None,
        payment_type=PaymentType.CASH.value,
        quantity_change=Decimal("0"),
        total_revenue=command.total_revenue,
        total_cost=Decimal("0.00"),
        linked_transaction_id=command.linked_transaction_id,
        notes=command.notes,
    )


def build_open_stock_transaction(command: OpenStockCommand, *, transaction_id: str, timestamp: datetime) -> data_manager.TransactionRow:
    """Materialize an :class:`OpenStockCommand` into a DAL transaction row.

    Args:
        command (OpenStockCommand): User intent describing the opening stock.
        transaction_id (str): Unique identifier allocated for the transaction.
        timestamp (datetime): Timestamp assigned to the transaction.

    Returns:
        data_manager.TransactionRow: Row ready for persistence via the data
            layer.

    Opening stock transactions provide a baseline for inventory and valuation
    reports, so the helper records the quantity as a positive adjustment and
    propagates ``total_revenue`` unchanged to capture the initial valuation.
    """
    quantity_change = abs(command.quantity)
    return data_manager.TransactionRow(
        transaction_id=transaction_id,
        timestamp_iso=timestamp.isoformat(),
        transaction_type=TransactionType.OPEN_STOCK.value,
        product_id=command.product_id,
        salesman_id=None,
        payment_type=None,
        quantity_change=quantity_change,
        total_revenue=command.total_revenue,
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )
