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
   workbook, the file that will hold products, salespeople, and the immutable
   transaction log.

Once configured, you can run the existing Python workflows (for example, the
data export utilities) while we build the user interface.

## Usage

The project ships with a thin command-line interface that delegates all work to
the business logic layer. Run it with:

```bash
python -m caad_erp.cli --help
```

By default the CLI looks for a `config.ini` in the current working directory.
Pass `--config /path/to/config.ini` if your configuration lives elsewhere.

### Write Commands

These commands mutate the workbook. Each subcommand provides `--help`
documentation with full argument details.

- `add-product <product_id> <product_name> <sell_price> [--inactive]`
- `add-salesman <salesman_id> <salesman_name> [--inactive]`
- `sale <product_id> <quantity> --salesman <salesman_id> --revenue <amount> --payment {Cash,Debit,Credit}`
- `restock <product_id> <quantity> --cost <amount>`
- `write-off <product_id> <quantity>`
- `pay-debt <linked_transaction_id> --amount <value>`
- `void <linked_transaction_id>`

Optional flags `--notes` and `--timestamp <ISO-8601>` are available on the
workflows that accept them.

### Read Commands

Reporting commands return calculated information without mutating the workbook:

- `stock` – current inventory levels.
- `profit` – aggregated revenue, cost, and profit metrics.
- `debts` – outstanding balances from credit sales.
- `log` – the transaction ledger.

Each command exits with `0` on success, `2` for business rule violations, `3`
when the configuration or data file cannot be found, and `1` for unexpected
errors.

## Contributing

Community contributions are welcome. Please read `CONTRIBUTING.md` for the
preferred workflow and coding standards, and visit
`docs/DEVELOPER_GUIDE.md` for a deeper look at the system architecture.
