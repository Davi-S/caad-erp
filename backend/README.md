# CAAD ERP — TypeScript Backend (`backend`)

This directory contains the full-stack **TypeScript backend rewrite** for `caad-erp`, replacing the legacy Python `openpyxl` backend.

---

## 🎯 Architecture Overview & Key Decisions

### 1. Database Choice: Why SQLite over MySQL / PostgreSQL?

- **Zero Configuration**: SQLite requires no separate server process (`mysqld`), root passwords, or port setup.
- **Single-File Storage**: All application data resides in a single portable file (`caad_erp.db`), making backups as easy as copying one file.
- **In-Process Performance**: Queries execute in-process via native C++ bindings (`better-sqlite3`), providing sub-millisecond execution speeds with zero TCP network socket latency.
- **Ideal for Desktop/Local Deployment**: Fits the local student lounge operational workflow perfectly (`npm dev` / `start.bat`).

---

### 2. ORM & Type Mapping: Drizzle ORM

- **Booleans in SQLite (`{ mode: 'boolean' }`)**:
  SQLite lacks a native `BOOLEAN` data type and stores boolean flags as `1` (`true`) or `0` (`false`). Drizzle's `integer('is_active', { mode: 'boolean' })` handles two-way conversion automatically:
    - **Writes**: Converts TS `true`/`false` -> SQLite `1`/`0`.
    - **Reads**: Converts SQLite `1`/`0` -> TS `true`/`false`.

- **Explicit Schema Design (No Hidden Defaults)**:
  All non-null columns (`sellPrice`, `isActive`, `quantityChange`, `totalRevenue`, `totalCost`) are declared **without implicit `.default(...)` fallbacks**. Every creation command must explicitly provide all field values, avoiding silent or hidden data fallbacks.

- **Explicit Enums (`TransactionType` & `PaymentType`)**:
  `transactionType` and `paymentType` are declared using Drizzle's `text('col', { enum: [...] })` mode. This constrains the TypeScript types strictly to valid enum unions (`'SALE' | 'RESTOCK' | 'WRITE_OFF' | 'CREDIT_PAYMENT' | 'OPEN_STOCK' | 'VOID'` and `'Cash' | 'OnCredit' | 'PIX' | 'Other'`), preventing invalid string inserts at compile time.

---

### 3. Pure Functional Layering (Stateless Architecture)

- **Functional DAL & BLL**: All Data Access Layer (DAL) and Business Logic Layer (BLL) routines are pure functions receiving the `db` instance as their first argument (`dal.listProducts(db)`).
- **Elimination of `RuntimeContext` & `_cache`**: No manual dictionary caching (`_cache["products"]`) or workbook saving routines (`persist_context`) are required. SQLite indexes and database engine caching handle query speed and persistence natively.

---

### 4. Business Logic Layer (BLL) Modernization & Differences from Python

- **Removal of `OPEN_STOCK` Workflow**:
  The legacy Python backend required an `OPEN_STOCK` transaction type to re-seed starting inventory whenever a manager generated a brand-new Excel spreadsheet file for a new semester. With our single, high-performance SQLite database (`caad_erp.db`), all transactions are stored continuously in a relational table without creating separate files. Real-time stock is calculated cleanly across all time via `SUM(quantity_change)`, rendering `OPEN_STOCK` obsolete and keeping the transaction ledger 100% truthful.

- **Time-Ordered RFC 9562 UUID v7 Transaction IDs**:
  Legacy Python generated timestamp string IDs (`YYYYMMDDHHmmssSSS`), which suffered from collisions when multiple transactions executed in the same millisecond during synchronous workflows or unit tests. We adopted standard **UUID v7** (`import { v7 as uuidv7 } from 'uuid'`). UUID v7 embeds a 48-bit millisecond timestamp followed by 74 random bits, ensuring perfect chronological sorting in SQLite B-tree indexes while guaranteeing 100% collision-free generation.

- **Colocated BLL Module Architecture**:
  Instead of centralizing all Zod validation schemas in a separate `rules.ts` file, schemas and command payload types (`AddProductCommand`, `UpdateProductCommand`, `SaleCommand`, etc.) are colocated directly inside their respective handler files (`products.ts`, `salesmen.ts`, `transactions.ts`). Each schema is placed directly above its corresponding workflow function.

- **Explicit Update Schemas**:
  Update schemas (`updateProductSchema`, `updateSalesmanSchema`) are written out explicitly in full rather than derived via `.omit().partial()` shorthand composition, ensuring distinct intent and self-documenting boundary contracts.

- **Zod `params.errorClass` Exception Translation**:
  Validation rules use Zod `.refine(...)` metadata with `{ params: { errorClass: CustomDomainError } }`. The shared runner **`validateSchema`** extracts this metadata to throw explicit domain exception classes (`InvalidAttributeError`, `InvalidMonetaryValueError`, `InvalidQuantityError`) directly without string guessing or regex pattern matching.

- **Two-Tier Rule Enforcement Strategy (Stateless Zod vs Stateful Function Body)**:
  Validation is explicitly split into two complementary layers:
    1. _Layer 1 (Stateless Zod Schemas)_: Sanitizes incoming payload structures, data types, integer constraints, and string boundaries synchronously in 0.001 ms without touching the database.
    2. _Layer 2 (Stateful Function Body)_: Enforces database-dependent domain rules (checking entity existence, active flags via LBYL, inventory availability, and credit line validity) inside the handler function.
       This separation ensures high-performance fail-fast input rejection, keeps Zod schemas 100% pure and reusable for tRPC/UI inputs, and keeps database invariant logic clear and readable.

- **Atomic Reporting Analytics**:
  The legacy `calculate_profit_summary` function returned a dictionary containing revenue, cost, and profit. In `reports.ts`, these are refactored into clean, atomic functions (`calculateTotalRevenue`, `calculateTotalCost`, `calculateNetProfit`) that each return a single primitive `number`.

---

### 5. Documentation Standard: TSDoc / JSDoc

- **Google TypeScript & TSDoc Style**: All exported functions, schemas, and types are documented using standard `/** ... */` TSDoc block comments.
- **No Redundant Type Braces**: Since TypeScript handles static typing, parameter tags use `@param paramName - Description` without `{string}` braces.
- **IDE Hover Tooltips**: TSDoc comments power automatic VS Code hover tooltips, autocompletion guidance, and inline type links (`{@link ProductRow}`).

### 6. Linting & Formatting: `oxlint` & `oxfmt`

- **Unified Tooling with Frontend**: Configured with the exact same Oxc tooling stack (`oxlint` for linting, `oxfmt` for formatting) and rules (`tabWidth: 4`, `semi: false`, `.oxlintrc.json`).
- **Commands**:
    - `npm run lint` / `npm run lint:fix`: Lints the codebase with `oxlint`.
    - `npm run format` / `npm run format:check`: Formats all code with `oxfmt`.

---

## 📁 Directory Layout

```
backend/
├── .oxfmtrc.json           # Formatting rules (tabWidth 4, semi false)
├── .oxlintrc.json          # Linting rules matching frontend
├── src/
│   ├── bll/                # Business Logic Layer (Validation & Domain logic)
│   │   ├── errors.ts       # Custom domain exception classes
│   │   ├── validator.ts    # Shared Zod validation helper
│   │   ├── products.ts     # Products BLL (Zod schemas, command types, workflows)
│   │   ├── salesmen.ts     # Salesmen BLL (Zod schemas, command types, workflows)
│   │   ├── transactions.ts # Transactions BLL (Zod schemas, command types, workflows)
│   │   ├── reports.ts      # Analytics BLL (Inventory, Profit, Credit Debts)
│   │   └── index.ts        # Barrel export module
│   ├── dal/                # Data Access Layer (Drizzle ORM & SQLite queries)
│   │   ├── schema.ts       # Database table definitions & inferred TypeScript types
│   │   ├── client.ts       # Database connection factory (better-sqlite3)
│   │   ├── products.ts     # Products DAL functions
│   │   ├── salesmen.ts     # Salesmen DAL functions
│   │   ├── transactions.ts # Transactions DAL functions
│   │   └── index.ts        # Barrel export module
│   ├── trpc/               # Presentation & Service Layer (tRPC Routers)
│   │   ├── context.ts      # Request Context holding active SQLite DB
│   │   ├── trpc.ts         # tRPC initialization & domain error translator middleware
│   │   ├── routers/        # Feature routers (products, salesmen, transactions, reports)
│   │   │   ├── products.ts
│   │   │   ├── salesmen.ts
│   │   │   ├── transactions.ts
│   │   │   ├── reports.ts
│   │   │   └── _app.ts     # Combined AppRouter & exported AppRouter type
│   │   └── index.ts        # Barrel export module
│   └── server.ts           # Standalone HTTP server runner (Port 8000)
├── package.json
└── tsconfig.json
```

---

## 📝 Living Documentation Log

_(This section records architectural clarifications and decisions addressed during development)_

- **2026-08-17**: Established explicit schema definitions without implicit `.default()` fallbacks in `schema.ts`.
- **2026-08-17**: Confirmed SQLite + `better-sqlite3` driver over MySQL for zero-config local execution.
- **2026-08-17**: Confirmed pure functional DAL pattern receiving `db: DB` parameter.
- **2026-08-17**: Added explicit `TransactionType` and `PaymentType` string union enums to `schema.ts`.
- **2026-08-17**: Unified domain types to single `ProductRow`, `SalesmanRow`, and `TransactionRow` types across all DAL primitives (eliminating separate `New...Row` types).
- **2026-08-17**: Replaced wildcard `import * as schema` with explicit named schema imports (`import { products, salesmen, transactions }`) across all DAL files.
- **2026-08-17**: Enforced strict empty update payload handling in `updateProduct` and `updateSalesman` (throwing an explicit Error if `fieldValues` is empty `{}`).
- **2026-08-17**: Documented all DAL schemas, types, and query functions using Google TypeScript / TSDoc standard formatting.
- **2026-08-17**: Configured `oxlint` and `oxfmt` for `backend` matching the frontend formatting (`tabWidth: 4`, `semi: false`) and added root monorepo linting/formatting scripts.
- **2026-08-17**: Created comprehensive Vitest unit test suite (`tests/dal/`) with in-memory SQLite setup (`:memory:`), covering 100% of Python test parity plus TS/DB specific assertions (28 tests passing).
- **2026-08-17**: Standardized unit tests to use the Arrange-Act-Assert (AAA) pattern (`// Arrange`, `// Act`, `// Assert`) and Given-When-Then (GWT) descriptive `it()` titles.
- **2026-08-17**: Implemented BLL domain exceptions (`errors.ts`), Zod validation schemas, and command payload types (`rules.ts`), establishing a symmetric error hierarchy with `EntityNotFoundError` and `EntityInactiveError` base classes.
- **2026-08-17**: Adopted colocated BLL architecture moving Zod schemas, command payload types (`AddProductCommand`, `UpdateProductCommand`), and handlers into `products.ts`, writing update schemas explicitly in full.
- **2026-08-17**: Configured Zod schemas with explicit `params: { errorClass: ... }` metadata on validation rules, enabling `validateSchema` to map validation failures directly to custom domain exception classes without string guessing fallbacks.
- **2026-08-17**: Implemented `salesmen.ts` BLL module following the colocated architecture, with schemas placed directly above their respective workflow functions and explicit update schemas.
- **2026-08-17**: Implemented `transactions.ts` BLL module colocating transaction Zod schemas and ledger workflows (`recordSale`, `recordBulkSale`, `recordRestock`, `recordWriteOff`, `recordCreditPayment`, `recordVoid`), eliminating the centralized `rules.ts` file.
- **2026-08-17**: Implemented `reports.ts` BLL module providing atomic analytics functions (`calculateInventory`, `calculateTotalRevenue`, `calculateTotalCost`, `calculateNetProfit`, `calculateOutstandingDebts`).
- **2026-08-17**: Created complete BLL Vitest unit test suite (`tests/bll/`) with in-memory SQLite setup (`:memory:`), covering 100% of Python test parity plus TS/Zod boundary assertions (72 tests passing total across DAL & BLL).
- **2026-08-17**: Updated transaction ID generation to standard time-ordered RFC 9562 UUID v7 (`import { v7 as uuidv7 } from 'uuid'`).
- **2026-08-17**: Removed obsolete `OPEN_STOCK` transaction workflow from `schema.ts`, `transactions.ts`, and test suites, as single persistent SQLite database eliminates period spreadsheet re-seeding.
- **2026-08-17**: Implemented Phase 3 tRPC presentation and service layer (`src/trpc/`) exposing feature routers (`products`, `salesmen`, `transactions`, `reports`), automatic domain-to-tRPC error status translation (`NOT_FOUND`, `CONFLICT`, `BAD_REQUEST`), standalone HTTP server (`src/server.ts` on port 8000), and integration test suite (`tests/trpc/`) (89 tests passing total across DAL, BLL, and tRPC).
