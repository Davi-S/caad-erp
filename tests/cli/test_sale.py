import argparse
from decimal import Decimal

from caad_erp import cli, bll, constants


def test_register_sale_command_returns_spec():
    """
    Given the sale registration 
    When register_sale_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_sale_command()

    # Assert
    assert spec.name == "sale"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_sale_command_configures_arguments():
    """
    Given the sale parser 
    When arguments are parsed 
    Then the namespace reflects the inputs.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_sale_command()
    spec.register(subparsers)

    # Act
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

    # Assert
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "2"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.total_revenue == "6.00"
    assert namespace.payment_type == constants.PaymentType.CASH.value
    assert namespace.notes == "First sale"


def test_translate_sale_returns_sale_command():
    """
    Given CLI arguments 
    When translate_sale executes 
    Then a SaleCommand is produced.
    """

    # Arrange
    args = argparse.Namespace(
        product_id="P1001",
        quantity="2",
        salesman_id="S-DEFAULT",
        total_revenue="6.00",
        payment_type=constants.PaymentType.CASH.value,
        notes="First sale",
    )

    # Act
    command = cli.translate_sale(args)

    # Assert
    assert isinstance(command, bll.SaleCommand)
    assert command.quantity == Decimal("2")
    assert command.total_revenue == Decimal("6.00")
    assert command.payment_type == constants.PaymentType.CASH
    assert command.notes == "First sale"


def test_run_sale_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_sale executes 
    Then the BLL sale recorder is called.
    """

    # Arrange
    args = argparse.Namespace()
    command = bll.SaleCommand(
        product_id="P1001",
        salesman_id="S100",
        quantity=Decimal("1"),
        total_revenue=Decimal("2.00"),
        payment_type=constants.PaymentType.CASH,
    )
    monkeypatch.setattr(cli.commands.sale, "translate_sale",
                        lambda value: command)
    called = {}

    def fake_record(context: bll.RuntimeContext, cmd: bll.SaleCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.bll, "record_sale", fake_record)

    # Act
    result = cli.run_sale(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
    assert called["cmd"] is command
