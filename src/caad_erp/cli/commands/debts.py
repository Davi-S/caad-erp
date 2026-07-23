import argparse
import typing as t

from caad_erp import bll

from .. import command_spec


def register_debts_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``debts`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "debts"
    help_text = "Display outstanding credit balances."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``debts`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the debts report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=_registrar,
        execute=_run_debts_report,
        is_mutating=False,
    )


def _display_debts_report(summary: t.Mapping[str, t.Any]) -> None:
    """Print outstanding credit balances with a running total.

    Args:
        summary (Mapping[str, object]): Result of
            :func:`bll.calculate_outstanding_debts`, containing ``balances``
            and ``total_outstanding`` entries.
    """

    balances_data = t.cast(
        t.Iterable[bll.OutstandingDebt], summary.get("balances") or []
    )
    balances = list(balances_data)  # ensure deterministic iteration
    total_outstanding = summary["total_outstanding"]

    if not balances:
        print("No outstanding credit balances.")
        print(f"Total outstanding: {total_outstanding / 100:.2f}")
        return

    print("Outstanding credit balances:")
    header = (
        f"{'Transaction ID':<18} {'Product':<12} {'Salesman':<12}"
        f" {'Quantity':>9} {'Expected':>10} {'Paid':>10} {'Balance':>10}"
    )
    print(header)
    print("-" * len(header))

    for entry in balances:
        print(
            f"{entry.transaction_id:<18} {entry.product_id:<12} {entry.salesman_id:<12} "
            f"{entry.quantity:>9} {entry.expected_amount / 100:>10.2f} "
            f"{entry.amount_paid / 100:>10.2f} {entry.balance / 100:>10.2f}"
        )

    print(f"\nTotal outstanding: {total_outstanding / 100:.2f}")


def _run_debts_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Summarize outstanding credit balances and print them.

    Args:
        context (bll.RuntimeContext): Runtime context providing access to the
            workbook and cached transactions.
        args (argparse.Namespace): Parsed CLI arguments; currently unused but
            retained for API consistency.

    Returns:
        int: ``0`` once the debts summary has been calculated and displayed.
    """

    summary = bll.calculate_outstanding_debts(context)
    _display_debts_report(summary)
    return 0
