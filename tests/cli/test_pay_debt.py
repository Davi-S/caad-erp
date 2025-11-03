import argparse
from decimal import Decimal

from caad_erp import cli, constants, bll


def test_register_pay_debt_command_returns_spec():
    """Given the pay-debt registration When register_pay_debt_command runs Then a command spec returns."""

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_pay_debt_command()

    # Assert
    assert spec.name == "pay-debt"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_pay_debt_command_configures_arguments():
    """Given the pay-debt parser When arguments are parsed Then the namespace captures the inputs."""

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_pay_debt_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(
        [
            "pay-debt",
            "--linked-transaction-id",
            "T20250101010101000000",
            "--total-revenue",
            "6.00",
            "--salesman-id",
            "S-DEFAULT",
            "--payment-type",
            constants.PaymentType.PIX.value,
            "--notes",
            "Credit payment",
        ]
    )

    # Assert
    assert namespace.linked_transaction_id == "T20250101010101000000"
    assert namespace.total_revenue == "6.00"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.payment_type == constants.PaymentType.PIX.value
    assert namespace.notes == "Credit payment"


def test_translate_pay_debt_returns_credit_payment_command():
    """Given CLI arguments When translate_pay_debt executes Then a CreditPaymentCommand is produced."""

    # Arrange
    args = argparse.Namespace(
        linked_transaction_id="T20250101010101000000",
        total_revenue="6.00",
        salesman_id="S-DEFAULT",
        payment_type=constants.PaymentType.PIX.value,
        notes="Settled",
    )

    # Act
    command = cli.translate_pay_debt(args)

    # Assert
    assert isinstance(command, bll.CreditPaymentCommand)
    assert command.total_revenue == Decimal("6.00")
    assert command.salesman_id == "S-DEFAULT"
    assert command.payment_type == constants.PaymentType.PIX
    assert command.notes == "Settled"


def test_run_pay_debt_invokes_bll(runtime_context, monkeypatch):
    """Given parsed arguments When run_pay_debt executes Then the BLL credit payment recorder is called."""

    # Arrange
    args = argparse.Namespace()
    command = bll.CreditPaymentCommand(
        linked_transaction_id="T1",
        salesman_id="S-DEFAULT",
        total_revenue=Decimal("6"),
        payment_type=constants.PaymentType.PIX,
    )
    monkeypatch.setattr(cli.commands.pay_debt, "translate_pay_debt", lambda value: command)
    called = {}

    def fake_record(context: bll.RuntimeContext, cmd: bll.CreditPaymentCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.bll, "record_credit_payment", fake_record)

    # Act
    result = cli.run_pay_debt(runtime_context, args)

    # Assert
    assert result == 0
    assert called["cmd"] is command
