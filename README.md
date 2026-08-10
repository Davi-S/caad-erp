# CAAD ERP

![Excel dashboard.](/backend/images/2026-07-26-044619_hyprshot.png)

## Motivation

When managing inventory, sales, and tab debts, student lounges had to rely on
over-engineered POS systems or overly simple Excel sheets.

To solve this, I built CAAD ERP, a simple inventory and sales management system
specifically tailored for (my) student lounge operations.

The project pairs Python business logic with an Excel-based "source of truth" so
non-technical managers can trust the data and analyze it with the tools they
already know.

CAAD ERP favors readability, explicit processes, and a single-user deployment
model over complex infrastructure.

## Repository Structure

This is a monorepo containing both the backend and the frontend:

```text
caad-erp/
├── backend/         # Python (FastAPI + openpyxl) — API server & CLI
│   ├── src/caad_erp/
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/        # TypeScript (React + Vite + Mantine) — Web UI
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── docs/            # Project documentation
├── package.json     # Root scripts for development orchestration
└── README.md
```

## Core Features

- Append-only `TransactionLog` ledger that guarantees an auditable history.
- Excel workbook as the authoritative data storage.
- Inventory, sales, discounts, and credit payments handled in one workflow.
- React-based web UI for point-of-sale, product/salesman management, and stock
  control.

## Quick Start

### Prerequisites

- Python 3.12+ and [`uv`](https://docs.astral.sh/uv/)
- Node.js 18+ and `npm`

### Installation

```bash
# Clone the repository
git clone https://github.com/Davi-S/caad-erp.git
cd caad-erp

# Install root dev dependencies (concurrently)
npm install

# Install backend dependencies
cd backend
uv venv
source .venv/bin/activate
uv pip install -e ".[api,test]"
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Development

```bash
# Run both backend and frontend dev servers simultaneously
npm run dev

# Or run them individually
npm run dev:backend    # Starts FastAPI on http://0.0.0.0:8000
npm run dev:frontend   # Starts Vite on http://localhost:5173
```

### Other Commands

```bash
# Generate TypeScript types from the backend OpenAPI schema (offline)
npm run generate-api

# Run backend tests
npm run test:backend

# Run frontend lint
npm run test:frontend

# Run all tests
npm run test

# Build frontend for production
npm run build:frontend
```

## Backend

For detailed backend documentation, including CLI usage, API server setup, and
Excel workbook configuration, see the [Backend README](./backend/README.md).

## Frontend

For frontend-specific documentation, see the
[Frontend README](./frontend/README.md).

## Contributing

Community contributions are welcome. Please read `CONTRIBUTING.md` for the
preferred workflow and coding standards, and visit `docs/DEVELOPER_GUIDE.md` for
a deeper look at the system architecture.
