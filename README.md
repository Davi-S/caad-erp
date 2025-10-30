# CAAD ERP

[![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue)](https://www.python.org/)
[![Tests Passing](https://img.shields.io/badge/tests-pytest-success)](./tests)

## Motivation

CAAD ERP is a lightweight inventory and sales system designed for the daily
operations of a student lounge. The project pairs Python business logic with an
Excel-based "source of truth" so non-technical managers can trust the data and
analyze it with the tools they already know.

The high turnover of student staff demands a workflow that is transparent,
auditable, and simple to hand off. CAAD ERP embraces those constraints by
favoring readability, explicit processes, and a single-user deployment model
over complex infrastructure.

## Core Features

- Append-only `TransactionLog` ledger that guarantees an auditable history.
- Excel workbook as the authoritative data store plus export-friendly reports.
- Inventory, sales, discounts, and credit payments handled in one workflow.
- Archiving script (planned) to roll periods forward with clean opening stock.
- Test-driven Python code organized into clear data, logic, and UI layers.

## Installation

```bash
git clone https://github.com/your-org/caad_erp.git
cd caad_erp
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

After installation, review `config.ini` and set `DataFile` to point at your
protected Excel workbook. The repository includes automated tests and sample
fixtures under `tests/` to validate your environment.

## Usage

The CLI/Web UI is under development. See "Development & Testing" for now.

## Contributing

Community contributions are welcome. A dedicated `CONTRIBUTING.md` will land in
the future; until then, please open an issue before large changes and review
the developer-focused documentation in `docs/DEVELOPER_GUIDE.md`.

### Architectural Vision

The codebase follows a three-layer architecture:

- **Data Access Layer (DAL)** in `data_manager.py` manages Excel I/O only.
- **Business Logic Layer (BLL)** in `core_logic.py` enforces domain rules and
  exposes high-level workflows.
- **Presentation Layer** (CLI or web UI) is forthcoming and will remain a thin
  wrapper around the BLL.

We lean on test-driven development to pin down behavior before adding new
surface area. Each layer stays focused on its single responsibility so future
maintainers can extend the system without surprises.

### Development & Testing

1. Install development dependencies with `pip install -e .` in an activated
   virtual environment.
2. Configure `config.ini` to point at a local Excel workbook for integration
   work.
3. Run the automated tests with:

   ```bash
   pytest
   ```

4. Add or update tests alongside any code changes. The suite under `tests/`
   serves as the first "user interface" until the CLI is available.

For deeper architectural context, implementation notes, and long-term plans,
read `docs/DEVELOPER_GUIDE.md`.
