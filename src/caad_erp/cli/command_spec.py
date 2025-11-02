import argparse
import typing as t
from dataclasses import dataclass

from caad_erp import core_logic


@dataclass(frozen=True)
class CommandSpec:
    """Describe how a CLI sub-command is configured and executed."""

    name: str
    help_text: str
    register: t.Callable[[
        argparse._SubParsersAction[argparse.ArgumentParser]], argparse.ArgumentParser]
    execute: t.Callable[[core_logic.RuntimeContext, argparse.Namespace], int]
