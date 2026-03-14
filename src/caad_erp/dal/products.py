"""Excel persistence helpers for the ``Products`` worksheet.

The routines in this module coordinate with :mod:`openpyxl` to read and write
product rows while preserving types that the business layer expects. They
provide iteration, append, and update behaviors plus serializers that bridge
between worksheet row tuples and typed dataclasses.
"""

import dataclasses
import logging
import typing as t
from decimal import Decimal

from openpyxl.workbook import Workbook

from caad_erp import constants

from . import workbook as dal_workbook

logger = logging.getLogger(__name__)


PRODUCTS_SHEET = constants.SheetName.PRODUCTS.value


@dataclasses.dataclass(frozen=True)
class ProductRow:
    """In-memory view of a row from the ``Products`` sheet."""

    product_id: str
    product_name: str
    sell_price: Decimal
    is_active: bool


def iter_products(workbook: Workbook) -> t.Iterable[ProductRow]:
    """Iterate over product records stored on the ``Products`` worksheet.

    The iterator skips the header row and any fully empty rows to avoid
    producing meaningless values. Each non-empty row is converted into a
    :class:`ProductRow` dataclass via :func:`deserialize_product` to provide a
    structured, type-aware record.

    Args:
        workbook (Workbook): Workbook containing the ``Products`` sheet.

    Yields:
        ProductRow: One structured row for each meaningful record in the sheet.
    """

    logger.debug("Iterating products worksheet '%s'", PRODUCTS_SHEET)
    sheet = workbook[PRODUCTS_SHEET]
    for raw in sheet.iter_rows(min_row=2, values_only=True):
        # skip fully empty rows
        if any(cell is not None for cell in raw):
            yield _deserialize_product(raw)


def append_product(workbook: Workbook, record: ProductRow) -> None:
    """Append a product record to the ``Products`` worksheet.

    The dataclass is serialized into the exact column ordering expected by the
    sheet before being appended. Row formulas or formatting are preserved by
    ``openpyxl`` as part of the append operation.

    Args:
        workbook (Workbook): Workbook whose products sheet should be modified.
        record (ProductRow): Structured product data ready for persistence.
    """

    logger.debug("Appending product '%s' to products sheet", record.product_id)
    sheet = workbook[PRODUCTS_SHEET]
    sheet.append(_serialize_product(record))


def update_product(workbook: Workbook, product_id: str, *, field_values: dict[str, t.Any]) -> None:
    """Update selected columns for an existing product.

    The function locates the row whose ``ProductID`` matches ``product_id``,
    validates that each requested field exists in the header row, and then writes
    the provided values into the corresponding cells. Only the specified fields
    are modified, leaving other columns untouched.

    Args:
        workbook (Workbook): Workbook containing the products sheet.
        product_id (str): Identifier used to locate the target row.
        field_values (dict[str, Any]): Mapping of column names to replacement
            values.

    Raises:
        KeyError: If the product or any referenced column cannot be found.
    """

    row_index = dal_workbook.locate_row(
        workbook,
        PRODUCTS_SHEET,
        "ProductID",
        product_id
    )
    if row_index is None:
        logger.warning("Product '%s' not found during update", product_id)
        raise KeyError(f"Product not found: {product_id}")

    sheet = workbook[PRODUCTS_SHEET]
    headers = list(sheet[1])
    header_map = {cell.value: idx + 1 for idx, cell in enumerate(headers)}

    for field, value in field_values.items():
        if field not in header_map:
            logger.error("Unknown product field '%s' referenced during update", field)
            raise KeyError(f"Unknown product field: {field}")
        col = header_map[field]
        sheet.cell(row=row_index, column=col, value=value)
    logger.debug("Updated product '%s' fields: %s", product_id, list(field_values.keys()))


def _serialize_product(record: ProductRow) -> list[object]:
    """Convert a product dataclass into the worksheet column ordering.

    Args:
        record (ProductRow): Structured product data to transform.

    Returns:
        list[object]: Values arranged as ``[ProductID, ProductName,
        SellPrice, IsActive]`` suitable for worksheet insertion.
    """

    return [record.product_id, record.product_name, record.sell_price, record.is_active]


def _deserialize_product(raw_row: t.Sequence[object]) -> ProductRow:
    """Convert a raw worksheet row into a strongly typed product record.

    The converter normalizes numeric values into :class:`~decimal.Decimal`
    instances and coerces id/name fields to ``str`` to avoid surprises caused by
    Excel automatically interpreting numbers.

    Args:
        raw_row (Sequence[object]): Raw cell values from the worksheet row.

    Returns:
        ProductRow: Dataclass containing consistent Python representations of
            the row contents.
    """

    product_id = raw_row[0]
    product_name = raw_row[1]
    sell_raw = raw_row[2]
    is_active = raw_row[3]

    sell_price = Decimal(str(sell_raw)) if sell_raw is not None else Decimal("0.00")
    return ProductRow(product_id=str(product_id), product_name=str(product_name), sell_price=sell_price, is_active=bool(is_active))
