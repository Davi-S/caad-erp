from pathlib import Path

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
            "11.50",
        ]
    )

    reloaded = bll.load_context(integration_config_path)
    saved = bll.get_product(reloaded, "CLI-P001")

    assert result == 0
    assert saved.product_name == "CLI Product"


def test_cli_main_executes_reporting_command_without_persist_side_effect(
    integration_config_path: Path,
    initialized_context: bll.RuntimeContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    GIVEN integration context and reporting command arguments such as stock or profit
    WHEN cli.parser.main is invoked
    THEN command returns zero and no unnecessary persistence writes are triggered
    """
    def _fail_if_persist_called(_: bll.RuntimeContext) -> None:
        raise AssertionError(
            "persist_context should not be called for reporting commands")

    monkeypatch.setattr(cli_parser.bll, "persist_context",
                        _fail_if_persist_called)
    result = cli_parser.main([
        "--config",
        str(integration_config_path),
        "stock",
    ])

    assert result == 0


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
            "5.00",
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
            "5.00",
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

    result = cli_parser.main([
        "--config",
        str(missing_config),
        "stock",
    ])

    assert result == 3


def test_cli_main_returns_generic_error_code_for_unexpected_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    GIVEN a command execution path raising an unexpected runtime exception
    WHEN cli.parser.main is invoked
    THEN process-style exit code one is returned
    """
    def _boom(_: Path | None = None) -> bll.RuntimeContext:
        raise RuntimeError("unexpected failure")

    monkeypatch.setattr(cli_parser.bll, "load_context", _boom)
    result = cli_parser.main(["stock"])

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
    result = cli_parser.main(
        ["--config", str(integration_config_path), *command_args])
    assert result == 0


def test_cli_repl_session_persists_successful_mutating_commands(
    initialized_context: bll.RuntimeContext,
    integration_config_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    GIVEN scripted REPL input containing at least one successful mutating command and exit token
    WHEN cli.repl.run_repl is executed in integration environment
    THEN command effects are persisted and visible after context reload
    """
    commands = iter(
        [
            "add-product -i REPL-P001 -n ReplProduct -p 7.00",
            "exit",
        ]
    )
    monkeypatch.setattr("builtins.input", lambda _: next(commands))

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)

    result = cli_parser.repl.run_repl(initialized_context, parser, table)

    reloaded = bll.load_context(integration_config_path)
    product = bll.get_product(reloaded, "REPL-P001")
    assert result == 0
    assert product.product_name == "ReplProduct"


def test_cli_repl_session_recovers_from_command_errors_and_continues(
    initialized_context: bll.RuntimeContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    GIVEN scripted REPL input containing failing command followed by valid command and exit token
    WHEN cli.repl.run_repl is executed
    THEN REPL reports error continues processing and final valid command still applies
    """
    commands = iter(
        [
            "sale -i UNKNOWN -q 1 -s GRR00000000 -r 1.00 -p Cash",
            "add-product -i REPL-P002 -n AfterError -p 8.00",
            "exit",
        ]
    )
    monkeypatch.setattr("builtins.input", lambda _: next(commands))

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)

    result = cli_parser.repl.run_repl(initialized_context, parser, table)

    assert result == 0
    assert bll.get_product(initialized_context,
                           "REPL-P002").product_name == "AfterError"


def test_cli_help_and_parse_errors_do_not_crash_repl_loop(
    initialized_context: bll.RuntimeContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    GIVEN scripted REPL input containing invalid syntax help usage and eventual exit token
    WHEN cli.repl.run_repl is executed
    THEN parse errors are absorbed and loop remains interactive until explicit termination
    """
    commands = iter(
        [
            "--help",
            "add-product --unknown-option",
            "exit",
        ]
    )
    monkeypatch.setattr("builtins.input", lambda _: next(commands))

    parser = cli_parser.build_parser()
    table = cli_parser.configure_subcommands(parser)

    result = cli_parser.repl.run_repl(initialized_context, parser, table)
    assert result == 0
