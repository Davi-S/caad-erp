"""Command modules for the CAAD ERP CLI.

Each module in this package exposes a ``register_<module>_command`` factory
that returns a :class:`~caad_erp.cli.command_spec.CommandSpec`. These
factories are discovered and invoked automatically by
:func:`caad_erp.cli.parser.discover_command_specs`; no manual imports or
registration calls are needed here.
"""
