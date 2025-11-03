import argparse
from decimal import Decimal

from caad_erp import cli, bll


def test_register_add_product_command_returns_spec():
    """
    Given the add-product registration 
    When register_add_product_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_add_product_command()

    # Assert
    assert spec.name == "add-product"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_product_command_configures_arguments():
    """
    Given the add-product parser 
    When arguments are parsed 
    Then the namespace contains expected values.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_product_command()
    spec.register(subparsers)

    # Act
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

    # Assert
    assert namespace.product_id == "P1001"
    assert namespace.product_name == "Chocolate Bar"
    assert namespace.sell_price == "3.50"
    assert namespace.inactive is True


def test_translate_add_product_returns_payload():
    """
    Given CLI arguments 
    When translate_add_product executes 
    Then a DAL payload dictionary is returned.
    """

    # Arrange
    args = argparse.Namespace(
        product_id="P1001",
        product_name="Chocolate Bar",
        sell_price="3.50",
        inactive=False,
    )

    # Act
    payload = cli.translate_add_product(args)

    # Assert
    assert payload == {
        "product_id": "P1001",
        "product_name": "Chocolate Bar",
        "sell_price": Decimal("3.50"),
        "is_active": True,
    }


def test_run_add_product_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_add_product executes 
    Then the BLL add_product is invoked.
    """

    # Arrange
    args = argparse.Namespace()
    payload = {"product_id": "P1001"}
    monkeypatch.setattr(
        cli.commands.add_product, "translate_add_product", lambda value: payload
    )
    called: dict[str, object] = {}

    def fake_add_product(context: bll.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.bll, "add_product",
                        fake_add_product, raising=False)

    # Act
    result = cli.run_add_product(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload
