"""Command specification definitions for the CLI sub-parser layer."""

import argparse
import typing as t
from dataclasses import dataclass

from caad_erp import bll


class SubparserFactory(t.Protocol):
    def add_parser(
        self, name: str, **kwargs: t.Any
    ) -> argparse.ArgumentParser: ...


@dataclass(frozen=True)
class CommandSpec:
    """Describe how a CLI sub-command is configured and executed."""

    name: str
    help_text: str
    register: t.Callable[[SubparserFactory], argparse.ArgumentParser]
    execute: t.Callable[[bll.RuntimeContext, argparse.Namespace], int]
