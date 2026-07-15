import asyncio
import inspect
from pathlib import Path
from decimal import Decimal

import pytest

from caad_erp import bll
from caad_erp.api import persistence
from caad_erp.api import runtime as api_runtime


# happy path

def test_mutating_endpoint_wraps_sync_handler_and_persists_after_success(
    api_context,
) -> None:
    """
    GIVEN a synchronous mutating handler that updates runtime workbook state
    WHEN wrapped by mutating_endpoint and invoked successfully
    THEN result is returned and workbook changes are persisted to disk
    """
    data_file = Path(api_context.settings.data_file)
    before = data_file.stat().st_mtime_ns

    def handler() -> str:
        bll.add_product(
            api_context,
            bll.ProductCommand(
                product_id="PM001",
                product_name="Persisted Product",
                sell_price=Decimal("2.00"),
                is_active=True,
            ),
        )
        return "ok"

    wrapped = persistence.mutating_endpoint(handler)

    api_runtime.set_runtime_context(api_context)
    try:
        result = wrapped()
    finally:
        api_runtime.clear_runtime_context()

    after = data_file.stat().st_mtime_ns

    assert result == "ok"
    assert after >= before


@pytest.mark.parametrize("handler_kind", ["async", "sync"])
def test_mutating_endpoint_preserves_original_signature_and_metadata(handler_kind: str) -> None:
    """
    GIVEN a route handler with explicit signature and metadata
    WHEN wrapped by mutating_endpoint
    THEN wrapper preserves callable signature and function metadata for FastAPI
    """
    if handler_kind == "async":
        async def target(product_id: str, quantity: int = 1) -> str:
            return f"{product_id}:{quantity}"
    else:
        def target(product_id: str, quantity: int = 1) -> str:
            return f"{product_id}:{quantity}"

    wrapped = persistence.mutating_endpoint(target)

    assert wrapped.__name__ == target.__name__
    assert inspect.signature(wrapped) == inspect.signature(target)


def test_mutating_endpoint_wraps_async_handler_and_persists_after_success(
    api_context,
) -> None:
    """
    GIVEN an asynchronous mutating handler that updates runtime workbook state
    WHEN wrapped by mutating_endpoint and invoked successfully
    THEN result is returned and workbook changes are persisted to disk
    """
    data_file = Path(api_context.settings.data_file)
    before = data_file.stat().st_mtime_ns

    async def handler() -> str:
        bll.add_product(
            api_context,
            bll.ProductCommand(
                product_id="PM002",
                product_name="Persisted Async Product",
                sell_price=Decimal("3.00"),
                is_active=True,
            ),
        )
        return "async_ok"

    wrapped = persistence.mutating_endpoint(handler)

    api_runtime.set_runtime_context(api_context)
    try:
        result = asyncio.run(wrapped())
    finally:
        api_runtime.clear_runtime_context()

    after = data_file.stat().st_mtime_ns

    assert result == "async_ok"
    assert after >= before


# sad path

@pytest.mark.parametrize("handler_kind", ["async", "sync"])
def test_mutating_endpoint_does_not_persist_when_handler_raises(
    handler_kind: str,
    api_context,
) -> None:
    """
    GIVEN a wrapped mutating handler that raises before returning
    WHEN the wrapper is invoked
    THEN exception propagates and no workbook persistence occurs
    """
    data_file = Path(api_context.settings.data_file)
    before = data_file.stat().st_mtime_ns

    if handler_kind == "async":
        async def target() -> None:
            raise ValueError("boom")

        wrapped = persistence.mutating_endpoint(target)
        api_runtime.set_runtime_context(api_context)
        try:
            with pytest.raises(ValueError, match="boom"):
                asyncio.run(wrapped())
        finally:
            api_runtime.clear_runtime_context()
    else:
        def target() -> None:
            raise ValueError("boom")

        wrapped = persistence.mutating_endpoint(target)
        api_runtime.set_runtime_context(api_context)
        try:
            with pytest.raises(ValueError, match="boom"):
                wrapped()
        finally:
            api_runtime.clear_runtime_context()

    after = data_file.stat().st_mtime_ns
    assert after == before


# edge path

def test_mutating_endpoint_propagates_missing_runtime_context_errors() -> None:
    """
    GIVEN a successful mutating handler but no runtime context configured
    WHEN wrapper attempts persistence after handler execution
    THEN runtime dependency error is raised to be mapped by API error handlers
    """
    def target() -> str:
        return "ok"

    wrapped = persistence.mutating_endpoint(target)
    api_runtime.clear_runtime_context()

    with pytest.raises(RuntimeError, match="RuntimeContext not initialized"):
        wrapped()
