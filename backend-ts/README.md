# CAAD ERP — TypeScript Backend (`backend-ts`)

This directory contains the full-stack **TypeScript backend rewrite** for `caad-erp`, replacing the legacy Python `openpyxl` backend.

---

## 🎯 Architecture Overview & Key Decisions

### 1. Database Choice: Why SQLite over MySQL / PostgreSQL?
* **Zero Configuration**: SQLite requires no separate server process (`mysqld`), root passwords, or port setup.
* **Single-File Storage**: All application data resides in a single portable file (`caad_erp.db`), making backups as easy as copying one file.
* **In-Process Performance**: Queries execute in-process via native C++ bindings (`better-sqlite3`), providing sub-millisecond execution speeds with zero TCP network socket latency.
* **Ideal for Desktop/Local Deployment**: Fits the local student lounge operational workflow perfectly (`npm dev` / `start.bat`).

---

### 2. ORM & Type Mapping: Drizzle ORM
* **Booleans in SQLite (`{ mode: 'boolean' }`)**:
  SQLite lacks a native `BOOLEAN` data type and stores boolean flags as `1` (`true`) or `0` (`false`). Drizzle's `integer('is_active', { mode: 'boolean' })` handles two-way conversion automatically:
  - **Writes**: Converts TS `true`/`false` -> SQLite `1`/`0`.
  - **Reads**: Converts SQLite `1`/`0` -> TS `true`/`false`.

* **Explicit Schema Design (No Hidden Defaults)**:
  All non-null columns (`sellPrice`, `isActive`, `quantityChange`, `totalRevenue`, `totalCost`) are declared **without implicit `.default(...)` fallbacks**. Every creation command must explicitly provide all field values, avoiding silent or hidden data fallbacks.

* **Explicit Enums (`TransactionType` & `PaymentType`)**:
  `transactionType` and `paymentType` are declared using Drizzle's `text('col', { enum: [...] })` mode. This constrains the TypeScript types strictly to valid enum unions (`'SALE' | 'RESTOCK' | 'WRITE_OFF' | 'CREDIT_PAYMENT' | 'OPEN_STOCK' | 'VOID'` and `'Cash' | 'OnCredit' | 'PIX' | 'Other'`), preventing invalid string inserts at compile time.

---

### 3. Pure Functional Layering (Stateless Architecture)
* **Functional DAL & BLL**: All Data Access Layer (DAL) and Business Logic Layer (BLL) routines are pure functions receiving the `db` instance as their first argument (`dal.listProducts(db)`).
* **Elimination of `RuntimeContext` & `_cache`**: No manual dictionary caching (`_cache["products"]`) or workbook saving routines (`persist_context`) are required. SQLite indexes and database engine caching handle query speed and persistence natively.

---

### 4. End-to-End Type Safety: tRPC Integration
* **Zero Manual URLs / `fetch` Boilerplate**: Instead of REST endpoints (`/api/products`), the backend exports `type AppRouter`.
* **Instant Refactoring Safety**: Changes to backend types are instantly reflected in VS Code on the React frontend, catching typos at compile-time rather than runtime.

---

## 📁 Directory Layout

```
backend-ts/
├── src/
│   └── dal/                # Data Access Layer (Drizzle ORM & SQLite queries)
│       ├── schema.ts       # Database table definitions & inferred TypeScript types
│       ├── client.ts       # Database connection factory (better-sqlite3)
│       ├── products.ts     # Products DAL functions
│       ├── salesmen.ts     # Salesmen DAL functions
│       ├── transactions.ts # Transactions DAL functions
│       └── index.ts        # Barrel export module
├── package.json
└── tsconfig.json
```

---

## 📝 Living Documentation Log
*(This section records architectural clarifications and decisions addressed during development)*

- **2026-08-17**: Established explicit schema definitions without implicit `.default()` fallbacks in `schema.ts`.
- **2026-08-17**: Confirmed SQLite + `better-sqlite3` driver over MySQL for zero-config local execution.
- **2026-08-17**: Confirmed pure functional DAL pattern receiving `db: DB` parameter.
- **2026-08-17**: Added explicit `TransactionType` and `PaymentType` string union enums to `schema.ts`.
- **2026-08-17**: Unified domain types to single `ProductRow`, `SalesmanRow`, and `TransactionRow` types across all DAL primitives (eliminating separate `New...Row` types).
