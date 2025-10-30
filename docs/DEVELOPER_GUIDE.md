# Developer Guide

This guide captures the internal architecture decisions, design principles,
and development workflow for the CAAD ERP project. It is intended for
developers who maintain or extend the codebase.

## Project Overview & Core Philosophy

### What Are We Building?

CAAD ERP is a simple, robust, and maintainable enterprise resource planning
(ERP) system tailored for a student lounge. The application manages inventory,
sales, and reporting, with a focus on clarity for non-technical operators.

### Who Is It For?

- **Maintainers** are developers who work on the codebase.
- **End users** are student managers who rely on Excel for day-to-day analysis.
- **High turnover** requires the system to be simple to understand and transfer.

### Guiding Principles

- **Robustness & Integrity:** The system must never diverge from the truth; an
audit trail is mandatory.
- **Ease of Analysis:** Outputs are optimized for Microsoft Excel users using
basic formulas and pivot tables.
- **Maintainability:** Code must remain clean, modular, and well-documented so
new developers can onboard quickly.

## Immutable Transaction Log

The project uses an append-only `TransactionLog` stored in Excel. Data is never
deleted or edited. Business logic adds new rows for every event, including
corrections.

- `VOID` transactions reverse mistakes while preserving the audit trail.
- The log ensures the system cannot be corrupted by accidental edits.

## Data Model

The "database" lives alongside a user-editable configuration file.

### Configuration (`config.ini`)

- `[System]`
  - `DataFile`: Path to the Excel data file.
  - `SchemaVersion`: Used for compatibility checks.
- `[Defaults]`
  - `DefaultSalesman`: Fallback `SalesmanID` for new sales.

### Excel Workbook

The workbook is the source of truth and should only be modified through the
application. It contains three sheets:

- **`Products`**: Catalog of active and inactive products.
  - `ProductID`, `ProductName`, `SellPrice`, `IsActive`.
- **`Salesmen`**: List of users who can record sales.
  - `SalesmanID`, `SalesmanName`, `IsActive`.
- **`TransactionLog`**: Immutable ledger of every event.
  - `TransactionID`, `Timestamp`, `TransactionType`, `ProductID`,
    `SalesmanID`, `PaymentType`, `QuantityChange`, `TotalRevenue`,
    `TotalCost`, `LinkedTransactionID`, `Notes`.

### Separate Revenue and Cost Columns

`TotalRevenue` tracks money received; `TotalCost` tracks money spent on
inventory. Using two columns keeps Excel analysis simple:

- Total sales: `SUM(TotalRevenue)`
- Cost of stock: `SUM(TotalCost)`
- Profit: `SUM(TotalRevenue) + SUM(TotalCost)`

### Stock levels

`SUM(TransactionLog.QuantityChange)` derives real-time stock levels.

## Core Business Logic

### Transaction Types

1. `OPEN_STOCK`: Created by the archive script to seed a new period.
2. `SALE`: Reduces stock and logs revenue.
3. `RESTOCK`: Increases stock and records inventory spend.
4. `WRITE_OFF`: Reduces stock without revenue (spoilage, theft, etc.).
5. `CREDIT_PAYMENT`: Captures the payment received for an earlier credit sale.
6. `VOID`: Perfect reversal of an incorrect transaction, linked to the original
   entry.

### Workflows

- **Discounts:** Handled by allowing any `TotalRevenue` during a sale. Even
if it will differ from the product's sell price.
- **Sell on Credit:** Logged as a `SALE` with `PaymentType="On Credit"` and
  zero revenue, paired with a subsequent `CREDIT_PAYMENT` that references the
  original transaction via `LinkedTransactionID`.
- **Error Correction:** Uses the "Reversal and Re-entry" method. A `VOID`
  transaction reverses the mistake, followed by a new entry with the correct
  data (optional for only deleting the mistake).
- **Archiving:** In the end of a period, a script recalculates inventory, seeds
`OPEN_STOCK` entries in a new workbook, prunes inactive products or salesmen with no
activity, and renames the old file.

## Application Architecture

The code follows a three-layer design:

1. **Data Access Layer (DAL) – `data_manager.py`:**
   Handles Excel I/O, implemented with `openpyxl`.
2. **Business Logic Layer (BLL) – `core_logic.py`:**
   Encapsulates rules and workflows, calling into the DAL without caring about
   presentation concerns.
3. **Presentation Layer (UI):**
   Not yet implemented. Future CLI or web interface will be a thin wrapper
   around the BLL.

## Development Workflow

- **Test-Driven Development:** New functionality should be driven by
  `pytest`-based tests under `tests/`.
- **Logging:** Python's `logging` module is configured in
  `src/caad_erp/__init__.py`; modules acquire a logger with
  `logging.getLogger(__name__)`.
- **Docstrings:** Use Google-style docstrings for clarity and compatibility with
automated documentation tools.
- **Archiving:** Period-end script recalculates inventory, seeds `OPEN_STOCK`
entries in a new workbook, prunes inactive products or salesmen with no
activity, and renames the old file.

## 7. Future Work

- Build the user-facing CLI or web UI.
- Document the archive workflow as part of operational runbooks.
- Expand automated tests to cover end-to-end scenarios once the UI exists.
