import configparser
import openpyxl
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.utils.datetime import from_excel
import datetime
import os
from contextlib import contextmanager

# --- Configuration ---
# These will be monkeypatched by pytest to point to a temp dir.
# Use conditional assignment so a test fixture can set these on the module
# object before importlib.reload() is called (the fixture relies on that
# pattern to provide isolated test files).
if "CONFIG_FILE" not in globals():
    CONFIG_FILE = "config.ini"

if "DATA_FILE" not in globals():
    DATA_FILE = "lounge_master_data.xlsx"

if "DEFAULT_SALESMAN_ID" not in globals():
    DEFAULT_SALESMAN_ID = "S1"

# Load config at import time so tests/other modules can inspect it.
CONFIG = None
_config_parser = configparser.ConfigParser()
_config_parser.optionxform = str  # Preserve case for option names
try:
    # It's OK if the config file does not exist yet; leave CONFIG as an empty dict
    if os.path.exists(CONFIG_FILE):
        _config_parser.read(CONFIG_FILE)
        # Convert to a plain dict-like object for easier test assertions
        CONFIG = {section: dict(_config_parser[section]) for section in _config_parser.sections()}
    else:
        CONFIG = {}
except Exception:
    CONFIG = {}

# If the config specifies a DataFile, prefer that (allows tests to monkeypatch
# CONFIG_FILE and have the module pick up the test data file location on import)
if CONFIG and CONFIG.get("System", {}).get("DataFile"):
    DATA_FILE = CONFIG["System"]["DataFile"]


@contextmanager
def load_workbook(read_only=False):
    """
    Context manager to safely open and close the Excel workbook.
    """
    if not os.path.exists(DATA_FILE):
        raise FileNotFoundError(f"Data file '{DATA_FILE}' not found. Run 'setup_excel.py' first.")
    
    try:
        # data_only=True reads formula results, not the formula itself
        wb = openpyxl.load_workbook(DATA_FILE, read_only=read_only, data_only=True)
        yield wb
    except Exception as e:
        print(f"Error opening workbook: {e}")
        raise
    finally:
        if 'wb' in locals() and not read_only:
            try:
                wb.save(DATA_FILE)
            except Exception as e:
                print(f"Error saving workbook: {e}")
        if 'wb' in locals():
            wb.close()

def _read_sheet(ws: Worksheet) -> list[dict]:
    """Helper to read a sheet into a list of dictionaries."""
    data = []
    
    if ws.max_row == 0:
        return []
        
    headers = [cell.value for cell in ws[1]]
    if not any(headers):
        return []

    for row in ws.iter_rows(min_row=2):
        if all(cell.value is None for cell in row):
            continue
            
        row_data = {}
        for header, cell in zip(headers, row):
            val = cell.value
            row_data[header] = val
        data.append(row_data)
    return data

def get_all_data() -> dict[str, list[dict]]:
    """
    Reads all sheets from the workbook and returns them
    as a dictionary of lists.
    """
    all_data = {}
    with load_workbook(read_only=True) as wb:
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            all_data[sheet_name] = _read_sheet(ws)
    return all_data

def append_transaction(transaction_data: dict):
    """
    Appends a single transaction to the TransactionLog sheet.
    """
    try:
        with load_workbook() as wb:
            ws = wb["TransactionLog"]
            
            # Get headers from the sheet to ensure correct order
            headers = [cell.value for cell in ws[1]]
            
            # Build the row to append
            row_to_append = [transaction_data.get(header) for header in headers]
            ws.append(row_to_append)
        
    except Exception as e:
        print(f"Error appending transaction: {e}")
        raise

def update_row(sheet_name: str, identifier_col: str, identifier_value: any, new_data: dict):
    """
    Finds a row by an identifier and updates its values.
    """
    try:
        with load_workbook() as wb:
            ws = wb[sheet_name]
            headers = [cell.value for cell in ws[1]]
            
            try:
                id_col_idx = headers.index(identifier_col) + 1
            except ValueError:
                raise ValueError(f"Column '{identifier_col}' not found in sheet '{sheet_name}'.")

            row_found = False
            for row in ws.iter_rows(min_row=2):
                if row[id_col_idx - 1].value == identifier_value:
                    row_found = True
                    for col_idx, header in enumerate(headers, 1):
                        if header in new_data:
                            ws.cell(row=row[0].row, column=col_idx, value=new_data[header])
                    break
            
            if not row_found:
                raise ValueError(f"No row found in '{sheet_name}' with {identifier_col} = {identifier_value}")
                
    except Exception as e:
        print(f"Error updating row: {e}")
        raise

def add_new_row(sheet_name: str, data: dict):
    """
    Appends a single new row to a specified sheet (e.g., Products, Salesmen).
    """
    try:
        with load_workbook() as wb:
            ws = wb[sheet_name]
            headers = [cell.value for cell in ws[1]]
            
            row_to_append = [data.get(header) for header in headers]
            ws.append(row_to_append)
            
    except Exception as e:
        print(f"Error adding new row to '{sheet_name}': {e}")
        raise

def generate_transaction_id() -> str:
    """Generates a unique transaction ID based on the current timestamp."""
    return f"T{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}"

