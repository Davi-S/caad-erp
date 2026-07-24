from pathlib import Path
import io
import sys

import pytest

from caad_erp import bll, constants
from caad_erp.cli import parser as cli_parser


def test_cli_main_executes_mutating_command_and_persists_changes(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN integration config and workbook paths with valid add-product CLI arguments
    WHEN cli.parser.main is invoked for a mutating command
    THEN command succeeds with exit code zero and persisted workbook reflects mutation
    """
    result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-product",
            "-i",
            "CLI-P001",
            "-n",
            "CLI Product",
            "-p",
            "1150",
        ]
    )

    reloaded = bll.load_context(integration_config_path)
    saved = bll.get_product(reloaded, "CLI-P001")

    assert result == 0
    assert saved.product_name == "CLI Product"


def test_cli_main_executes_bulk_sale_and_persists_changes(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN setup products and salesman
    WHEN cli.parser.main is invoked with bulk-sale arguments
    THEN returns exit code zero and all sale transactions are persisted to workbook
    """
    cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-salesman",
            "-i",
            "S001",
            "-n",
            "Test Salesman",
        ]
    )
    cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-product",
            "-i",
            "BULK-P1",
            "-n",
            "Bulk Product 1",
            "-p",
            "1000",
        ]
    )
    cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-product",
            "-i",
            "BULK-P2",
            "-n",
            "Bulk Product 2",
            "-p",
            "1500",
        ]
    )

    result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "bulk-sale",
            "-s",
            "S001",
            "-p",
            "Cash",
            "-n",
            "Integration bulk sale",
            "-i",
            "BULK-P1",
            "2",
            "2000",
            "-i",
            "BULK-P2",
            "1",
            "1500",
        ]
    )

    assert result == 0
    reloaded = bll.load_context(integration_config_path)
    txs = bll.list_transactions(reloaded)
    bulk_txs = [tx for tx in txs if tx.notes == "Integration bulk sale"]
    assert len(bulk_txs) == 2


def test_cli_main_executes_reporting_command_without_persist_side_effect(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN integration context and reporting command arguments such as stock or profit
    WHEN cli.parser.main is invoked
    THEN command returns zero and no unnecessary persistence writes are triggered
    """
    before = (
        Path(integration_config_path)
        .parent.joinpath("master_workbook.xlsx")
        .stat()
        .st_mtime_ns
    )
    result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "stock",
        ]
    )
    after = (
        Path(integration_config_path)
        .parent.joinpath("master_workbook.xlsx")
        .stat()
        .st_mtime_ns
    )

    assert result == 0
    assert after == before


def test_cli_main_returns_business_rule_exit_code_for_domain_violation(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN CLI arguments that trigger a BusinessRuleViolation in business layer
    WHEN cli.parser.main is invoked
    THEN process-style exit code two is returned
    """
    add_product_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-product",
            "-i",
            "CLI-P002",
            "-n",
            "Inactive Product",
            "-p",
            "500",
            "-x",
        ]
    )
    add_salesman_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-salesman",
            "-i",
            "CLI-S001",
            "-n",
            "CLI Salesman",
        ]
    )
    sale_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "sale",
            "-i",
            "CLI-P002",
            "-q",
            "1",
            "-s",
            "CLI-S001",
            "-r",
            "500",
            "-p",
            constants.PaymentType.CASH.value,
        ]
    )

    assert add_product_result == 0
    assert add_salesman_result == 0
    assert sale_result == 2


def test_cli_main_returns_missing_file_exit_code_for_missing_workbook(
    integration_workspace: Path,
) -> None:
    """
    GIVEN CLI configuration pointing to a missing workbook file
    WHEN cli.parser.main is invoked
    THEN process-style exit code three is returned
    """
    missing_config = integration_workspace / "missing-workbook-config.ini"
    missing_config.write_text(
        "\n".join(
            [
                "[System]",
                "DataFile = does-not-exist.xlsx",
                "LoungeName = Integration Lounge",
                "SchemaVersion = 1.0.0",
                "",
                "[Defaults]",
                "DefaultSalesman = GRR00000000",
                "",
            ]
        ),
        encoding="utf-8",
    )

    result = cli_parser.main(
        [
            "--config",
            str(missing_config),
            "stock",
        ]
    )

    assert result == 3


def test_cli_main_returns_generic_error_code_for_runtime_error() -> None:
    """
    GIVEN a non-domain runtime exception passed to CLI error mapping
    WHEN handle_cli_error is called
    THEN generic process-style exit code one is returned
    """
    result = cli_parser.handle_cli_error(RuntimeError("unexpected failure"))

    assert result == 1


@pytest.mark.parametrize(
    "command_args",
    [
        ["add-salesman", "-i", "CLI-S002", "-n", "Second Salesman"],
        ["list-salesmen"],
        ["stock"],
    ],
)
def test_cli_main_supports_multiple_registered_commands_end_to_end(
    command_args,
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN CLI argument vectors for different registered commands
    WHEN cli.parser.main is invoked for each vector
    THEN command routing registration and execution wiring succeed end-to-end
    """
    result = cli_parser.main(["--config", str(integration_config_path), *command_args])
    assert result == 0


def test_cli_repl_session_persists_successful_mutating_commands(
    initialized_context: bll.RuntimeContext,
    integration_config_path: Path,
) -> None:
    """
    GIVEN scripted REPL input containing at least one successful mutating command and exit token
    WHEN cli.repl.run_repl is executed in integration environment
    THEN command effects are persisted and visible after context reload
    """
    original_stdin = sys.stdin
    sys.stdin = io.StringIO("add-product -i REPL-P001 -n ReplProduct -p 700\nexit\n")

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)
    try:
        result = cli_parser.repl.run_repl(initialized_context, parser, table)
    finally:
        sys.stdin = original_stdin

    reloaded = bll.load_context(integration_config_path)
    product = bll.get_product(reloaded, "REPL-P001")
    assert result == 0
    assert product.product_name == "ReplProduct"


def test_cli_repl_session_recovers_from_command_errors_and_continues(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN scripted REPL input containing failing command followed by valid command and exit token
    WHEN cli.repl.run_repl is executed
    THEN REPL reports error continues processing and final valid command still applies
    """
    original_stdin = sys.stdin
    sys.stdin = io.StringIO(
        "sale -i UNKNOWN -q 1 -s GRR00000000 -r 100 -p Cash\n"
        "add-product -i REPL-P002 -n AfterError -p 800\n"
        "exit\n"
    )

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)
    try:
        result = cli_parser.repl.run_repl(initialized_context, parser, table)
    finally:
        sys.stdin = original_stdin

    assert result == 0
    assert (
        bll.get_product(initialized_context, "REPL-P002").product_name == "AfterError"
    )


def test_cli_help_and_parse_errors_do_not_crash_repl_loop(
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN scripted REPL input containing invalid syntax help usage and eventual exit token
    WHEN cli.repl.run_repl is executed
    THEN parse errors are absorbed and loop remains interactive until explicit termination
    """
    original_stdin = sys.stdin
    sys.stdin = io.StringIO("--help\nadd-product --unknown-option\nexit\n")

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)
    try:
        result = cli_parser.repl.run_repl(initialized_context, parser, table)
    finally:
        sys.stdin = original_stdin
    assert result == 0


def test_cli_one_shot_credit_lifecycle_persists_and_matches_reports(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
) -> None:
    """
    GIVEN one-shot CLI commands that create product salesman credit sale and partial debt payment
    WHEN read commands run and context is reloaded from disk
    THEN each command exits cleanly and persisted reports reflect expected outstanding debt
    """
    add_product_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-product",
            "--product-id",
            "CLI-P003",
            "--product-name",
            "Credit Product",
            "--sell-price",
            "800",
        ]
    )
    add_salesman_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "add-salesman",
            "--salesman-id",
            "CLI-S003",
            "--salesman-name",
            "Credit Seller",
        ]
    )
    sale_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "sale",
            "--product-id",
            "CLI-P003",
            "--quantity",
            "3",
            "--salesman-id",
            "CLI-S003",
            "--total-revenue",
            "0",
            "--payment-type",
            constants.PaymentType.ON_CREDIT.value,
        ]
    )

    working_context = bll.load_context(integration_config_path)
    sale_transaction = next(
        row
        for row in bll.list_transactions(working_context)
        if row.transaction_type == constants.TransactionType.SALE.value
        and row.product_id == "CLI-P003"
        and row.salesman_id == "CLI-S003"
    )

    pay_debt_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "pay-debt",
            "--linked-transaction-id",
            sale_transaction.transaction_id,
            "--total-revenue",
            "1000",
            "--salesman-id",
            "CLI-S003",
            "--payment-type",
            constants.PaymentType.CASH.value,
        ]
    )
    debts_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "debts",
        ]
    )
    log_result = cli_parser.main(
        [
            "--config",
            str(integration_config_path),
            "log",
        ]
    )

    reloaded = bll.load_context(integration_config_path)
    debts_report = bll.calculate_outstanding_debts(reloaded)
    transactions = bll.list_transactions(reloaded)

    assert add_product_result == 0
    assert add_salesman_result == 0
    assert sale_result == 0
    assert pay_debt_result == 0
    assert debts_result == 0
    assert log_result == 0
    assert len(transactions) == 2
    assert debts_report["total_outstanding"] == 1400
    assert debts_report["balances"][0].transaction_id == sale_transaction.transaction_id
