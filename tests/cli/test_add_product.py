import argparse
from decimal import Decimal

from caad_erp import cli, bll


def test_register_add_product_command_returns_spec():
    """register_add_product_command should return a CommandSpec."""

    spec = cli.register_add_product_command()
    assert spec.name == "add-product"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_product_command_configures_arguments():
    """register_add_product_command should define the necessary arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_product_command()
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


def test_run_add_product_invokes_bll(runtime_context, monkeypatch):
    """run_add_product should delegate to the business logic layer."""

    args = argparse.Namespace()
    payload = {"product_id": "P1001"}

    monkeypatch.setattr(cli.commands.add_product,
                        "translate_add_product", lambda value: payload)
    called: dict[str, object] = {}

    def fake_add_product(context: bll.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.bll, "add_product",
                        fake_add_product, raising=False)
    result = cli.run_add_product(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload
