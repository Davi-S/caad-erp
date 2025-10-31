# Developer Guide

This guide captures the internal architecture decisions, design principles,
and development workflow for the CAAD ERP project. It is intended for
developers who maintain or extend the codebase.

## Guiding Principles

- **Robustness and Integrity:** The system must never diverge from the truth; an
  audit trail is mandatory.
- **Ease of Analysis:** Outputs are optimized for Microsoft Excel users.
- **Maintainability:** Code must remain clean, modular, and well-documented so
  new developers can onboard quickly.

## Application Architecture

The code follows a three-layer design:

1. **Data Access Layer (DAL) – `data_manager.py`:**
   Handles Excel I/O, implemented with `openpyxl`.
2. **Business Logic Layer (BLL) – `core_logic.py`:**
   Encapsulates rules and workflows, calling into the DAL without caring about
   presentation concerns.
3. **Presentation Layer (UI):**
  Implemented as a command-line interface in `cli.py`. The module keeps the UI
  intentionally thin: it parses arguments, converts them into the command
  objects defined by the BLL, and delegates execution. No business rules live
  in the CLI; everything flows through `core_logic`.

## Data Model

The "database" lives alongside a user-editable configuration file.

### Configuration

The user-editable configuration file is `config.ini`.

- `[System]`
  - `DataFile`: Path to the Excel data file.
  - `SchemaVersion`: Used for compatibility checks.
- `[Defaults]`
  - `DefaultSalesman`: Fallback `SalesmanID` for new sales.

`Defaults.DefaultSalesman` must correspond to a row in `Salesmen`. `setup_excel.create_master_workbook` seeds this record so fallbacks stay consistent across environments.

### Excel Workbook

The workbook (an Excel file) is the source of truth and should only be modified through the
application. It contains three sheets:

- **`Products`**: Catalog of all products.
  - `ProductID`, `ProductName`, `SellPrice`, `IsActive`.
- **`Salesmen`**: List of users who can record sales.
  - `SalesmanID`, `SalesmanName`, `IsActive`.
- **`TransactionLog`**: Immutable ledger of every event.
  - `TransactionID`, `Timestamp`, `TransactionType`, `ProductID`,
    `SalesmanID`, `PaymentType`, `QuantityChange`, `TotalRevenue`,
    `TotalCost`, `LinkedTransactionID`, `Notes`.

#### Separate Revenue and Cost Columns

`TotalRevenue` tracks money received; `TotalCost` tracks money spent on
inventory. Using two columns keeps Excel analysis simple:

- Total sales: `SUM(TotalRevenue)`
- Cost of stock: `SUM(TotalCost)`
- Profit: `SUM(TotalRevenue) + SUM(TotalCost)`

#### Stock levels

`SUM(TransactionLog.QuantityChange)` derives real-time stock levels.

#### Foreign Keys and Integrity

- `TransactionLog.ProductID` must match a `ProductID` in the `Products` sheet whenever it is populated.
- `TransactionLog.SalesmanID` points at `Salesmen.SalesmanID` for user-driven activity. Inactive entries are rejected so ledger rows cannot reference retired users inadvertently.
- `TransactionLog.LinkedTransactionID` links reversal flows. `CREDIT_PAYMENT` rows link back to the originating credit sale, and `VOID` rows reference the transaction they negate.

#### Column Types and Formatting

- Identifier columns (`ProductID`, `SalesmanID`, `TransactionID`, `LinkedTransactionID`) stay as text. Transaction identifiers are generated via `core_logic.generate_transaction_id` (`TYYYYMMDDHHMMSSffffff`, `V...` for voids) so Excel preserves chronological ordering.
- `Timestamp` cells store ISO 8601 strings. When callers omit a timestamp, `_resolve_timestamp` fabricates a UTC value (`2025-10-30T14:03:12+00:00`); if a workflow supplies a naive `datetime`, the exact representation it provides is persisted.
- `QuantityChange` uses signed decimals
- Monetary columns are written as `Decimal` instances. Revenue entries stay positive, while `build_restock_transaction` and `build_void_reversal` ensure costs are stored as negative numbers so `SUM(TotalRevenue) + SUM(TotalCost)` yields profit without extra formulas.
- Boolean columns (`Products.IsActive`, `Salesmen.IsActive`) store Excel booleans; the DAL coerces them back to `bool` on read.
- `PaymentType` stores one of the enum strings.
- `Notes` is free-form text that can remain blank.

## Immutable Transaction Log

The project uses an append-only `TransactionLog` stored in Excel. Data is never
deleted or edited. Business logic adds new rows for every event, including
corrections.

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

#### Discounts

Handled by allowing any `TotalRevenue` during a sale, even if it will differ
from the product's sell price.

#### Sell on Credit

Logged as a `SALE` with `PaymentType="On Credit"` and zero revenue, paired
with a subsequent `CREDIT_PAYMENT` that references the original
transaction via `LinkedTransactionID`.

#### Error Correction

Uses the "Reversal and Re-entry" method. A `VOID` transaction reverses the mistake,
followed by a new entry with the correct data.
The correct data is optional if only want to delete the mistake.

#### Archiving

In the end of a period, a script recalculates inventory, seeds
`OPEN_STOCK` entries in a new workbook, prunes inactive products or salesmen with no
activity, and renames the old file.

## Runtime Caching in the BLL

The business logic layer keeps a single workbook open inside a
`RuntimeContext` instance. To avoid repeatedly walking the Excel sheets (an
`openpyxl` iterator can be expensive for large ledgers), the context maintains
an in-memory cache with these buckets:

- `products`: memoized list of every product (`all`), an `active` subset,
  and an id-index map (`by_id`).
- `salesmen`: the same structure for salesmen.
- `transactions`: immutable transaction rows plus an id-index.

Whenever one of the `record_*` functions appends a new row, the relevant
bucket is invalidated. The next read repopulates the cache from the workbook so
future lookups stay consistent without reloading the file.

Guidelines:

- Prefer accessing data through the public helpers (`list_products`,
  `get_transaction`) so the caches stay transparent to callers.
- If you add write flows that modify products or salesmen, call
  `_invalidate_cache(context, "products")` or `_invalidate_cache(context,
"salesmen")` right after the DAL operation.
- Avoid mutating the workbook directly from outside the BLL. Doing so bypasses
  the invalidation hook and can leave cached data stale. If you absolutely need
  to touch the workbook, invalidate the affected bucket beforehand.

This approach keeps memory usage low (only one workbook copy) while eliminating
the “N+1” read pattern during domain operations.

## Development Workflow

### Test-Driven Development

New functionality should be driven by `pytest`-based tests under `tests/`.

### Logging

Python's `logging` module is configured in `src/caad_erp/__init__.py`;
modules acquire a logger with `logging.getLogger(__name__)`.

Use the logger with wisdom and not exaggeration.

### Docstrings

Use Google-style docstrings for clarity and compatibility with automated
documentation tools.

## Future Work

- Enhance the CLI UX (for example, rich table output) while keeping it thin.
- Document the archive workflow as part of operational runbooks.
- Expand automated tests to cover end-to-end scenarios once the UI exists.
- Create a period-end script that recalculates inventory, seeds `OPEN_STOCK`
  entries in a new workbook, prunes inactive products or salesmen with no activity,
  and renames the old file.
