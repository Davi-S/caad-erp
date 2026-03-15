from caad_erp.cli import command_spec


def test_command_spec_defaults_is_mutating_true() -> None:
    """
    GIVEN a CommandSpec constructed without explicit is_mutating
    WHEN the dataclass instance is created
    THEN is_mutating defaults to True
    """
    # Arrange
    spec = command_spec.CommandSpec(
        name="cmd",
        help_text="help",
        register=lambda action: action.add_parser("cmd"),
        execute=lambda context, args: 0,
    )

    # Act / Assert
    assert spec.is_mutating is True


def test_command_spec_accepts_explicit_non_mutating_flag() -> None:
    """
    GIVEN a CommandSpec constructed with is_mutating set to False
    WHEN the dataclass instance is created
    THEN is_mutating is preserved as False
    """
    # Arrange
    spec = command_spec.CommandSpec(
        name="cmd",
        help_text="help",
        register=lambda action: action.add_parser("cmd"),
        execute=lambda context, args: 0,
        is_mutating=False,
    )

    # Act / Assert
    assert spec.is_mutating is False
