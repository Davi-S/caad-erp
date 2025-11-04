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

1. **Data Access Layer (DAL)**
   Handles Excel I/O, implemented with `openpyxl`.
2. **Business Logic Layer (BLL)**
   Encapsulates rules and workflows, calling into the DAL without caring about
   presentation concerns.
3. **Presentation Layer (UI):**
   Implemented as a command-line interface in `src/caad_erp/cli`. The module keeps the UI
   intentionally thin: it parses arguments, converts them into the command
   objects defined by the BLL, and delegates execution. All user input is
   expressed through explicit long-form options. No business rules live in the CLI;
   everything flows through `core_logic`.

## Data Model

The "database" lives alongside a user-editable configuration file.

### Configuration

The user-editable configuration file is `config.ini`.
All runtime code should resolve configuration through `caad_erp.settings`.

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

`TotalRevenue` tracks money received; `TotalCost` tracks money spent. Using two columns keeps
Excel analysis simple:

- Total sales: `SUM(TotalRevenue)`
- Cost of stock: `SUM(TotalCost)`
- Profit: `SUM(TotalRevenue) + SUM(TotalCost)`

#### Stock Levels

`SUM(TransactionLog.QuantityChange)` derives real-time stock levels.

#### Sell Price

This is a convenience/esthetic value. It is a default or suggested price for the user interface.

The real sell price of the product is calculated by the `TotalRevenue` of a transaction log; this
is the actual amount of money collected for the sale.

#### Foreign Keys and Integrity

`TransactionLog.ProductID` match a `ProductID` in the `Products` sheet.

`TransactionLog.SalesmanID` points at `Salesmen.SalesmanID`.

#### Linked IDs

`TransactionLog.LinkedTransactionID` links reversal flows. `CREDIT_PAYMENT` rows link back to the originating credit sale, and `VOID` rows reference the transaction they negate.

#### Column Types

- Identifier columns (`ProductID`, `SalesmanID`, `TransactionID`, `LinkedTransactionID`) stay as text.
- `Timestamp` cells store ISO 8601 strings captured by the business layer.
- `QuantityChange` uses signed decimals
- Monetary columns are written as `Decimal` instances. Revenue entries stay positive, while costs are stored as negative numbers.
- Boolean columns (`Products.IsActive`, `Salesmen.IsActive`) store Excel booleans; the DAL coerces them back to `bool` on read.
- `PaymentType` stores one of the enum strings.
- `Notes` is free-form text that can remain blank.

## Immutable Transaction Log

The project uses an append-only `TransactionLog` stored in Excel. Data is never
deleted or edited. Business logic adds new rows for every event, including
corrections.

## Transaction Types

1. `OPEN_STOCK`: Created by the archive script to seed a new period.
2. `SALE`: Reduces stock and logs revenue.
3. `RESTOCK`: Increases stock and records inventory spend.
4. `WRITE_OFF`: Reduces stock without revenue (spoilage, theft, lost, etc.).
5. `CREDIT_PAYMENT`: Captures the payment received for an earlier credit sale.
6. `VOID`: Perfect reversal of an incorrect transaction, linked to the original
   entry.

## Workflows

### Discounts

Handled by allowing any `TotalRevenue` during a sale, even if it will differ
from the product's sell price.

### Sell on Credit

Logged as a `SALE` with `PaymentType="OnCredit"` and zero revenue, paired
with a subsequent `CREDIT_PAYMENT` that references the original
transaction via `LinkedTransactionID`. Credit payment entries capture the
actual settlement method (`PaymentType` on the command) and the value paid.

### Error Correction

Uses the "Reversal and Re-entry" method. A `VOID` transaction reverses the mistake,
followed by a new entry with the correct data.
The correct data is optional if only want to delete the mistake.

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
  the invalidation hook and can leave cached data stale.

This approach keeps memory usage low (only one workbook copy) while eliminating
the "N+1" read pattern during operations.

## Tests

### Test-Driven Development (TDD)

New functionality should be driven by `pytest`-based tests under `tests/`.

### Testing Files Structure

The test suite follows a pyramid structure to keep fast feedback at the unit level while retaining confidence in the full stack:

- **`tests/dal/`** – Integration coverage for the DAL that exercises real `openpyxl` reads and writes.
- **`tests/bll/`** – Unit coverage for the BLL with the entire data access layer (DAL) mocked.
- **`tests/cli/`** – Unit coverage for the CLI (Presentation Layer) with the business logic layer (BLL) mocked.
- **`tests/test_integration_layers.py`** – Cross-layer integration without mocks, verifying the complete workflow from CLI through the DAL.

### Test Structure Standards

To ensure our tests are readable and maintainable by new developers, all test functions must adhere to the following standards:

- **Arrange-Act-Assert (AAA) Pattern:** The body of every test function must be explicitly divided by comments to make its logic clear.
- **Given/When/Then (GWT) Docstrings:** All test functions must have a docstring in the GWT format to describe the intent of the test.

## Logging

Python's `logging` module is configured in `src/caad_erp/__init__.py`;
modules acquire a logger with `logging.getLogger(__name__)`.

## Key Design Rationale (Q&A)

This section clarifies the "why" behind a few key architectural decisions that were made to prioritize robustness and maintainability.

### Why is PaymentType a hard-coded Enum?

We intentionally chose to hard-code the PaymentType list in `constants.py` instead of creating a separate `PaymentTypes` sheet in Excel.

**Reason**: The value "On Credit" is a critical business rule, not just user data.

**Risk**: If it were in an Excel sheet, a user could accidentally delete or rename it, which would fatally break all logic for tracking and paying debts.

**Benefit**: By making it a hard-coded Enum, we make our "Sell on Credit" workflow 100% robust and safe from user error, at the minor cost of requiring a developer to add new payment types.

## "Deleting" something

Soft-delete is our method for "removing" an item (like a product or a salesman) without corrupting our database.

Instead of actually deleting the row from the Excel sheet, just flip the `TRUE`/`FALSE` **`IsActive` column** in your `Products` and `Salesmen` sheets.

**The Effect:** The `core_logic` (BLL) is built to ignore inactive items. That product will instantly vanish from the `stock` report and from the list of items you can `sale`. To the user, it's "deleted."

### Why This is Absolutely Needed

The main reason is to **protect our `TransactionLog`'s history**.

Our entire system is built on one rule: the `TransactionLog` is a perfect, immutable, historical record. It contains rows like this:

`T1001 | ... | P1001 | ... | -1 | 1.50 | ...`

This row says we sold "P1001". The system knows "P1001" is "Snickers" by looking it up in the `Products` sheet.

**The "Hard-Delete" Disaster (What we AVOID):**

Imagine we _actually_ deleted the "Snickers" row (`P1001`) from the `Products` sheet.

1. The `T1001` transaction log entry is now **orphaned**.
2. When you run a profit report for last month, the BLL will find `T1001`, look for `P1001`, and find... nothing.
3. The entire history of that product is now corrupted. We can't get its name, or any of its historical data. We have permanently broken our "source of truth."

**The "Soft-Delete" Solution (What we DO):**

When we set `P1001`'s `IsActive` to `FALSE`:

1. The item vanishes from the CLI, so you can't sell any more.
2. The `P1001 | Snickers` row **still exists** in the `Products` sheet.
3. When you run a profit report for last month, the BLL can still look up `P1001`, find "Snickers," and correctly calculate your historical profit.

### The only case we "Hard-Delete" (Archive Script)

This is the "pruning" or "garbage collection". It happens only when a manager runs the period-end archive script.

When you run that script, it builds a brand new, clean workbook by looking at the old one.

As it copies the Products sheet over, it checks if the product is not active and if the inventory is 0. If
this is true, then it will actually remove (hard-delete) the product row from the excel file.

It does a similar thing for sellers looking at the debt and any other necessary info

## Future Work

- **Feat: Implement Period-End Archive Script**
  - **Task:** Create the `archive.py` script as defined in the guide.
  - **Logic:** It will calculate final stock, prune inactive/empty products, and generate `OPEN_STOCK` entries in a new, clean workbook for the next period.
- **Feat: Implement Automatic ID Generation**
  - **Task:** make `--product-id` and `--salesman-id` arguments from the `add-product` and `add-salesman` commands optional. Or add a special value that will generate a hash
  - **Logic:** The BLL (`products.py`, `salesmen.py`) should generate a new, unique ID (e.g., using a short hash or UUID) for the new entry. This is much more user-friendly.
- **Feat (CLI): Make `--total-revenue` optional for `sale`**
  - **Logic:** If it's _omitted_, The BLL (`transactions.py`) will then fetch the `Product.SellPrice` and calculate the revenue automatically (`quantity * sell_price`). If the argument _is_ provided, it overrides this calculation (this is how we handle discounts).
- **Feat (CLI): Enhance UX with Rich Table Output**
  - **Task:** Install a library like `rich` or `tabulate` (in the `[project.optional-dependencies.cli]` group).
  - **Logic:** Update the "read-only" commands (`stock`, `profit`, `log`, `debts`) to print their results in clean, formatted console tables instead of simple text.
- **Test (CLI): Add End-to-End CLI Tests**
  - **Task:** Our `test_integration_layers.py` is great for the BLL/DAL. We need tests for the _full application_.
  - **Logic:** Use a tool like `pytester` (a pytest plugin) or the `subprocess` module to write tests that _actually run_ `lounge-cli sale...` and assert that the `stdout`/`stderr` and exit codes are correct.
- **Docs: Create a detailed `USAGE.md` file**
  - **Task:** Our `examples/` directory is good, but a formal, task-oriented `USAGE.md` file would be better.
  - **Logic:** This file would have sections like "How to handle a spoiled item," "How to pay a debt," or "How to fix a mistaken sale," and show the exact commands to run.
- **Feat (UI): Develop a Web-Based User Interface**
  - **Task:** Create a new "presentation layer" by building a simple web app (e.g., using Streamlit or Flask).
  - **Logic:** This web app will `import caad_erp.bll` and call the exact same functions (`record_sale`, `calculate_inventory`, etc.) that the CLI does. This will prove the power of our 3-layer architecture.
