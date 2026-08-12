# Developer Guide

This guide captures the internal architecture decisions, design principles, and
development workflow for the CAAD ERP project. It is intended for developers who
maintain or extend the codebase.

## Guiding Principles

- **Robustness and Integrity:** The system must never diverge from the truth; an
  audit trail is mandatory.
- **Ease of Analysis:** Outputs are optimized for Microsoft Excel users.
- **Maintainability:** Code must remain clean, modular, and well-documented so
  new developers can onboard quickly.

## Monorepo Architecture & Development Tooling

CAAD ERP is organized as a monorepo containing both the backend service and the
frontend web application:

```text
caad-erp/
├── backend/            # Python (FastAPI + openpyxl + uv) - Core API & Ledger
│   ├── src/caad_erp/   # Business logic (BLL), Data access (DAL), and REST API
│   ├── tests/          # Pytest suite
│   ├── pyproject.toml  # Python package metadata & dependencies
│   └── setup_excel.py  # Bootstrap script for the Excel source-of-truth
├── frontend/           # TypeScript (React + Vite + Mantine + Tailwind) - Web UI
│   ├── src/            # Components, feature pages (POS, Stock, Salesmen), & state
│   └── package.json    # Frontend dependencies & scripts
├── docs/               # Architecture specs & developer guides
├── package.json        # Root scripts for monorepo development & orchestration
└── README.md
```

### Offline OpenAPI Type Generation

Generate TypeScript API contracts directly from Python source code without
needing a live backend server:

```bash
npm run generate-api
```

---

## Backend Usage (API Server)

### FastAPI Server & Single-Process App

Start the full application (FastAPI REST API + built React frontend assets):

```bash
# Build frontend static bundle first if needed
npm run build:frontend

# Run full application on http://0.0.0.0:8000
cd backend
uv run caad-erp
```

Start the API-only server (without static frontend mounting):

```bash
cd backend
uv run caad-erp-api
```

- **Full Application UI:** `http://localhost:8000/`
- **Health Check:** `http://localhost:8000/health`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

---

## Backend

### Application Architecture

The code follows a three-layer design:

1. **Data Access Layer (DAL)** Handles Excel I/O, implemented with `openpyxl`.
2. **Business Logic Layer (BLL)** Encapsulates rules and workflows, calling into
   the DAL without caring about presentation concerns.
3. **Presentation Layer (API):**: A FastAPI-based HTTP API server that
   translates HTTP requests into BLL calls, serving web-based UIs and static
   assets.

### Data Model

The "database" lives alongside a user-editable configuration file.

#### Configuration

The user-editable configuration file is `config.ini`. All runtime code should
resolve configuration through `caad_erp.settings`.

- `[System]`
  - `DataFile`: Path to the Excel data file.
  - `LoungeName`: Human-readable name for the lounge; used for reports and UI
    titles.
  - `SchemaVersion`: Used for compatibility checks.

#### Excel Workbook

The workbook (an Excel file) is the source of truth and should only be modified
through the application. It contains three sheets:

- **`Dashboard`**: An overview of the data by using several commands and
  formulas on excel
- **`Products`**: Catalog of all products.
  - `ProductID`, `ProductName`, `SellPrice`, `IsActive`.
- **`Salesmen`**: List of users who can record sales.
  - `SalesmanID`, `SalesmanName`, `IsActive`.
- **`TransactionLog`**: Immutable ledger of every event.
  - `TransactionID`, `Timestamp`, `TransactionType`, `ProductID`, `SalesmanID`,
    `PaymentType`, `QuantityChange`, `TotalRevenue`, `TotalCost`,
    `LinkedTransactionID`, `Notes`.

##### Separate Revenue and Cost Columns

`TotalRevenue` tracks money received; `TotalCost` tracks money spent. Using two
columns keeps Excel analysis simple:

- Total sales: `SUM(TotalRevenue)`
- Cost of stock: `SUM(TotalCost)`
- Profit: `SUM(TotalRevenue) + SUM(TotalCost)`

##### Stock Levels

`SUM(TransactionLog.QuantityChange)` derives real-time stock levels.

##### Sell Price

This is a convenience/esthetic value. It is a default or suggested price for the
user interface.

The real sell price of the product is calculated by the `TotalRevenue` of a
transaction log; this is the actual amount of money collected for the sale.

##### Foreign Keys and Integrity

`TransactionLog.ProductID` match a `ProductID` in the `Products` sheet.

`TransactionLog.SalesmanID` points at `Salesmen.SalesmanID`.

##### Linked IDs

`TransactionLog.LinkedTransactionID` links reversal flows. `CREDIT_PAYMENT` rows
link back to the originating credit sale, and `VOID` rows reference the
transaction they negate.

##### Column Types

- Identifier columns (`ProductID`, `SalesmanID`, `TransactionID`,
  `LinkedTransactionID`) stay as text.
- `Timestamp` cells store ISO 8601 strings captured by the business layer.
- `QuantityChange` uses integers
- Monetary columns are written as integers and represents cents. Revenue entries
  stay positive, while costs are stored as negative numbers.
- Boolean columns (`Products.IsActive`, `Salesmen.IsActive`) store Excel
  booleans; the DAL coerces them back to `bool` on read.
- `PaymentType` stores one of the enum strings.
- `Notes` is free-form text that can remain blank.

### Immutable Transaction Log

The project uses an append-only `TransactionLog` stored in Excel. Data is never
deleted or edited. Business logic adds new rows for every event, including
corrections.

### Transaction Types

1. `OPEN_STOCK`: Created by the archive script to seed a new period.
2. `SALE`: Reduces stock and logs revenue.
3. `RESTOCK`: Increases stock and records inventory spend.
4. `WRITE_OFF`: Reduces stock without revenue (spoilage, theft, lost, etc.).
5. `CREDIT_PAYMENT`: Captures the payment received for an earlier credit sale.
6. `VOID`: Perfect reversal of an incorrect transaction, linked to the original
   entry.

### Workflows

#### Stock Availability Enforcement

Sales (`record_sale`, `record_bulk_sale`) and write-offs (`record_write_off`)
strictly enforce stock availability. The business logic layer calculates dynamic
inventory balances (`calculate_inventory`) from the transaction log and rejects
any sale or write-off request where requested quantity exceeds available stock.
Bulk sales validate aggregate cart item quantities per product atomically.

#### Discounts

Handled by allowing any `TotalRevenue` during a sale, even if it will differ
from the product's sell price.

#### Sell on Credit & Flexible Credit Payments

Logged as a `SALE` with `PaymentType="OnCredit"` and zero revenue, paired with
subsequent `CREDIT_PAYMENT` transactions referencing the original sale via
`LinkedTransactionID`.

- **Multiple Partial Payments:** Customers can make multiple partial payments
  over time.
- **Overpayments & Interest:** Payment amounts are not capped by the remaining
  debt balance, allowing salesmen to record interest, late fees, or extra
  payments.
- **Traceability & Reports:** Outstanding debt reports sum all non-voided
  `CREDIT_PAYMENT` entries for a sale, excluding fully settled or overpaid debts
  from outstanding balances.

#### Error Correction & Voiding Credit Payments

Uses the "Reversal and Re-entry" method. A `VOID` transaction reverses the
mistake by flipping quantity/revenue/cost deltas, followed by a new entry if
correcting data.

- **Voiding Credit Payments:** `CREDIT_PAYMENT` entries can be voided just like
  sales or restocks. Voiding a credit payment automatically restores the unpaid
  debt balance on the linked credit sale.
- **Immutability of Voids:** Only `VOID` transactions themselves cannot be
  voided to prevent infinite reversal loops.

#### Bulk Sales (Atomic Multi-Item Checkouts)

Captures real-world shopping cart checkouts where a customer purchases multiple
items in a single transaction.

The workflow is orchestrated in `bll.record_bulk_sale` using a **2-phase,
all-or-nothing wrapper** pattern:

1. **Validation Phase**: Validates every `SaleCommand` in the input list
   (verifying active status and existence for products and salesmen, positive
   quantities, and valid revenue). If _any_ item fails validation, an exception
   is raised immediately and **zero** transactions are recorded.
2. **Execution Phase**: Appends all sale transactions to the `TransactionLog`
   sheet in sequence, invalidates the transaction cache once at the end, and
   returns the created rows.

_Developer Rationale_:

- **BLL Centered**: All-or-nothing atomicity rules and validation loops live
  strictly in the BLL (`bll.record_bulk_sale`), never in CLI or API handlers.
- **DTO Transformation**: API endpoint `POST /transactions/bulk-sale` accepts
  `BulkSaleRequest` DTOs and maps them to `list[SaleCommand]`. CLI command
  `bulk-sale` parses `-s`, `-p`, `-n` header options and repeated
  `-i PRODUCT_ID QTY TOTAL_REVENUE` flags into `list[SaleCommand]`.
- **Single Persistence Pass**: In mutating API requests or REPL sessions,
  workbook changes are written to disk once at the end of the batch operation,
  eliminating redundant disk I/O.

### Runtime Caching in the BLL

The business logic layer keeps a single workbook open inside a `RuntimeContext`
instance. To avoid repeatedly walking the Excel sheets (an `openpyxl` iterator
can be expensive for large ledgers), the context maintains an in-memory cache
with these buckets:

- `products`: memoized list of every product (`all`), id-index map (`by_id`).
- `salesmen`: the same structure for salesmen.
- `transactions`: immutable transaction rows plus an id-index.

Whenever one of the `record_*` functions appends a new row, the relevant bucket
is invalidated. The next read repopulates the cache from the workbook so future
lookups stay consistent without reloading the file.

Guidelines:

- Prefer accessing data through the public helpers (`list_products`,
  `get_transaction`) so the caches stay transparent to callers.
- If you add write flows that modify products or salesmen, call
  `invalidate_cache(context, "products")` or
  `invalidate_cache(context, "salesmen")` right after the DAL operation.
- Avoid mutating the workbook directly from outside the BLL. Doing so bypasses
  the invalidation hook and can leave cached data stale.

This approach keeps memory usage low (only one workbook copy) while eliminating
the "N+1" read pattern during operations.

### Backend Tests

#### Test-Driven Development (TDD)

New functionality should be driven by `pytest`-based tests under
`backend/tests/`.

#### Testing Files Structure

The test suite follows a pyramid structure to keep fast feedback at the unit
level while retaining confidence in the full stack:

- **`backend/tests/dal/`** - Integration coverage for the DAL that exercises
  real `openpyxl` reads and writes.
- **`backend/tests/bll/`** - Unit coverage for the BLL with the entire data
  access layer (DAL) not mocked.
- **`backend/tests/api/`** - Unit coverage for the API (Presentation Layer)
  using FastAPI's TestClient.
- **`backend/tests/integration/`** - Cross-layer integration without mocks.

#### Test Structure Standards

To ensure our tests are readable and maintainable by new developers, all test
functions must adhere to the following standards:

- **Arrange-Act-Assert (AAA) Pattern:** The body of every test function must be
  explicitly divided by comments to make its logic clear.
- **Given/When/Then (GWT) Docstrings:** All test functions must have a docstring
  in the GWT format to describe the intent of the test.

### Logging

Python's `logging` module is configured in `src/caad_erp/__init__.py`; modules
acquire a logger with `logging.getLogger(__name__)`.

### Key Design Rationale (Q&A)

This section clarifies the "why" behind a few key architectural decisions that
were made to prioritize robustness and maintainability.

#### Why is PaymentType a hard-coded Enum?

We intentionally chose to hard-code the PaymentType list in `constants.py`
instead of creating a separate `PaymentTypes` sheet in Excel.

**Reason**: The value "On Credit" is a critical business rule, not just user
data.

**Risk**: If it were in an Excel sheet, a user could accidentally delete or
rename it, which would fatally break all logic for tracking and paying debts.

**Benefit**: By making it a hard-coded Enum, we make our "Sell on Credit"
workflow 100% robust and safe from user error, at the minor cost of requiring a
developer to add new payment types.

#### "Deleting" something

Soft-delete is our method for "removing" an item (like a product or a salesman)
without corrupting our database.

Instead of actually deleting the row from the Excel sheet, just flip the
`TRUE`/`FALSE` **`IsActive` column** in your `Products` and `Salesmen` sheets.

**The Effect:** The BLL is built to ignore inactive items. That product will
instantly vanish from the `stock` report and from the list of items you can
`sale`. To the user, it's "deleted."

##### Why This is Absolutely Needed

The main reason is to **protect our `TransactionLog`'s history**.

Our entire system is built on one rule: the `TransactionLog` is a perfect,
immutable, historical record. It contains rows like this:

`T1001 | ... | P1001 | ... | -1 | 1.50 | ...`

This row says we sold "P1001". The system knows "P1001" is "Snickers" by looking
it up in the `Products` sheet.

**The "Hard-Delete" Disaster (What we AVOID):**

Imagine we _actually_ deleted the "Snickers" row (`P1001`) from the `Products`
sheet.

1. The `T1001` transaction log entry is now **orphaned**.
2. When you run a profit report for last month, the BLL will find `T1001`, look
   for `P1001`, and find... nothing.
3. The entire history of that product is now corrupted. We can't get its name,
   or any of its historical data. We have permanently broken our "source of
   truth."

**The "Soft-Delete" Solution (What we DO):**

When we set `P1001`'s `IsActive` to `FALSE`:

1. The item vanishes from active catalog views, so it cannot be sold any more.
2. The `P1001 | Snickers` row **still exists** in the `Products` sheet.
3. When you run a profit report for last month, the BLL can still look up
   `P1001`, find "Snickers," and correctly calculate your historical profit.

##### The only case we "Hard-Delete" (Archive Script)

This is the "pruning" or "garbage collection". It happens only when a manager
runs the period-end archive script.

When you run that script, it builds a brand new, clean workbook by looking at
the old one.

As it copies the Products sheet over, it checks if the product is not active and
if the inventory is 0. If this is true, then it will actually remove
(hard-delete) the product row from the excel file.

It does a similar thing for sellers looking at the debt and any other necessary
info

#### Why don't list-products/list-salesmen filter by active status server-side?

`Products` and `Salesmen` are expected to stay small (dozens to low hundreds of
rows), so pushing "include inactive" filtering to the server added complexity
without a real performance benefit. `list_products`/`list_salesmen` (BLL) and
the `GET /products` / `GET /salesmen` endpoints always return the full dataset,
so clients can filter or sort however they like.

### Future Work

- Clean the tests to remove unused parameters, imports, variables, etc...
- Currently, the layers are exposing all their functions. We need to expose only
  the public methods. Private methods (even if not explicited by the "underscore
  notation" should not be exposed.
- **Feat: Implement Period-End Archive Script**
  - **Task:** Create the `archive.py` script as defined in the guide.
  - **Logic:** It will calculate final stock, prune inactive/empty products, and
    generate `OPEN_STOCK` entries in a new, clean workbook for the next period.
- **Feat: Implement Automatic ID Generation**
  - **Task:** Make `product_id` and `salesman_id` optional in creation
    routes/commands, generating a hash/UUID automatically in the BLL.
- Add options to pass id to read-endpoints to read specific information only
- Add more columns in the product sheet (supplier, etc...)

