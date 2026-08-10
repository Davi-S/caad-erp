from pathlib import Path

import pytest

from caad_erp import bll, constants, settings
from caad_erp.bll import runtime


def test_load_context_reads_config_and_opens_configured_workbook(
    integration_config_path: Path,
    integration_workbook_path: Path,
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN a real config.ini pointing to a valid workbook file on disk
    WHEN runtime.load_context is called
    THEN settings are loaded workbook is opened and a usable RuntimeContext is returned
    """
    assert initialized_context.settings.data_file == integration_workbook_path.resolve()
    assert initialized_context.workbook is not None
    assert "Products" in initialized_context.workbook.sheetnames
    assert "Salesmen" in initialized_context.workbook.sheetnames
    assert "TransactionLog" in initialized_context.workbook.sheetnames


def test_load_context_supports_explicit_config_path_override(
    integration_config_path: Path,
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN multiple config files where one is provided explicitly
    WHEN runtime.load_context is called with config_path argument
    THEN context is built from the explicit configuration instead of discovery
    """
    context = runtime.load_context(integration_config_path)
    assert context.settings.data_file == initialized_context.settings.data_file


def test_load_context_propagates_missing_config_error() -> None:
    """
    GIVEN an explicit config path that does not exist
    WHEN runtime.load_context is called
    THEN FileNotFoundError is propagated without partial initialization
    """
    missing = Path("/tmp/this-config-should-not-exist-1234567890.ini")
    with pytest.raises(FileNotFoundError):
        runtime.load_context(missing)


def test_load_context_propagates_missing_workbook_error_from_settings(
    integration_workspace: Path,
) -> None:
    """
    GIVEN a valid config whose DataFile points to a non-existent workbook
    WHEN runtime.load_context is called
    THEN FileNotFoundError from workbook loading is propagated
    """
    config_path = integration_workspace / "config-missing-workbook.ini"
    config_path.write_text(
        "\n".join(
            [
                "[System]",
                "DataFile = missing.xlsx",
                "LoungeName = Integration Lounge",
                f"SchemaVersion = {constants.EXPECTED_SCHEMA_VERSION}",
                "",
                "[Defaults]",
                "DefaultSalesman = GRR00000000",
                "",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(FileNotFoundError):
        runtime.load_context(config_path)


def test_ensure_schema_version_accepts_matching_version_in_config(
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN a context created from config using the expected schema version
    WHEN runtime.ensure_schema_version is called
    THEN no exception is raised and processing may continue
    """
    runtime.ensure_schema_version(initialized_context)


def test_ensure_schema_version_rejects_mismatched_version_in_config(
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN a context created from config using a different schema version
    WHEN runtime.ensure_schema_version is called
    THEN RuntimeError is raised describing expected and actual versions
    """
    mismatched_settings = settings.AppSettings(
        data_file=initialized_context.settings.data_file,
        lounge_name=initialized_context.settings.lounge_name,
        schema_version="9.9.9",
        default_salesman_id=initialized_context.settings.default_salesman_id,
    )
    mismatched_context = runtime.RuntimeContext(
        settings=mismatched_settings,
        workbook=initialized_context.workbook,
    )
    with pytest.raises(RuntimeError):
        runtime.ensure_schema_version(mismatched_context)


def test_persist_context_writes_mutations_to_disk_for_reloaded_context(
    integration_config_path: Path,
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN a context where workbook data was changed through business workflows
    WHEN runtime.persist_context is called and a new context is loaded
    THEN persisted data is observable from the newly loaded workbook
    """
    bll.add_product(
        initialized_context,
        bll.ProductCommand(
            product_id="PERSIST-001",
            product_name="Persist Product",
            sell_price=350,
            is_active=True,
        ),
    )
    runtime.persist_context(initialized_context)

    reloaded = runtime.load_context(integration_config_path)
    product = bll.get_product(reloaded, "PERSIST-001")
    assert product.product_name == "Persist Product"


@pytest.mark.parametrize(
    "bucket_name", ["products", "salesmen", "transactions", "custom"]
)
def test_get_cache_bucket_returns_stable_bucket_object_per_name(
    bucket_name,
    initialized_context: runtime.RuntimeContext,
) -> None:
    """
    GIVEN a runtime context and repeated requests for the same cache bucket name
    WHEN runtime.get_cache_bucket is called multiple times
    THEN the same mutable bucket object is returned for that name
    """
    bucket_a = runtime.get_cache_bucket(initialized_context, bucket_name)
    bucket_b = runtime.get_cache_bucket(initialized_context, bucket_name)
    assert bucket_a is bucket_b
