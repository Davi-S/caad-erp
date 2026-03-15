"""Excel persistence helpers for the transaction log worksheet.

These helpers stream, append, and normalize transaction rows to keep
``openpyxl`` interactions encapsulated. By surfacing typed dataclasses the
business layer can reason about monetary values and optional relationships
without handling spreadsheet quirks directly.
"""

import dataclasses
import logging
import typing as t
from decimal import Decimal

from openpyxl.workbook import Workbook

from caad_erp import constants

logger = logging.getLogger(__name__)


TRANSACTION_LOG_SHEET = constants.SheetName.TRANSACTION_LOG.value


@dataclasses.dataclass(frozen=True)
class TransactionRow:
    """In-memory view of a row from the ``TransactionLog`` sheet."""

    transaction_id: str
    timestamp_iso: str
    transaction_type: str
    product_id: t.Optional[str]
    salesman_id: t.Optional[str]
    payment_type: t.Optional[str]
    quantity_change: Decimal
    total_revenue: Decimal
    total_cost: Decimal
    linked_transaction_id: t.Optional[str]
    notes: t.Optional[str]


def iter_transactions(workbook: Workbook) -> t.Iterable[TransactionRow]:
    """Stream transaction records from the ``TransactionLog`` worksheet.

    The generator skips headers and rows whose cells are all ``None``. Each
    meaningful row is transformed into a :class:`TransactionRow` via
    :func:`deserialize_transaction`, ensuring numeric fields become
    :class:`~decimal.Decimal` instances and optional text fields remain ``None``
    when blank.

    Args:
        workbook (Workbook): Workbook containing the transaction log sheet.

    Yields:
        TransactionRow: Normalized transaction record for each populated row.
    """

    logger.debug("Iterating transactions worksheet '%s'",
                 TRANSACTION_LOG_SHEET)
    sheet = workbook[TRANSACTION_LOG_SHEET]
    for raw in sheet.iter_rows(min_row=2, values_only=True):
        if any(cell is not None for cell in raw):
            yield _deserialize_transaction(raw)


def append_transaction(workbook: Workbook, record: TransactionRow) -> None:
    """Append a transaction record to the ``TransactionLog`` worksheet.

    Numerical fields remain :class:`~decimal.Decimal` instances after
    serialization, allowing Excel to preserve precision when the workbook is
    saved.

    Args:
        workbook (Workbook): Workbook containing the transaction logger.
        record (TransactionRow): Transaction to persist.
    """

    logger.debug(
        "Appending transaction '%s' of type '%s'",
        record.transaction_id,
        record.transaction_type,
    )
    sheet = workbook[TRANSACTION_LOG_SHEET]
    sheet.append(_serialize_transaction(record))


def _serialize_transaction(record: TransactionRow) -> list[object]:
    """Convert a transaction dataclass into the transaction log column order.

    Args:
        record (TransactionRow): Structured transaction data to transform.

    Returns:
        list[object]: Values ordered to match the spreadsheet columns,
            preserving :class:`~decimal.Decimal` instances for numeric fields.
    """

    return [
        record.transaction_id,
        record.timestamp_iso,
        record.transaction_type,
        record.product_id,
        record.salesman_id,
        record.payment_type,
        record.quantity_change,
        record.total_revenue,
        record.total_cost,
        record.linked_transaction_id,
        record.notes,
    ]


def _deserialize_transaction(raw_row: t.Sequence[object]) -> TransactionRow:
    """Convert a raw worksheet row into a strongly typed transaction record.

    Decimal-compatible columns are normalized into :class:`~decimal.Decimal`
    instances to preserve precision, optional columns remain ``None`` when the
    sheet leaves them blank, and textual columns default to empty strings to
    avoid ``None`` values where downstream code expects text.

    Args:
        raw_row (Sequence[object]): Raw cell values from the transaction log row
            in their worksheet order.

    Returns:
        TransactionRow: Dataclass reflecting the row contents with consistent
            Python types.
    """

    (
        transaction_id,
        timestamp_iso,
        transaction_type,
        product_id,
        salesman_id,
        payment_type,
        quantity_change_raw,
        total_revenue_raw,
        total_cost_raw,
        linked_transaction_id,
        notes,
    ) = raw_row

    quantity_change = Decimal(
        str(quantity_change_raw)) if quantity_change_raw is not None else Decimal("0")
    total_revenue = Decimal(
        str(total_revenue_raw)) if total_revenue_raw is not None else Decimal("0.00")
    total_cost = Decimal(str(total_cost_raw)
                         ) if total_cost_raw is not None else Decimal("0.00")

    return TransactionRow(
        transaction_id=str(transaction_id),
        timestamp_iso=str(timestamp_iso) if timestamp_iso is not None else "",
        transaction_type=str(
            transaction_type) if transaction_type is not None else "",
        product_id=(str(product_id) if product_id is not None else None),
        salesman_id=(str(salesman_id) if salesman_id is not None else None),
        payment_type=(str(payment_type) if payment_type is not None else None),
        quantity_change=quantity_change,
        total_revenue=total_revenue,
        total_cost=total_cost,
        linked_transaction_id=(str(linked_transaction_id)
                               if linked_transaction_id is not None else None),
        notes=(str(notes) if notes is not None else None),
    )
