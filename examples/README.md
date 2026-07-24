# Examples

This directory collects short, task-focused walkthroughs for the command-line interface. Each markdown file mirrors a real workflow you can execute with the `caad-erp-cli` entry point.

Use these recipes to learn the happy paths.

Copy commands into your terminal, and adapt them to your own configuration file and workbook location. Commands show the `--config /path/to/config.ini` flag explicitly; omit it when your configuration file lives in the current directory.

- [`01_basic_workflow.md`](./01_basic_workflow.md) - Register salesman/product, restock, check inventory, and record a cash sale.
- [`02_credit_workflow.md`](./02_credit_workflow.md) - Record a sale on credit and settle the debt.
- [`03_fix_mistake_workflow.md`](./03_fix_mistake_workflow.md) - Void a mistake and re-entry correct data.
- [`04_handling_spoilage_or_loss.md`](./04_handling_spoilage_or_loss.md) - Record write-offs for lost or spoiled stock.
- [`05_deactivate_records_workflow.md`](./05_deactivate_records_workflow.md) - Deactivate products and salesmen.
- [`06_bulk_sale_workflow.md`](./06_bulk_sale_workflow.md) - Record multi-item checkout transactions in a single atomic operation.

