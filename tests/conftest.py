"""Shared pytest fixtures and utilities for Lounge ERP tests."""

from __future__ import annotations

import argparse
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable, Iterator
from unittest.mock import Mock

import pytest

# Ensure source packages are importable without installation.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"

for candidate in (SRC_DIR, PROJECT_ROOT):
    candidate_str = str(candidate)
    if candidate_str not in sys.path:
        sys.path.insert(0, candidate_str)

from caad_erp import cli, constants, core_logic, data_manager  # noqa: E402
from setup_excel import create_master_workbook  # noqa: E402

DEFAULT_SCHEMA_VERSION = constants.EXPECTED_SCHEMA_VERSION
DEFAULT_SALESMAN_ID = "S-DEFAULT"
_CONFIG_TEMPLATE = (
    "[System]\n"
    "DataFile = {data_file}\n"
    "LoungeName = {lounge_name}\n"
    "SchemaVersion = {schema_version}\n\n"
    "[Defaults]\n"
    "DefaultSalesman = {default_salesman_id}\n"
)


@dataclass(frozen=True)
class ConfigBundle:
    """Container bundling together config metadata for tests."""

    directory: Path
    config_path: Path
    workbook_path: Path
    default_salesman_id: str
    schema_version: str
    lounge_name: str


@pytest.fixture(scope="session", autouse=True)
def _restore_sys_path() -> Iterator[None]:
    """Ensure sys.path modifications are undone after the test session."""

    original = sys.path.copy()
    try:
        yield
    finally:
        sys.path[:] = original


@pytest.fixture(scope="session")
def project_root() -> Path:
    """Return the repository root path."""

    return PROJECT_ROOT


@pytest.fixture(scope="session")
def src_dir() -> Path:
    """Return the ``src`` directory containing the package under test."""

    return SRC_DIR


@pytest.fixture
def workbook_factory(tmp_path: Path) -> Callable[..., Path]:
    """Factory that creates an initialized master workbook in a temp folder."""

    def _create_workbook(
        *,
        subdir: str | None = None,
        default_salesman_id: str = DEFAULT_SALESMAN_ID,
        filename: str = "master_workbook.xlsx",
    ) -> Path:
        base_dir = tmp_path if subdir is None else tmp_path / subdir
        base_dir.mkdir(parents=True, exist_ok=True)
        workbook_path = base_dir / filename
        create_master_workbook(workbook_path, default_salesman_id=default_salesman_id, overwrite=True)
        return workbook_path

    return _create_workbook


@pytest.fixture
def master_workbook_path(workbook_factory: Callable[..., Path]) -> Path:
    """Return a fresh master workbook ready for use in a test."""

    unique_dir = f"workbook_{uuid.uuid4().hex}"
    return workbook_factory(subdir=unique_dir)


@pytest.fixture
def config_factory(tmp_path: Path, workbook_factory: Callable[..., Path]) -> Callable[..., ConfigBundle]:
    """Provide a callable that creates config/workbook bundles on demand."""

    def _create_config(
        *,
        make_relative: bool = False,
        lounge_name: str = "Test Lounge",
        schema_version: str = DEFAULT_SCHEMA_VERSION,
        default_salesman_id: str = DEFAULT_SALESMAN_ID,
    ) -> ConfigBundle:
        bundle_id = uuid.uuid4().hex
        bundle_dir = tmp_path / f"bundle_{bundle_id}"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        workbook_path = workbook_factory(
            subdir=f"bundle_{bundle_id}",
            default_salesman_id=default_salesman_id,
        )
        data_file_entry = workbook_path.name if make_relative else str(workbook_path)
        config_path = bundle_dir / "config.ini"
        config_path.write_text(
            _CONFIG_TEMPLATE.format(
                data_file=data_file_entry,
                lounge_name=lounge_name,
                schema_version=schema_version,
                default_salesman_id=default_salesman_id,
            )
        )
        return ConfigBundle(
            directory=bundle_dir,
            config_path=config_path,
            workbook_path=workbook_path,
            default_salesman_id=default_salesman_id,
            schema_version=schema_version,
            lounge_name=lounge_name,
        )

    return _create_config


@pytest.fixture
def config_file(config_factory: Callable[..., ConfigBundle]) -> Path:
    """Convenience fixture returning only the config path."""

    return config_factory().config_path


@pytest.fixture
def runtime_context(config_file: Path) -> core_logic.RuntimeContext:
    """Load the runtime context for tests through the public API."""

    context = core_logic.load_runtime_context(config_file)
    core_logic.ensure_schema_version(context)
    return context


# ---------------------------------------------------------------------------
# CLI layer fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def cli_parser() -> argparse.ArgumentParser:
    """Return a fresh CLI parser instance for tests."""

    return argparse.ArgumentParser(prog="lounge-cli", description="Lounge CLI")


@pytest.fixture
def subparsers_action(
    cli_parser: argparse.ArgumentParser,
) -> argparse._SubParsersAction[argparse.ArgumentParser]:
    """Return the subparser action used to register commands."""

    return cli_parser.add_subparsers(dest="command")


@pytest.fixture
def command_table_entry() -> tuple[str, cli.CommandSpec]:
    """Provide a placeholder command table entry for dispatch tests."""

    called = {"called": False}

    def execute(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
        called["called"] = True
        execute.__dict__["called"] = True
        return 0

    def register(
        subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
    ) -> argparse.ArgumentParser:
        return subparsers.add_parser("catalog-test")

    spec = cli.CommandSpec(
        name="catalog-test",
        help_text="help",
        register=register,
        execute=execute,
    )
    return "catalog-test", spec


@pytest.fixture
def command_spec_iterable() -> list[cli.CommandSpec]:
    """Provide a list of command specs for indexing tests."""

    def _make_spec(name: str) -> cli.CommandSpec:
        return cli.CommandSpec(
            name,
            f"{name} help",
            lambda subparsers: subparsers.add_parser(name),
            lambda *_: 0,
        )

    return [_make_spec("alpha"), _make_spec("beta"), _make_spec("gamma")]


# ---------------------------------------------------------------------------
# Core logic fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def settings(tmp_path: Path) -> data_manager.ConfigSettings:
    """Provide default configuration settings for runtime context tests."""

    return data_manager.ConfigSettings(
        data_file=tmp_path / "master_workbook.xlsx",
        lounge_name="Test Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S-DEFAULT",
    )


@pytest.fixture
def workbook() -> Mock:
    """Return a mock workbook object for business logic tests."""

    return Mock(name="workbook")


@pytest.fixture
def context(settings: data_manager.ConfigSettings, workbook: Mock) -> core_logic.RuntimeContext:
    """Assemble a runtime context from injected settings and workbook mocks."""

    return core_logic.RuntimeContext(settings=settings, workbook=workbook)


@pytest.fixture
def set_fixed_datetime(monkeypatch: pytest.MonkeyPatch) -> Callable[[datetime], datetime]:
    """Patch ``core_logic.datetime`` to return a predetermined moment."""

    def _apply(moment: datetime) -> datetime:
        class _FixedDateTime:
            @staticmethod
            def now(tz=None):
                assert tz is UTC
                return moment

        monkeypatch.setattr(core_logic, "datetime", _FixedDateTime)
        return moment

    return _apply