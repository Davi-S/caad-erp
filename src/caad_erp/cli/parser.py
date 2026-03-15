"""Argument parsing utilities for the CAAD ERP command-line interface.

This module wires the public CLI surface by constructing the root parser,
registering each command specification, dispatching execution, and translating
low-level exceptions into exit codes suitable for shell automation.
"""

import argparse
import importlib
import logging
import pkgutil
import typing as t
from pathlib import Path

from caad_erp import bll, exceptions

from . import command_spec

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    """Construct the root parser for all CLI entry points.

    The base parser handles global options that apply to every sub-command,
    such as the optional ``--config`` override. Sub-command registration is
    layered on top of the returned instance via
    :func:`configure_subcommands`.

    Returns:
        argparse.ArgumentParser: Parser pre-configured with the CLI program
            metadata and shared options.
    """
    parser = argparse.ArgumentParser(
        prog="caad-erp-cli",
        description="Command-line tools for the CAAD ERP workbook.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Optional path to config.ini (defaults to ./config.ini).",
    )
    return parser


def configure_subcommands(
    parser: argparse.ArgumentParser,
) -> t.Mapping[str, command_spec.CommandSpec]:
    """Attach read and write sub-commands to the base parser.

    This routine coordinates registration of every command exposed by the CLI
    by delegating to :func:`register_write_commands` and
    :func:`register_read_commands`. The resulting command table is keyed by
    command name for quick lookups during dispatch.

    Args:
        parser (argparse.ArgumentParser): Parser produced by
            :func:`build_parser` that should receive sub-command definitions.

    Returns:
        Mapping[str, CommandSpec]: Immutable view mapping command names to
            their registered specifications.
    """
    subparsers = parser.add_subparsers(dest="command", required=True, title="commands")
    discovered_specs = discover_command_specs()
    
    # Register the discovered specs
    for spec in discovered_specs:
        spec.register(subparsers)
    
    # write_specs = {
    #     spec.name: spec for spec in discovered_specs if spec.is_mutating
    # }
    # read_specs = {
    #     spec.name: spec for spec in discovered_specs if not spec.is_mutating
    # }
    
    return build_command_table(discovered_specs)


def discover_command_specs() -> t.Tuple[command_spec.CommandSpec, ...]:
    """Discover command factories in the commands package and build specs.

    Returns:
        tuple[CommandSpec, ...]: Deterministically ordered command
            specifications sorted by command name.

    Raises:
        ValueError: If a command module does not expose the expected register
            factory function.
        TypeError: If a discovered register attribute is not callable or does
            not return a :class:`CommandSpec`.
    """
    package_name = "caad_erp.cli.commands"
    package = importlib.import_module(package_name)
    if not hasattr(package, "__path__"):
        raise ValueError(
            f"Command package does not define __path__: {package_name}")

    specs: t.List[command_spec.CommandSpec] = []
    for module_info in pkgutil.iter_modules(package.__path__):
        if module_info.ispkg:
            continue
        module_name = module_info.name
        module = importlib.import_module(f"{package_name}.{module_name}")
        register_name = f"register_{module_name}_command"
        register_factory = getattr(module, register_name, None)
        if register_factory is None:
            raise ValueError(
                f"Missing register factory '{register_name}' in module "
                f"'{package_name}.{module_name}'"
            )
        if not callable(register_factory):
            raise TypeError(
                f"Register factory '{register_name}' in module "
                f"'{package_name}.{module_name}' is not callable"
            )

        spec = register_factory()
        if not isinstance(spec, command_spec.CommandSpec):
            raise TypeError(
                f"Register factory '{register_name}' in module "
                f"'{package_name}.{module_name}' returned "
                f"'{type(spec).__name__}', expected CommandSpec"
            )
        specs.append(spec)

    specs.sort(key=lambda item: item.name)
    return tuple(specs)


def dispatch_command(
    context: bll.RuntimeContext,
    args: argparse.Namespace,
    command_table: t.Mapping[str, command_spec.CommandSpec],
) -> int:
    """Route parsed CLI arguments to the appropriate command executor.

    Args:
        context (bll.RuntimeContext): Live runtime context that holds
            workbook handles and cached data.
        args (argparse.Namespace): Namespace returned by
            :meth:`argparse.ArgumentParser.parse_args` containing CLI inputs.
        command_table (Mapping[str, CommandSpec]): Lookup table produced by
            :func:`build_command_table` describing all registered commands.

    Returns:
        int: Exit status produced by the selected command implementation.

    Raises:
        KeyError: If the requested command is missing from ``command_table``
            or if the parsed arguments do not define a command.
    """
    if not hasattr(args, "command") or args.command is None:
        raise KeyError("No command specified")
    spec = command_table.get(args.command)
    if spec is None:
        raise KeyError(f"Unknown command: {args.command}")
    return spec.execute(context, args)


def build_command_table(
    specs: t.Iterable[command_spec.CommandSpec],
) -> t.MutableMapping[str, command_spec.CommandSpec]:
    """Index command specifications by their declared command name.

    Args:
        specs (Iterable[CommandSpec]): Collection of command definitions to be
            made addressable by name.

    Returns:
        MutableMapping[str, CommandSpec]: Mapping containing every spec keyed
            by :attr:`CommandSpec.name`.

    Raises:
        ValueError: If multiple specifications declare the same command name,
            which would make dispatch ambiguous.
    """
    table: t.Dict[str, command_spec.CommandSpec] = {}
    for spec in specs:
        if spec.name in table:
            raise ValueError(f"Duplicate command name: {spec.name}")
        table[spec.name] = spec
    return table


def handle_cli_error(error: Exception) -> int:
    """Translate uncaught exceptions into CLI-friendly exit codes.

    Args:
        error (Exception): Unhandled exception raised during command
            execution.

    Returns:
        int: Exit status communicating the error category to the shell. Domain
            validation issues map to ``2``, missing files to ``3``, and all
            other failures to ``1``.
    """
    if isinstance(error, exceptions.BusinessRuleViolation):
        logger.error("%s", error)
        return 2
    if isinstance(error, FileNotFoundError):
        logger.error("%s", error)
        return 3
    logger.error("%s", error)
    return 1


def main(argv: t.Sequence[str] | None = None) -> int:
    """Parse arguments, execute the selected command, and persist changes.

    Args:
        argv (Sequence[str] | None): Optional argument vector to parse. When
            ``None`` the default ``sys.argv`` semantics apply.

    Returns:
        int: Exit status emitted by the invoked command or error handler.
            Successful commands persist only when their command
            specification is marked as mutating.
    """
    parse = build_parser()
    command_table = configure_subcommands(parse)
    args = parse.parse_args(argv)
    spec = command_table.get(getattr(args, "command", ""))
    try:
        context = bll.load_context(getattr(args, "config", None))
        exit_code = dispatch_command(context, args, command_table)
        if exit_code == 0 and spec is not None and spec.is_mutating:
            bll.persist_context(context)
        return exit_code
    except Exception as error:
        return handle_cli_error(error)
