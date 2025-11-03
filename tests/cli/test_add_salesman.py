import argparse

from caad_erp import cli, bll


def test_register_add_salesman_command_returns_spec():
    """
    Given the add-salesman registration 
    When register_add_salesman_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_add_salesman_command()

    # Assert
    assert spec.name == "add-salesman"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_salesman_command_configures_arguments():
    """
    Given the add-salesman parser 
    When arguments are parsed 
    Then the namespace contains expected values.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_salesman_command()
    spec.register(subparsers)

    # Act
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

    # Assert
    assert namespace.salesman_id == "S100"
    assert namespace.salesman_name == "Alex"
    assert namespace.inactive is True


def test_translate_add_salesman_returns_payload():
    """
    Given CLI arguments 
    When translate_add_salesman executes 
    Then a DAL payload dictionary is returned.
    """

    # Arrange
    args = argparse.Namespace(
        salesman_id="S100",
        salesman_name="Alex",
        inactive=True,
    )

    # Act
    payload = cli.translate_add_salesman(args)

    # Assert
    assert payload == {
        "salesman_id": "S100",
        "salesman_name": "Alex",
        "is_active": False,
    }


def test_run_add_salesman_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_add_salesman executes 
    Then the BLL add_salesman is invoked.
    """

    # Arrange
    args = argparse.Namespace()
    payload = {"salesman_id": "S100"}
    monkeypatch.setattr(
        cli.commands.add_salesman, "translate_add_salesman", lambda value: payload
    )
    called: dict[str, object] = {}

    def fake_add_salesman(context: bll.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.bll, "add_salesman",
                        fake_add_salesman, raising=False)

    # Act
    result = cli.run_add_salesman(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload
