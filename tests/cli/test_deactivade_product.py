import argparse

from caad_erp import cli, bll


def test_register_deactivate_product_command_returns_spec():
    """
    Given the deactivate-product registration 
    When register_deactivate_product_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_deactivate_product_command()

    # Assert
    assert spec.name == "deactivate-product"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_deactivate_product_command_configures_arguments():
    """
    Given the deactivate-product parser 
    When arguments are parsed 
    Then the namespace captures the inputs.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_deactivate_product_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args([
        "deactivate-product",
        "--product-id",
        "P1001",
    ])

    # Assert
    assert namespace.command == "deactivate-product"
    assert namespace.product_id == "P1001"


def test_translate_deactivate_product_returns_product_id():
    """
    Given CLI arguments 
    When translate_deactivate_product executes 
    Then a trimmed product identifier returns.
    """

    # Arrange
    args = argparse.Namespace(product_id="  P1001  ")

    # Act
    product_id = cli.translate_deactivate_product(args)

    # Assert
    assert product_id == "P1001"


def test_run_deactivate_product_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_deactivate_product executes 
    Then the BLL product updater is called.
    """

    # Arrange
    args = argparse.Namespace()
    translated_id = "P1001"
    monkeypatch.setattr(
        cli.commands.deactivate_product,
        "translate_deactivate_product",
        lambda value: translated_id,
    )
    called: dict[str, object] = {}

    def fake_update_product(
            context: bll.RuntimeContext,
            product_id: str,
            *,
            is_active: bool,
    ) -> None:
        called["context"] = context
        called["product_id"] = product_id
        called["is_active"] = is_active

    monkeypatch.setattr(cli.bll, "update_product", fake_update_product)

    # Act
    result = cli.run_deactivate_product(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
    assert called["product_id"] == translated_id
    assert called["is_active"] is False
