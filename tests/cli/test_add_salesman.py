import argparse

from caad_erp import cli, core_logic


def test_register_add_salesman_command_returns_spec():
    """register_add_salesman_command should return a CommandSpec."""

    spec = cli.register_add_salesman_command()
    assert spec.name == "add-salesman"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_add_salesman_command_configures_arguments():
    """register_add_salesman_command should define the necessary arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_add_salesman_command()
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


def test_run_add_salesman_invokes_bll(runtime_context, monkeypatch):
    """run_add_salesman should delegate to the business logic layer."""

    args = argparse.Namespace()
    payload = {"salesman_id": "S100"}
    monkeypatch.setattr(cli.commands.add_salesman,
                        "translate_add_salesman", lambda value: payload)
    called: dict[str, object] = {}

    def fake_add_salesman(context: core_logic.RuntimeContext, **data: object) -> None:
        called["context"] = context
        called["data"] = data

    monkeypatch.setattr(cli.core_logic, "add_salesman",
                        fake_add_salesman, raising=False)
    result = cli.run_add_salesman(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
    assert called["data"] == payload
