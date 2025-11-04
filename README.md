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
- Excel workbook as the authoritative data storage.
- Inventory, sales, discounts, and credit payments handled in one workflow.

## Installation

1. Install Python 3.13 or newer from [python.org](https://www.python.org/) if it
   is not already available on your computer.
2. Download the latest CAAD ERP source code (clone the repository or grab a
   release archive) and open a terminal inside the project folder.
3. Install [`uv`](https://docs.astral.sh/uv/) if it is not already available:

   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

4. Create a dedicated environment and activate it so the dependencies stay isolated:

   ```bash
   uv venv
   source .venv/bin/activate
   ```

5. Install the application and its dependencies with `uv`:

   ```bash
   uv pip install -e .
   ```

6. Update `config.ini` so the `DataFile` entry points at your locked Excel
   workbook, the file that will hold products, salespeople, and the immutable
   transaction log.

## Usage

The project ships with a thin command-line interface. Invoke it with the
console script or directly through Python:

```bash
# Console script entry point installed via pip/uv
caad-erp-cli --help

# Module execution for development checkouts
python -m caad_erp.cli --help
```

By default the CLI looks for a `config.ini` in the current working directory.
Pass `--config /path/to/config.ini` if your configuration lives elsewhere. For
copy-paste walkthroughs, head over to the [examples/](./examples/)
directory.

### Write Commands

These commands mutate the workbook. Each subcommand provides `--help`
documentation with full argument details.

- `add-product --product-id <product_id> --product-name <product_name> --sell-price <sell_price> [--inactive]`
- `add-salesman --salesman-id <salesman_id> --salesman-name <salesman_name> [--inactive]`
- `deactivate-product --product-id <product_id>`
- `deactivate-salesman --salesman-id <salesman_id>`
- `sale --product-id <product_id> --quantity <quantity> --salesman-id <salesman_id> --total-revenue <amount> --payment-type {Cash,OnCredit,PIX,Other} [--notes <text>]`
- `restock --product-id <product_id> --quantity <quantity> --total-cost <amount> --salesman-id <salesman_id> [--notes <text>]`
- `write-off --product-id <product_id> --quantity <quantity> --salesman-id <salesman_id> [--notes <text>]`
- `pay-debt --linked-transaction-id <transaction_id> --total-revenue <value> --salesman-id <salesman_id> --payment-type {Cash,PIX,Other} [--notes <text>]`
- `void --linked-transaction-id <transaction_id> [--notes <text>]`

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
