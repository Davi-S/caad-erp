"""Utility for initializing the CAAD ERP master workbook.

The module doubles as a script (``python setup_excel.py``) and as a library
used by tests or other tooling. Shared helpers keep the workbook bootstrap
logic consistent regardless of the execution path.
"""

from __future__ import annotations

import argparse
import configparser
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, MutableMapping, Sequence
import sys

import openpyxl
from openpyxl.styles import Font

# Define the schema exactly as specified in the architecture
SHEET_COLUMNS: Mapping[str, Sequence[str]] = {
    "Products": [
        "ProductID",
        "ProductName",
        "SellPrice",
        "IsActive",
    ],
    "Salesmen": [
        "SalesmanID",
        "SalesmanName",
        "IsActive",
    ],
    "TransactionLog": [
        "TransactionID",
        "Timestamp",
        "TransactionType",
        "ProductID",
        "SalesmanID",
        "PaymentType",
        "QuantityChange",
        "TotalRevenue",
        "TotalCost",
        "LinkedTransactionID",
        "Notes",
    ],
}

# Define the default salesman
DEFAULT_SALESMAN: MutableMapping[str, object] = {
    "SalesmanID": "GRR00000000",
    "SalesmanName": "Lounge Sale",
    "IsActive": True,
}

CONFIG_FILE = "config.ini"


@dataclass(frozen=True)
class SetupSettings:
    """Type-safe representation of configuration values used during setup."""

    data_file: Path
    default_salesman_id: str


def load_settings(config_path: Path) -> SetupSettings:
    """Read ``config.ini`` and produce :class:`SetupSettings`.

    Relative paths inside the config file are resolved against the config file's
    directory so the behavior matches the previous script.
    """

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    parser = configparser.ConfigParser()
    parser.read(config_path)

    try:
        data_file_raw = parser.get("System", "DataFile")
        default_salesman_id = parser.get("Defaults", "DefaultSalesman")
    except (configparser.NoSectionError, configparser.NoOptionError) as exc:
        raise KeyError(f"Missing required configuration entry: {exc}") from exc

    data_file_path = Path(data_file_raw)
    if not data_file_path.is_absolute():
        data_file_path = (config_path.parent / data_file_path).resolve()

    return SetupSettings(
        data_file=data_file_path,
        default_salesman_id=default_salesman_id,
    )


def create_master_workbook(
    destination: Path,
    *,
    default_salesman_id: str,
    sheet_columns: Mapping[str, Sequence[str]] = SHEET_COLUMNS,
    default_salesman_template: Mapping[str, object] = DEFAULT_SALESMAN,
    overwrite: bool = False,
) -> Path:
    """Create the Lounge ERP master workbook at ``destination``.

    Parameters are overridable to facilitate testing. When ``overwrite`` is
    ``False`` (the default) this function raises ``FileExistsError`` if the
    target already exists.
    """

    destination = destination.expanduser().resolve()
    if destination.exists() and not overwrite:
        raise FileExistsError(
            f"Refusing to overwrite existing master workbook: {destination}"
        )

    destination.parent.mkdir(parents=True, exist_ok=True)

    workbook = openpyxl.Workbook()

    # Remove the default sheet openpyxl generates so we can create ours.
    if workbook.active and workbook.active.title == "Sheet":
        workbook.remove(workbook.active)

    bold_font = Font(bold=True)

    for sheet_name, columns in sheet_columns.items():
        worksheet = workbook.create_sheet(title=sheet_name)
        for column_index, column_name in enumerate(columns, start=1):
            cell = worksheet.cell(row=1, column=column_index)
            cell.value = column_name
            cell.font = bold_font

    salesmen_sheet = workbook["Salesmen"]
    default_salesman = dict(default_salesman_template)
    default_salesman["SalesmanID"] = default_salesman_id
    salesmen_sheet.append(
        [
            default_salesman["SalesmanID"],
            default_salesman["SalesmanName"],
            default_salesman["IsActive"],
        ]
    )

    workbook.save(destination)
    return destination


def run_from_config(config_path: Path, *, overwrite: bool = False) -> Path:
    """Convenience helper mirroring the original CLI behavior."""

    settings = load_settings(config_path)
    return create_master_workbook(
        settings.data_file,
        default_salesman_id=settings.default_salesman_id,
        overwrite=overwrite,
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments for the setup script."""

    parser = argparse.ArgumentParser(description="Initialize Lounge ERP data file")
    parser.add_argument(
        "--config",
        default=CONFIG_FILE,
        help="Path to configuration file (default: config.ini)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the target workbook if it already exists.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point for the CLI script."""

    args = parse_args(argv)
    config_path = Path(args.config).expanduser().resolve()

    print("--- Lounge ERP Setup Script ---")
    print(f"Using configuration: {config_path}")

    try:
        output_path = run_from_config(config_path, overwrite=args.force)
    except FileNotFoundError as exc:
        print(f"\n[ERROR] {exc}")
        return 1
    except KeyError as exc:
        print(f"\n[ERROR] {exc}")
        return 1
    except FileExistsError as exc:
        print(f"\n[ERROR] {exc}")
        print("Run with --force to overwrite the existing file if appropriate.")
        return 1
    except (PermissionError, OSError) as exc:
        print(f"\n[ERROR] Unable to write workbook: {exc}")
        return 1

    print(f"\n[SUCCESS] Created master workbook at '{output_path}'.")
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised via manual runs
    sys.exit(main())

