import argparse
import typing as t

from caad_erp import bll

from .. import command_spec


def register_log_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``log`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "log"
    help_text = "Display the transaction log."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``log`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the log report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_log_report)


def display_transaction_log(transactions: t.Iterable[object]) -> None:
    """Print transaction log entries using a concise tabular layout.

    Args:
        transactions (Iterable[object]): Sequence of transaction rows returned
            by :func:`bll.list_transactions`.
    """

    transactions = list(transactions)
    if not transactions:
        print("Transaction log is empty.")
        return

    print("Transaction log:")
    header = (
        f"{'ID':<18} {'Timestamp':<19} {'Type':<12} {'Product':<12}"
        f" {'Salesman':<12} {'Qty':>8} {'Revenue':>10} {'Cost':>10} Notes"
    )
    print(header)
    print("-" * len(header))

    for transaction in transactions:
        product = getattr(transaction, "product_id", None) or "-"
        salesman = getattr(transaction, "salesman_id", None) or "-"
        timestamp_raw = getattr(transaction, "timestamp_iso", "") or ""
        timestamp = timestamp_raw[:19]
        notes = getattr(transaction, "notes", None) or ""
        if len(notes) > 40:
            notes = notes[:37] + "..."
        print(
            f"{getattr(transaction, 'transaction_id', ''):<18} {timestamp:<19} "
            f"{getattr(transaction, 'transaction_type', ''):<12} {product:<12} {salesman:<12} "
            f"{getattr(transaction, 'quantity_change', ''):>8} {getattr(transaction, 'total_revenue', ''):>10} "
            f"{getattr(transaction, 'total_cost', ''):>10} {notes}"
        )


def run_log_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Fetch the immutable transaction log and display it to the console.

    Args:
        context (bll.RuntimeContext): Runtime context used to access the
            workbook and cached data.
        args (argparse.Namespace): Parsed CLI arguments; maintained for
            symmetry with other commands and currently unused.

    Returns:
        int: ``0`` after listing the transactions.
    """

    transactions = bll.list_transactions(context)
    display_transaction_log(transactions)
    return 0
