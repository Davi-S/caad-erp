# CAAD ERP

> Excel-backed inventory, sales tracker, and web point-of-sale system for
> student lounges.

![Web UI Home Page](./frontend/images/caad-erp-frontend-home-page.png)
![Excel Dashboard Sheet](./backend/images/2026-07-26-044619_hyprshot.png)

## Motivation

When managing inventory, sales, and tab debts, student lounges had to rely on
over-engineered commercial POS systems or fragile spreadsheet setups.

To solve this, **CAAD ERP** provides a lightweight, highly responsive inventory
and sales management system specifically tailored for student lounge operations.

Built as a **100% end-to-end TypeScript monorepo**, CAAD ERP combines a Node.js
backend (SQLite + Drizzle ORM + tRPC) with a modern React web interface
(Mantine + Vite + React Query), delivering sub-millisecond execution speeds and
complete end-to-end type safety.

---

## Key Features

### Web Application (Frontend)

- **Point of Sale (POS):** Interactive cart and checkout flow, salesman
  selection screen, and payment confirmation (including Mercado Pago PIX QR
  codes).
- **Customer Display Mode:** Dedicated customer-facing display view for
  real-time checkout transparency.
- **Product Management:** Tools to add, edit, or toggle active status of items
  in the catalog.
- **Salesmen Management:** Register, update, and manage salespeople.
- **Stock Management:** Direct control over inventory levels with restock and
  write-off modal workflows.

### Backend and Core Ledger

- **Append-only Transaction Ledger:** SQLite-backed immutable transaction log
  providing a complete, auditable history of all sales, restocks, write-offs,
  credit payments, and reversals.
- **Zero-Config Portable Storage:** High-performance in-process SQLite database
  (`better-sqlite3`) requiring zero database server setup or maintenance.
- **End-to-End Type Safety:** tRPC presentation layer (`@trpc/server` /
  `@trpc/client`) providing instant, compile-time autocomplete and type checking
  from database schema to React components.
- **Pure Functional Layering:** Clear separation into Data Access Layer (DAL),
  Business Logic Layer (BLL with colocated Zod validation), and tRPC
  Presentation Layer.

---

## Quick Start and Installation

### Prerequisites

- **Node.js 18+** and `npm`

---

### Windows 1-Click Quick Start

If you are running on Windows, perform full environment setup and launch the
application with a single click:

1. Clone or download the repository.
2. Double-click `start.bat` in the root folder.

_(On the first run, `start.bat` checks for Node.js via `winget`, installs all
workspace dependencies via `npm install`, builds production frontend assets, and
launches the application in your default browser)._

---

### Manual / Linux Installation

#### 1. Clone and Install Workspace Dependencies

```bash
git clone https://github.com/Davi-S/caad-erp.git
cd caad-erp

# Install and link all npm workspace dependencies (backend and frontend)
npm install
```

---

## Development and Running the Application

### Development Mode (Concurrent Backend and Frontend)

To launch both the backend tRPC server (Port 8000) and frontend Vite dev server
(Port 5173) with hot-reloading:

```bash
npm run dev
```

### Production / Unified Single-Process Mode

To build and run the full application in production mode:

```bash
# Build production frontend static bundle
npm run build:frontend

# Start unified server
npm start
```

### Run Workspace Commands Individually

```bash
# Start backend TypeScript compiler in watch mode
npm run dev:backend

# Start frontend Vite server only
npm run dev:frontend

# Run full Vitest backend test suite (89 unit and integration tests)
npm test

# Lint and format all monorepo files (Oxlint and Oxfmt)
npm run fix
```

---

## Contributing and Documentation

Please check the following documentation resources:

- [Developer Guide](./docs/DEVELOPER_GUIDE.md)
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
