"""Excel persistence helpers for maintaining the ``Salesmen`` worksheet.

The module reshapes worksheet rows into typed records, exposes append and
update primitives, and centralizes the sheet naming logic used throughout the
data layer. It mirrors the patterns established for other workbook-backed
entities so the business layer interacts with consistent abstractions.
"""

import dataclasses
import logging
import typing as t

from openpyxl.workbook import Workbook

from caad_erp import constants

from . import workbook as dal_workbook

logger = logging.getLogger(__name__)


SALESMEN_SHEET = constants.SheetName.SALESMEN.value


@dataclasses.dataclass(frozen=True)
class SalesmanRow:
    """In-memory view of a row from the ``Salesmen`` sheet."""

    salesman_id: str
    salesman_name: str
    is_active: bool


def iter_salesmen(workbook: Workbook) -> t.Iterable[SalesmanRow]:
    """Iterate over the ``Salesmen`` worksheet and yield typed records.

    Header and completely empty rows are ignored. Remaining rows are converted
    into :class:`SalesmanRow` instances which normalize the raw worksheet values
    into predictable Python types.

    Args:
        workbook (Workbook): Workbook containing the ``Salesmen`` sheet.

    Yields:
        SalesmanRow: Structured representation of each active row in the sheet.
    """

    logger.debug("Iterating salesmen worksheet '%s'", SALESMEN_SHEET)
    sheet = workbook[SALESMEN_SHEET]
    for raw in sheet.iter_rows(min_row=2, values_only=True):
        if any(cell is not None for cell in raw):
            yield _deserialize_salesman(raw)


def append_salesman(workbook: Workbook, record: SalesmanRow) -> None:
    """Append a salesman record to the ``Salesmen`` worksheet.

    The helper serializes the dataclass into the worksheet's column ordering and
    leverages :meth:`openpyxl.worksheet.worksheet.Worksheet.append` to add the
    new row.

    Args:
        workbook (Workbook): Workbook whose salesmen sheet should be modified.
        record (SalesmanRow): Salesman entry to append.
    """

    logger.debug("Appending salesman '%s' to salesmen sheet", record.salesman_id)
    sheet = workbook[SALESMEN_SHEET]
    sheet.append(_serialize_salesman(record))


def update_salesman(workbook: Workbook, salesman_id: str, *, field_values: dict[str, t.Any]) -> None:
    """Update selected columns for an existing salesman.

    The function resolves the row by ``SalesmanID``, checks that each requested
    column exists, and updates only the specified fields with the supplied
    values.

    Args:
        workbook (Workbook): Workbook containing the salesmen sheet.
        salesman_id (str): Identifier used to locate the target row.
        field_values (dict[str, Any]): Mapping of column names to replacement
            values.

    Raises:
        KeyError: If the salesman or any referenced column is missing.
    """

    sheet_name = SALESMEN_SHEET
    row_index = dal_workbook.locate_row(
        workbook,
        sheet_name,
        "SalesmanID",
        salesman_id
    )
    if row_index is None:
        logger.warning("Salesman '%s' not found during update", salesman_id)
        raise KeyError(f"Salesman not found: {salesman_id}")

    sheet = workbook[sheet_name]
    headers = list(sheet[1])
    header_map = {cell.value: idx + 1 for idx, cell in enumerate(headers)}

    for field, value in field_values.items():
        if field not in header_map:
            logger.error("Unknown salesman field '%s' referenced during update", field)
            raise KeyError(f"Unknown salesman field: {field}")
        col = header_map[field]
        sheet.cell(row=row_index, column=col, value=value)
    logger.debug("Updated salesman '%s' fields: %s", salesman_id, list(field_values.keys()))


def _serialize_salesman(record: SalesmanRow) -> list[object]:
    """Convert a salesman dataclass into the worksheet column ordering.

    Args:
        record (SalesmanRow): Structured salesman data to transform.

    Returns:
        list[object]: Values arranged as ``[SalesmanID, SalesmanName,
        IsActive]`` suitable for worksheet insertion.
    """

    return [record.salesman_id, record.salesman_name, record.is_active]


def _deserialize_salesman(raw_row: t.Sequence[object]) -> SalesmanRow:
    """Convert a raw worksheet row into a strongly typed salesman record.

    The function coerces identifier and name fields to ``str`` and uses ``bool``
    coercion for the active flag to hide underlying spreadsheet encodings.

    Args:
        raw_row (Sequence[object]): Raw cell values from the worksheet row.

    Returns:
        SalesmanRow: Dataclass populated with normalized values.
    """

    salesman_id = raw_row[0]
    salesman_name = raw_row[1]
    is_active = raw_row[2]
    return SalesmanRow(salesman_id=str(salesman_id), salesman_name=str(salesman_name), is_active=bool(is_active))
