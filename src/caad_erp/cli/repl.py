"""Interactive REPL mode for the CAAD ERP command-line interface.

Loads a single :class:`~caad_erp.bll.RuntimeContext` at session start and
reuses it across every command, eliminating the per-invocation I/O overhead of
the one-shot entry point while preserving identical command semantics.
"""

import argparse
import logging
import shlex
import typing as t

from caad_erp import bll

from . import command_spec

logger = logging.getLogger(__name__)

_PROMPT = "(caad-erp) > "
_EXIT_TOKENS = frozenset(("exit", "quit"))


def run_repl(
    context: bll.RuntimeContext,
    parser: argparse.ArgumentParser,
    command_table: t.Mapping[str, command_spec.CommandSpec],
) -> int:
    """Run an interactive read-eval-print loop over the given context.

    The context is loaded once by the caller and shared across all commands
    executed during the session.  Mutating commands that succeed trigger an
    immediate :func:`~caad_erp.bll.persist_context` call so that workbook
    state is never lost if the session is interrupted before a clean exit.

    Args:
        context (bll.RuntimeContext): Pre-loaded runtime context to share
            across all REPL commands.
        parser (argparse.ArgumentParser): Root argument parser used to parse
            each line entered by the user.
        command_table (Mapping[str, CommandSpec]): Lookup table of all
            registered command specifications.

    Returns:
        int: Always ``0``; the REPL exits cleanly regardless of individual
            command failures.
    """
    print("CAAD ERP interactive session. Type 'exit' or press Ctrl+D to quit.")

    while True:
        try:
            line = input(_PROMPT)
        except EOFError:
            print()
            break

        line = line.strip()
        if not line:
            continue

        try:
            tokens = shlex.split(line)
        except ValueError as exc:
            print(f"error: {exc}")
            continue

        if tokens[0] in _EXIT_TOKENS:
            break

        try:
            inner_args = parser.parse_args(tokens)
        except SystemExit:
            # argparse calls sys.exit() on parse errors and --help; absorb it
            # so the REPL can continue.
            continue

        command_name = getattr(inner_args, "command", None)
        if command_name is None or command_name not in command_table:
            # e.g., user typed 'repl' inside the REPL
            print(f"error: '{command_name}' is not available inside the REPL")
            continue

        spec = command_table[command_name]
        try:
            exit_code = spec.execute(context, inner_args)
        except Exception as exc:
            logger.error("%s", exc)
            print(f"error: {exc}")
            continue

        if exit_code == 0 and spec.is_mutating:
            try:
                bll.persist_context(context)
            except Exception as exc:
                logger.error("Failed to persist workbook: %s", exc)
                print(f"error: failed to save workbook: {exc}")

    return 0
