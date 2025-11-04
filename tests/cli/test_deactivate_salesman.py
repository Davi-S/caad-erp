import argparse

from caad_erp import cli, bll


def test_register_deactivate_salesman_command_returns_spec():
    """
    Given the deactivate-salesman registration 
    When register_deactivate_salesman_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_deactivate_salesman_command()

    # Assert
    assert spec.name == "deactivate-salesman"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_deactivate_salesman_command_configures_arguments():
    """
    Given the deactivate-salesman parser 
    When arguments are parsed 
    Then the namespace captures the inputs.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_deactivate_salesman_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args([
        "deactivate-salesman",
        "--salesman-id",
        "S100",
    ])

    # Assert
    assert namespace.command == "deactivate-salesman"
    assert namespace.salesman_id == "S100"


def test_translate_deactivate_salesman_returns_salesman_id():
    """
    Given CLI arguments 
    When translate_deactivate_salesman executes 
    Then a trimmed salesman identifier returns.
    """

    # Arrange
    args = argparse.Namespace(salesman_id="  S100  ")

    # Act
    salesman_id = cli.translate_deactivate_salesman(args)

    # Assert
    assert salesman_id == "S100"


def test_run_deactivate_salesman_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_deactivate_salesman executes 
    Then the BLL salesman updater is called.
    """

    # Arrange
    args = argparse.Namespace()
    translated_id = "S100"
    monkeypatch.setattr(
        cli.commands.deactivate_salesman,
        "translate_deactivate_salesman",
        lambda value: translated_id,
    )
    called: dict[str, object] = {}

    def fake_update_salesman(
            context: bll.RuntimeContext,
            salesman_id: str,
            *,
            is_active: bool,
    ) -> None:
        called["context"] = context
        called["salesman_id"] = salesman_id
        called["is_active"] = is_active

    monkeypatch.setattr(cli.bll, "update_salesman", fake_update_salesman)

    # Act
    result = cli.run_deactivate_salesman(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
    assert called["salesman_id"] == translated_id
    assert called["is_active"] is False
