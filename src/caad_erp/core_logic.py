"""Business logic layer for Lounge ERP.

This module contains the rule engine that orchestrates the immutable
``TransactionLog`` model. It consumes the Data Access Layer (DAL) for all I/O
while ensuring every mutation passes through the domain rules described in the
architecture guide.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Union

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
    return candidate if candidate is not None else datetime.now(UTC)


def load_runtime_context(config_path: Optional[Path] = None) -> RuntimeContext:
    """Load settings and workbook references for downstream operations."""
    located_config = data_manager.find_config_file(config_path)
    resolved_config = Path(located_config).expanduser().resolve()
    parser = data_manager.read_config(resolved_config)
    settings = data_manager.parse_settings(parser, base_path=resolved_config.parent)
    workbook = data_manager.open_workbook(settings.data_file)
    log.info("Loaded runtime context for workbook '%s'", settings.data_file)
    return RuntimeContext(settings=settings, workbook=workbook)


def ensure_schema_version(context: RuntimeContext) -> None:
    """Validate that the workbook schema matches the expected version."""
    if context.settings.schema_version != EXPECTED_SCHEMA_VERSION:
        raise RuntimeError(
            "Workbook schema mismatch: expected %s, found %s"
            % (EXPECTED_SCHEMA_VERSION, context.settings.schema_version)
        )


def list_products(context: RuntimeContext, *, include_inactive: bool = False) -> List[data_manager.ProductRow]:
    """Return all products, optionally including inactive entries."""
    products = list(data_manager.iter_products(context.workbook))
    if include_inactive:
        return products
    return [product for product in products if product.is_active]


def list_salesmen(context: RuntimeContext, *, include_inactive: bool = False) -> List[data_manager.SalesmanRow]:
    """Return all salesmen, optionally including inactive entries."""
    salesmen = list(data_manager.iter_salesmen(context.workbook))
    if include_inactive:
        return salesmen
    return [salesman for salesman in salesmen if salesman.is_active]


def list_transactions(context: RuntimeContext) -> List[data_manager.TransactionRow]:
    """Return the full immutable transaction log."""
    return list(data_manager.iter_transactions(context.workbook))


def get_product(context: RuntimeContext, product_id: str) -> data_manager.ProductRow:
    """Fetch a single product or raise ``MissingReferenceError``."""
    for product in list_products(context, include_inactive=True):
        if product.product_id == product_id:
            return product
    raise MissingReferenceError(f"Unknown product id: {product_id}")


def get_salesman(context: RuntimeContext, salesman_id: str) -> data_manager.SalesmanRow:
    """Fetch a single salesman or raise ``MissingReferenceError``."""
    for salesman in list_salesmen(context, include_inactive=True):
        if salesman.salesman_id == salesman_id:
            return salesman
    raise MissingReferenceError(f"Unknown salesman id: {salesman_id}")


def get_transaction(context: RuntimeContext, transaction_id: str) -> data_manager.TransactionRow:
    """Fetch a transaction by ID or raise ``MissingReferenceError``."""
    for transaction in list_transactions(context):
        if transaction.transaction_id == transaction_id:
            return transaction
    raise MissingReferenceError(f"Unknown transaction id: {transaction_id}")


def calculate_inventory(context: RuntimeContext) -> Dict[str, Decimal]:
    """Return stock levels keyed by ``ProductID`` computed from the log."""
    inventory: Dict[str, Decimal] = {}
    for transaction in list_transactions(context):
        if transaction.product_id is None:
            continue
        current = inventory.get(transaction.product_id, Decimal("0"))
        inventory[transaction.product_id] = current + transaction.quantity_change
    return inventory


def calculate_profit_summary(context: RuntimeContext) -> Dict[str, Decimal]:
    """Return aggregate totals for revenue, cost, and profit."""
    total_revenue = Decimal("0")
    total_cost = Decimal("0")
    for transaction in list_transactions(context):
        total_revenue += transaction.total_revenue
        total_cost += transaction.total_cost
    profit = total_revenue + total_cost
    return {
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "profit": profit,
    }


def record_sale(context: RuntimeContext, command: SaleCommand) -> data_manager.TransactionRow:
    """Apply validations and append a ``SALE`` transaction."""
    product = get_product(context, command.product_id)
    if not product.is_active:
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    salesman = get_salesman(context, command.salesman_id)
    if not salesman.is_active:
        raise BusinessRuleViolation(f"Salesman '{command.salesman_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)
    if not isinstance(command.payment_type, PaymentType):
        raise BusinessRuleViolation(f"Unsupported payment type: {command.payment_type}")

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_sale_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    return transaction


def record_restock(context: RuntimeContext, command: RestockCommand) -> data_manager.TransactionRow:
    """Apply validations and append a ``RESTOCK`` transaction."""
    product = get_product(context, command.product_id)
    if not product.is_active:
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(abs(command.total_cost))

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_restock_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    return transaction


def record_write_off(context: RuntimeContext, command: WriteOffCommand) -> data_manager.TransactionRow:
    """Apply validations and append a ``WRITE_OFF`` transaction."""
    product = get_product(context, command.product_id)
    if not product.is_active:
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_write_off_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    return transaction


def record_credit_payment(context: RuntimeContext, command: CreditPaymentCommand) -> data_manager.TransactionRow:
    """Append a ``CREDIT_PAYMENT`` transaction linked to a prior credit sale."""
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
    return transaction


def record_open_stock(context: RuntimeContext, command: OpenStockCommand) -> data_manager.TransactionRow:
    """Append an ``OPEN_STOCK`` transaction during period initialization."""
    product = get_product(context, command.product_id)
    if not product.is_active:
        raise BusinessRuleViolation(f"Product '{command.product_id}' is inactive")
    require_positive_quantity(command.quantity)
    require_nonnegative_money(command.total_revenue)

    timestamp = _resolve_timestamp(command.timestamp)
    transaction_id = generate_transaction_id(when=timestamp)
    transaction = build_open_stock_transaction(command, transaction_id=transaction_id, timestamp=timestamp)
    data_manager.append_transaction(context.workbook, transaction)
    return transaction


def record_void(context: RuntimeContext, command: VoidCommand) -> List[data_manager.TransactionRow]:
    """Append the ``VOID`` reversal and the corrected replacement transaction(s)."""
    target = get_transaction(context, command.linked_transaction_id)
    validate_void_target(target)

    timestamp = _resolve_timestamp(command.timestamp)
    reversal = build_void_reversal(target, timestamp=timestamp, notes=command.notes)
    data_manager.append_transaction(context.workbook, reversal)

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
    """Generate a unique, sortable transaction identifier."""
    when = when or _resolve_timestamp(None)
    return f"{prefix}{when.strftime('%Y%m%d%H%M%S%f')}"


def require_positive_quantity(quantity: Decimal) -> None:
    """Ensure the provided quantity represents a positive stock movement."""
    if quantity <= Decimal("0"):
        raise ValueError("Quantity must be greater than zero")


def require_nonnegative_money(amount: Decimal) -> None:
    """Ensure a currency value is nonnegative."""
    if amount < Decimal("0"):
        raise ValueError("Amount must be zero or positive")


def persist_context(context: RuntimeContext) -> None:
    """Write pending workbook changes to disk."""
    data_manager.save_workbook(context.workbook)
    log.info("Persisted workbook '%s'", context.settings.data_file)


def refresh_context(context: RuntimeContext) -> RuntimeContext:
    """Reload the workbook from disk and return a new context."""
    workbook = data_manager.refresh_workbook(context.settings.data_file)
    log.info("Reloaded workbook '%s'", context.settings.data_file)
    return RuntimeContext(settings=context.settings, workbook=workbook)


def validate_credit_sale_link(transaction: data_manager.TransactionRow) -> None:
    """Confirm that a referenced sale is eligible for credit payment linkage."""
    if transaction.transaction_type != TransactionType.SALE.value:
        raise BusinessRuleViolation("Credit payments must reference a SALE transaction")
    if transaction.payment_type != PaymentType.ON_CREDIT.value:
        raise BusinessRuleViolation("Linked sale is not recorded as credit")
    if transaction.total_revenue > Decimal("0"):
        raise BusinessRuleViolation("Linked credit sale already reports revenue")
    if transaction.linked_transaction_id is not None:
        raise BusinessRuleViolation("Linked sale already references another transaction")


def validate_void_target(transaction: data_manager.TransactionRow) -> None:
    """Ensure a transaction can be voided according to business rules."""
    if transaction.transaction_type == TransactionType.VOID.value:
        raise BusinessRuleViolation("Cannot void a VOID transaction")
    if transaction.transaction_type == TransactionType.CREDIT_PAYMENT.value:
        raise BusinessRuleViolation("Cannot void a credit payment transaction")


def build_void_reversal(transaction: data_manager.TransactionRow, *, timestamp: datetime, notes: Optional[str]) -> data_manager.TransactionRow:
    """Construct the reversing ``VOID`` transaction for a prior entry."""
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
    """Transform a ``SaleCommand`` into a DAL transaction row."""
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
    """Transform a ``RestockCommand`` into a DAL transaction row."""
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
    """Transform a ``WriteOffCommand`` into a DAL transaction row."""
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
    """Transform a ``CreditPaymentCommand`` into a DAL transaction row."""
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
    """Transform an ``OpenStockCommand`` into a DAL transaction row."""
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
