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

## Installation

1. Install Python 3.13 or newer from [python.org](https://www.python.org/) if it
   is not already available on your computer.
2. Download the latest CAAD ERP source code (clone the repository or grab a
   release archive) and open a terminal inside the project folder.
3. Create a dedicated environment so the dependencies stay isolated:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

4. Install the application and its dependencies:

   ```bash
   pip install -e .
   ```

5. Update `config.ini` so the `DataFile` entry points at your locked Excel
   workbook—the file that will hold products, salespeople, and the immutable
   transaction log.

Once configured, you can run the existing Python workflows (for example, the
data export utilities) while we build the user interface.

## Usage

The CLI/Web UI is under development. See "Development & Testing" for now.

## Contributing

Community contributions are welcome. Please read `CONTRIBUTING.md` for the
preferred workflow and coding standards, and visit
`docs/DEVELOPER_GUIDE.md` for a deeper look at the system architecture.

For deeper architectural context, implementation notes, and long-term plans,
read `docs/DEVELOPER_GUIDE.md`.
