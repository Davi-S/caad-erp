"""Unit tests describing the CLI presentation layer contract."""

from __future__ import annotations

import argparse
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Mapping

import pytest

from caad_erp import cli, constants, core_logic


WRITE_COMMANDS = {
    "add-product",
    "add-salesman",
    "sale",
    "restock",
    "write-off",
    "pay-debt",
    "void",
}

READ_COMMANDS = {
    "stock",
    "profit",
    "debts",
    "log",
}

# ---------------------------------------------------------------------------
# Parser construction
# ---------------------------------------------------------------------------


def test_build_parser_returns_argument_parser():
    """build_parser should produce a configured ArgumentParser instance."""

    parser = cli.build_parser()
    assert isinstance(parser, argparse.ArgumentParser)


def test_build_parser_sets_program_metadata():
    """build_parser should set user-facing program metadata."""

    parser = cli.build_parser()
    assert parser.prog == "lounge-cli"
    assert "Lounge" in (parser.description or "")


def test_configure_subcommands_registers_write_commands(cli_parser):
    """configure_subcommands should wire all mutating sub-commands."""

    command_table = cli.configure_subcommands(cli_parser)
    for name in WRITE_COMMANDS:
        assert name in command_table
    choices = _registered_choices(cli_parser)
    for name in WRITE_COMMANDS:
        assert name in choices


def test_configure_subcommands_registers_read_commands(cli_parser):
    """configure_subcommands should wire all reporting sub-commands."""

    command_table = cli.configure_subcommands(cli_parser)
    for name in READ_COMMANDS:
        assert name in command_table
    choices = _registered_choices(cli_parser)
    for name in READ_COMMANDS:
        assert name in choices


def test_register_write_commands_returns_command_specs(subparsers_action):
    """register_write_commands should return a mapping of CommandSpec objects."""

    specs = cli.register_write_commands(subparsers_action)
    assert set(specs) == WRITE_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_write_commands_configures_parsers(subparsers_action):
    """register_write_commands should attach each parser with help text."""

    cli.register_write_commands(subparsers_action)
    for name in WRITE_COMMANDS:
        assert name in subparsers_action.choices


def test_register_read_commands_returns_command_specs(subparsers_action):
    """register_read_commands should return a mapping of CommandSpec objects."""

    specs = cli.register_read_commands(subparsers_action)
    assert set(specs) == READ_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_read_commands_configures_parsers(subparsers_action):
    """register_read_commands should attach each parser with help text."""

    cli.register_read_commands(subparsers_action)
    for name in READ_COMMANDS:
        assert name in subparsers_action.choices


# ---------------------------------------------------------------------------
# Write command registrations
# ---------------------------------------------------------------------------


def test_register_add_product_command_returns_spec(subparsers_action):
    """register_add_product_command should return a CommandSpec."""

    spec = cli.register_add_product_command(subparsers_action)
    assert spec.name == "add-product"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_product_command_configures_arguments():
    """register_add_product_command should define the necessary arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_product_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "add-product",
            "--product-id",
            "P1001",
            "--product-name",
            "Chocolate Bar",
            "--sell-price",
            "3.50",
            "--inactive",
        ]
    )
    assert namespace.product_id == "P1001"
    assert namespace.product_name == "Chocolate Bar"
    assert namespace.sell_price == "3.50"
    assert namespace.inactive is True


def test_register_add_salesman_command_returns_spec(subparsers_action):
    """register_add_salesman_command should return a CommandSpec."""

    spec = cli.register_add_salesman_command(subparsers_action)
    assert spec.name == "add-salesman"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_salesman_command_configures_arguments():
    """register_add_salesman_command should define the necessary arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_salesman_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "add-salesman",
            "--salesman-id",
            "S100",
            "--salesman-name",
            "Alex",
            "--inactive",
        ]
    )
    assert namespace.salesman_id == "S100"
    assert namespace.salesman_name == "Alex"
    assert namespace.inactive is True


def test_register_sale_command_returns_spec(subparsers_action):
    """register_sale_command should return a CommandSpec."""

    spec = cli.register_sale_command(subparsers_action)
    assert spec.name == "sale"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_sale_command_configures_arguments():
    """register_sale_command should define sale-specific arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_sale_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "sale",
            "--product-id",
            "P1001",
            "--quantity",
            "2",
            "--salesman-id",
            "S-DEFAULT",
            "--total-revenue",
            "6.00",
            "--payment-type",
            constants.PaymentType.CASH.value,
            "--notes",
            "First sale",
        ]
    )
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "2"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.total_revenue == "6.00"
    assert namespace.payment_type == constants.PaymentType.CASH.value
    assert namespace.notes == "First sale"


def test_register_restock_command_returns_spec(subparsers_action):
    """register_restock_command should return a CommandSpec."""

    spec = cli.register_restock_command(subparsers_action)
    assert spec.name == "restock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_restock_command_configures_arguments():
    """register_restock_command should define restock-specific arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_restock_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "restock",
            "--product-id",
            "P1001",
            "--quantity",
            "5",
            "--total-cost",
            "10.00",
            "--salesman-id",
            "S-DEFAULT",
            "--notes",
            "Bulk restock",
        ]
    )
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "5"
    assert namespace.total_cost == "10.00"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Bulk restock"


def test_register_write_off_command_returns_spec(subparsers_action):
    """register_write_off_command should return a CommandSpec."""

    spec = cli.register_write_off_command(subparsers_action)
    assert spec.name == "write-off"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_write_off_command_configures_arguments():
    """register_write_off_command should define write-off arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_write_off_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "write-off",
            "--product-id",
            "P1001",
            "--quantity",
            "1",
            "--salesman-id",
            "S-DEFAULT",
            "--notes",
            "Damaged",
        ]
    )
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "1"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Damaged"


def test_register_pay_debt_command_returns_spec(subparsers_action):
    """register_pay_debt_command should return a CommandSpec."""

    spec = cli.register_pay_debt_command(subparsers_action)
    assert spec.name == "pay-debt"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_pay_debt_command_configures_arguments():
    """register_pay_debt_command should define debt-payment arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_pay_debt_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "pay-debt",
            "--linked-transaction-id",
            "T20250101010101000000",
            "--total-revenue",
            "6.00",
            "--salesman-id",
            "S-DEFAULT",
            "--notes",
            "Credit payment",
        ]
    )
    assert namespace.linked_transaction_id == "T20250101010101000000"
    assert namespace.total_revenue == "6.00"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Credit payment"


def test_register_void_command_returns_spec(subparsers_action):
    """register_void_command should return a CommandSpec."""

    spec = cli.register_void_command(subparsers_action)
    assert spec.name == "void"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_void_command_configures_arguments():
    """register_void_command should define void-specific arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_void_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "void",
            "--linked-transaction-id",
            "T20250101010101000000",
            "--notes",
            "Mistake",
        ]
    )
    assert namespace.linked_transaction_id == "T20250101010101000000"
    assert namespace.notes == "Mistake"


# ---------------------------------------------------------------------------
# Read command registrations
# ---------------------------------------------------------------------------


def test_register_stock_command_returns_spec(subparsers_action):
    """register_stock_command should return a CommandSpec."""

    spec = cli.register_stock_command(subparsers_action)
    assert spec.name == "stock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_stock_command_configures_arguments():
    """register_stock_command should define stock-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_stock_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(["stock"])
    assert namespace.command == "stock"


def test_register_profit_command_returns_spec(subparsers_action):
    """register_profit_command should return a CommandSpec."""

    spec = cli.register_profit_command(subparsers_action)
    assert spec.name == "profit"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_profit_command_configures_arguments():
    """register_profit_command should define profit-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_profit_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(["profit"])
    assert namespace.command == "profit"


def test_register_debts_command_returns_spec(subparsers_action):
    """register_debts_command should return a CommandSpec."""

    spec = cli.register_debts_command(subparsers_action)
    assert spec.name == "debts"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_debts_command_configures_arguments():
    """register_debts_command should define debt-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_debts_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(["debts"])
    assert namespace.command == "debts"


def test_register_log_command_returns_spec(subparsers_action):
    """register_log_command should return a CommandSpec."""

    spec = cli.register_log_command(subparsers_action)
    assert spec.name == "log"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_log_command_configures_arguments():
    """register_log_command should define transaction-log arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_log_command(subparsers)
    spec.register(subparsers)
    namespace = parser.parse_args(["log"])
    assert namespace.command == "log"


# ---------------------------------------------------------------------------
# Runtime context helpers
# ---------------------------------------------------------------------------


def test_load_runtime_context_uses_provided_path(config_file, monkeypatch):
    """load_runtime_context should load settings from the specified config path."""

    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_file
        return sentinel_context

    monkeypatch.setattr(core_logic, "load_runtime_context", fake_loader)
    assert cli.load_runtime_context(config_file) is sentinel_context


def test_load_runtime_context_supports_defaults(monkeypatch, tmp_path):
    """load_runtime_context should resolve config.ini from the working directory."""

    config_path = tmp_path / "config.ini"
    config_path.write_text("[Dummy]\nkey=value\n")
    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_path
        return sentinel_context

    monkeypatch.setattr(core_logic, "load_runtime_context", fake_loader)
    monkeypatch.chdir(tmp_path)
    assert cli.load_runtime_context() is sentinel_context


# ---------------------------------------------------------------------------
# Dispatch helpers
# ---------------------------------------------------------------------------


def test_dispatch_command_invokes_executor(runtime_context, command_table_entry):
    """dispatch_command should call the executor associated with the command."""

    command_name, spec = command_table_entry
    command_table = {command_name: spec}
    args = argparse.Namespace(command=command_name)
    result = cli.dispatch_command(runtime_context, args, command_table)
    assert result == 0
    assert spec.execute.__dict__["called"] is True


def test_dispatch_command_handles_unknown_commands(runtime_context):
    """dispatch_command should raise a clear error for unknown commands."""

    args = argparse.Namespace(command="unknown")
    with pytest.raises(KeyError):
        cli.dispatch_command(runtime_context, args, {})


def test_build_command_table_indexes_specs(command_spec_iterable):
    """build_command_table should index specs by their command names."""

    table = cli.build_command_table(command_spec_iterable)
    assert set(table) == {spec.name for spec in command_spec_iterable}


def test_build_command_table_detects_duplicate_commands():
    """build_command_table should guard against duplicate command names."""

    specs = [
        cli.CommandSpec("alpha", "A", lambda s: s.add_parser("alpha"), lambda c, a: 0),
        cli.CommandSpec("alpha", "Duplicate", lambda s: s.add_parser("alpha"), lambda c, a: 0),
    ]
    with pytest.raises(ValueError):
        cli.build_command_table(specs)


# ---------------------------------------------------------------------------
# Translation helpers
# ---------------------------------------------------------------------------


def test_translate_add_product_returns_payload():
    """translate_add_product should produce a DAL-friendly payload."""

    args = argparse.Namespace(
        product_id="P1001",
        product_name="Chocolate Bar",
        sell_price="3.50",
        inactive=False,
    )
    payload = cli.translate_add_product(args)
    assert payload == {
        "product_id": "P1001",
        "product_name": "Chocolate Bar",
        "sell_price": Decimal("3.50"),
        "is_active": True,
    }


def test_translate_add_salesman_returns_payload():
    """translate_add_salesman should produce a DAL-friendly payload."""

    args = argparse.Namespace(
        salesman_id="S100",
        salesman_name="Alex",
        inactive=True,
    )
    payload = cli.translate_add_salesman(args)
    assert payload == {
        "salesman_id": "S100",
        "salesman_name": "Alex",
        "is_active": False,
    }


def test_translate_sale_returns_sale_command():
    """translate_sale should produce a SaleCommand instance."""

    args = argparse.Namespace(
        product_id="P1001",
        quantity="2",
        salesman_id="S-DEFAULT",
        total_revenue="6.00",
        payment_type=constants.PaymentType.CASH.value,
        notes="First sale",
    )
    command = cli.translate_sale(args)
    assert isinstance(command, core_logic.SaleCommand)
    assert command.quantity == Decimal("2")
    assert command.total_revenue == Decimal("6.00")
    assert command.payment_type == constants.PaymentType.CASH
    assert command.notes == "First sale"


def test_translate_restock_returns_restock_command():
    """translate_restock should produce a RestockCommand instance."""

    args = argparse.Namespace(
        product_id="P1001",
        quantity="5",
        total_cost="10.00",
        salesman_id="S-DEFAULT",
        notes="Bulk restock",
    )
    command = cli.translate_restock(args)
    assert isinstance(command, core_logic.RestockCommand)
    assert command.quantity == Decimal("5")
    assert command.total_cost == Decimal("10.00")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Bulk restock"


def test_translate_write_off_returns_write_off_command():
    """translate_write_off should produce a WriteOffCommand instance."""

    args = argparse.Namespace(
        product_id="P1001",
        quantity="1",
        salesman_id="S-DEFAULT",
        notes="Damaged",
    )
    command = cli.translate_write_off(args)
    assert isinstance(command, core_logic.WriteOffCommand)
    assert command.quantity == Decimal("1")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Damaged"


def test_translate_pay_debt_returns_credit_payment_command():
    """translate_pay_debt should produce a CreditPaymentCommand instance."""

    args = argparse.Namespace(
        linked_transaction_id="T20250101010101000000",
        total_revenue="6.00",
        salesman_id="S-DEFAULT",
        notes="Settled",
    )
    command = cli.translate_pay_debt(args)
    assert isinstance(command, core_logic.CreditPaymentCommand)
    assert command.total_revenue == Decimal("6.00")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Settled"


def test_translate_void_returns_void_command():
    """translate_void should produce a VoidCommand instance."""

    args = argparse.Namespace(
        linked_transaction_id="T20250101010101000000",
        notes="Mistake",
    )
    command = cli.translate_void(args)
    assert isinstance(command, core_logic.VoidCommand)
    assert command.linked_transaction_id == "T20250101010101000000"
    assert command.notes == "Mistake"
    assert command.replacement_command is None


# ---------------------------------------------------------------------------
# Command execution helpers
# ---------------------------------------------------------------------------


def test_run_add_product_invokes_bll(runtime_context, monkeypatch):
    """run_add_product should delegate to the business logic layer."""

    args = argparse.Namespace()
    payload = {"product_id": "P1001"}

    monkeypatch.setattr(cli, "translate_add_product", lambda value: payload)
    called: dict[str, object] = {}

    def fake_add_product(context: core_logic.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.core_logic, "add_product", fake_add_product, raising=False)
    result = cli.run_add_product(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload


def test_run_add_salesman_invokes_bll(runtime_context, monkeypatch):
    """run_add_salesman should delegate to the business logic layer."""

    args = argparse.Namespace()
    payload = {"salesman_id": "S100"}
    monkeypatch.setattr(cli, "translate_add_salesman", lambda value: payload)
    called: dict[str, object] = {}

    def fake_add_salesman(context: core_logic.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.core_logic, "add_salesman", fake_add_salesman, raising=False)
    result = cli.run_add_salesman(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload


def test_run_sale_invokes_bll(runtime_context, monkeypatch):
    """run_sale should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.SaleCommand(
        product_id="P1001",
        salesman_id="S100",
        quantity=Decimal("1"),
        total_revenue=Decimal("2.00"),
        payment_type=constants.PaymentType.CASH,
    )
    monkeypatch.setattr(cli, "translate_sale", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.SaleCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_sale", fake_record)
    result = cli.run_sale(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
    assert called["cmd"] is command


def test_run_restock_invokes_bll(runtime_context, monkeypatch):
    """run_restock should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.RestockCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("10"),
    )
    monkeypatch.setattr(cli, "translate_restock", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.RestockCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_restock", fake_record)
    result = cli.run_restock(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command


def test_run_write_off_invokes_bll(runtime_context, monkeypatch):
    """run_write_off should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.WriteOffCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
    )
    monkeypatch.setattr(cli, "translate_write_off", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.WriteOffCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_write_off", fake_record)
    result = cli.run_write_off(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command


def test_run_pay_debt_invokes_bll(runtime_context, monkeypatch):
    """run_pay_debt should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.CreditPaymentCommand(
        linked_transaction_id="T1",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("6"),
    )
    monkeypatch.setattr(cli, "translate_pay_debt", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.CreditPaymentCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_credit_payment", fake_record)
    result = cli.run_pay_debt(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command


def test_run_void_invokes_bll(runtime_context, monkeypatch):
    """run_void should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.VoidCommand(linked_transaction_id="T1", replacement_command=None)
    monkeypatch.setattr(cli, "translate_void", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.VoidCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_void", fake_record)
    result = cli.run_void(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command


def test_run_stock_report_invokes_bll(runtime_context, monkeypatch):
    """run_stock_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_calculate(context: core_logic.RuntimeContext) -> Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.core_logic, "calculate_inventory", fake_calculate)
    result = cli.run_stock_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context


def test_run_profit_report_invokes_bll(runtime_context, monkeypatch):
    """run_profit_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_summary(context: core_logic.RuntimeContext) -> Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.core_logic, "calculate_profit_summary", fake_summary)
    result = cli.run_profit_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context


def test_run_debts_report_invokes_bll(runtime_context, monkeypatch):
    """run_debts_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_summary(context: core_logic.RuntimeContext) -> Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.core_logic, "calculate_outstanding_debts", fake_summary, raising=False)
    result = cli.run_debts_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context


def test_run_log_report_invokes_bll(runtime_context, monkeypatch):
    """run_log_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_list(context: core_logic.RuntimeContext) -> list[object]:
        called["context"] = context
        return []

    monkeypatch.setattr(cli.core_logic, "list_transactions", fake_list)
    result = cli.run_log_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context


# ---------------------------------------------------------------------------
# Error handling and persistence
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "error, expected",
    [
        (core_logic.BusinessRuleViolation("invalid"), 2),
        (FileNotFoundError("missing"), 3),
        (ValueError("bad value"), 1),
    ],
)
def test_handle_cli_error_returns_exit_code(error: Exception, expected: int, caplog: pytest.LogCaptureFixture):
    """handle_cli_error should convert exceptions into exit codes."""

    caplog.set_level("ERROR")
    exit_code = cli.handle_cli_error(error)
    assert exit_code == expected
    assert caplog.records


def test_handle_cli_error_logs_human_readable_message(caplog: pytest.LogCaptureFixture):
    """handle_cli_error should emit a user-friendly log message."""

    caplog.set_level("ERROR")
    error = core_logic.BusinessRuleViolation("invalid")
    cli.handle_cli_error(error)
    assert any("invalid" in record.getMessage() for record in caplog.records)


def test_persist_workbook_saves_changes(runtime_context, monkeypatch):
    """persist_workbook should request the data layer to save the workbook."""

    called = {}

    def fake_persist(context: core_logic.RuntimeContext) -> None:
        called["context"] = context

    monkeypatch.setattr(cli.core_logic, "persist_context", fake_persist)
    cli.persist_workbook(runtime_context)
    assert called["context"] is runtime_context


def test_persist_workbook_handles_read_only_workbooks(runtime_context, monkeypatch):
    """persist_workbook should handle read-only workbook scenarios gracefully."""

    def fake_persist(_: core_logic.RuntimeContext) -> None:
        raise PermissionError("read-only")

    monkeypatch.setattr(cli.core_logic, "persist_context", fake_persist)
    with pytest.raises(RuntimeError, match="read-only"):
        cli.persist_workbook(runtime_context)


# ---------------------------------------------------------------------------
# Program entry point
# ---------------------------------------------------------------------------


def test_main_executes_specified_command(monkeypatch, runtime_context):
    """main should execute the command parsed from argv."""

    parser = _stub_parser(command="sale")
    command_table = {"sale": cli.CommandSpec("sale", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli, "build_parser", lambda: parser)
    monkeypatch.setattr(cli, "configure_subcommands", lambda _: command_table)
    monkeypatch.setattr(cli, "load_runtime_context", lambda path=None: runtime_context)

    called = {}

    def fake_dispatch(context: core_logic.RuntimeContext, args: argparse.Namespace, table: Mapping[str, cli.CommandSpec]) -> int:
        called["context"] = context
        called["args"] = args
        called["table"] = table
        return 0

    monkeypatch.setattr(cli, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(cli, "persist_workbook", lambda ctx: called.setdefault("persisted", ctx))

    exit_code = cli.main(["sale"])
    assert exit_code == 0
    assert called["context"] is runtime_context
    assert called["persisted"] is runtime_context
    assert called["args"].command == "sale"


def test_main_handles_bll_errors(monkeypatch, runtime_context):
    """main should surface business rule violations as non-zero exits."""

    parser = _stub_parser(command="sale")
    command_table = {"sale": cli.CommandSpec("sale", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli, "build_parser", lambda: parser)
    monkeypatch.setattr(cli, "configure_subcommands", lambda _: command_table)
    monkeypatch.setattr(cli, "load_runtime_context", lambda path=None: runtime_context)

    def fake_dispatch(*_: object) -> int:
        raise core_logic.BusinessRuleViolation("invalid")

    monkeypatch.setattr(cli, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(cli, "persist_workbook", lambda _: (_ for _ in ()).throw(AssertionError("should not persist")))

    handled = {}

    def fake_handle(error: Exception) -> int:
        handled["error"] = error
        return 99

    monkeypatch.setattr(cli, "handle_cli_error", fake_handle)
    exit_code = cli.main(["sale"])
    assert exit_code == 99
    assert isinstance(handled["error"], core_logic.BusinessRuleViolation)


def test_main_persists_on_success(monkeypatch, runtime_context):
    """main should persist workbook changes when the command succeeds."""

    parser = _stub_parser(command="profit")
    command_table = {"profit": cli.CommandSpec("profit", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli, "build_parser", lambda: parser)
    monkeypatch.setattr(cli, "configure_subcommands", lambda _: command_table)
    monkeypatch.setattr(cli, "load_runtime_context", lambda path=None: runtime_context)
    monkeypatch.setattr(cli, "dispatch_command", lambda *_: 0)

    persisted = {}

    def fake_persist(context: core_logic.RuntimeContext) -> None:
        persisted["context"] = context

    monkeypatch.setattr(cli, "persist_workbook", fake_persist)
    exit_code = cli.main(["profit"])
    assert exit_code == 0
    assert persisted["context"] is runtime_context


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _stub_parser(command: str) -> argparse.ArgumentParser:
    """Create a stub parser that always returns the supplied command."""

    class _Stub(argparse.ArgumentParser):
        def parse_args(self, args: Iterable[str] | None = None, namespace: argparse.Namespace | None = None):  # type: ignore[override]
            parsed = argparse.Namespace(command=command)
            return parsed

    return _Stub(prog="test")


def _registered_choices(parser: argparse.ArgumentParser) -> set[str]:
    """Return the set of registered sub-command names for assertion helpers."""

    actions = getattr(parser, "_subparsers", None)
    if not actions:
        return set()
    group_actions = actions._group_actions  # type: ignore[attr-defined]
    if not group_actions:
        return set()
    return set(group_actions[0].choices)  # type: ignore[index]
