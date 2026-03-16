import pytest
import asyncio
import inspect

from caad_erp.api import persistence


# happy path
def test_mutating_endpoint_wraps_sync_handler_and_persists_after_success() -> None:
    """
    GIVEN a synchronous mutating route handler that succeeds
    WHEN wrapped by mutating_endpoint and invoked
    THEN original result is returned and context persistence is triggered once
    """
    calls: list[str] = []

    def handler(value: int) -> int:
        calls.append(f"handler:{value}")
        return value + 1

    wrapped = persistence.mutating_endpoint(handler)

    original_get_context = persistence.runtime.get_runtime_context
    original_persist = persistence.bll.persist_context
    try:
        persistence.runtime.get_runtime_context = lambda: "ctx"
        persistence.bll.persist_context = lambda ctx: calls.append(f"persist:{ctx}")

        result = wrapped(9)
    finally:
        persistence.runtime.get_runtime_context = original_get_context
        persistence.bll.persist_context = original_persist

    assert result == 10
    assert calls == ["handler:9", "persist:ctx"]


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


# sad path
@pytest.mark.parametrize("handler_kind", ["async", "sync"])
def test_mutating_endpoint_does_not_persist_when_handler_raises(handler_kind: str) -> None:
    """
    GIVEN a wrapped mutating handler that raises before returning
    WHEN the wrapper is invoked
    THEN the exception propagates and no persistence call is performed
    """
    persisted: list[str] = []

    if handler_kind == "async":
        async def target() -> None:
            raise ValueError("boom")

        wrapped = persistence.mutating_endpoint(target)
        original_get_context = persistence.runtime.get_runtime_context
        original_persist = persistence.bll.persist_context
        try:
            persistence.runtime.get_runtime_context = lambda: "ctx"
            persistence.bll.persist_context = lambda ctx: persisted.append(str(ctx))
            with pytest.raises(ValueError, match="boom"):
                asyncio.run(wrapped())
        finally:
            persistence.runtime.get_runtime_context = original_get_context
            persistence.bll.persist_context = original_persist
    else:
        def target() -> None:
            raise ValueError("boom")

        wrapped = persistence.mutating_endpoint(target)
        original_get_context = persistence.runtime.get_runtime_context
        original_persist = persistence.bll.persist_context
        try:
            persistence.runtime.get_runtime_context = lambda: "ctx"
            persistence.bll.persist_context = lambda ctx: persisted.append(str(ctx))
            with pytest.raises(ValueError, match="boom"):
                wrapped()
        finally:
            persistence.runtime.get_runtime_context = original_get_context
            persistence.bll.persist_context = original_persist

    assert persisted == []


# edge path
def test_mutating_endpoint_propagates_persist_context_failure_after_successful_handler() -> None:
    """
    GIVEN a successful mutating handler but failing persistence operation
    WHEN wrapped handler returns and persistence runs
    THEN persistence exception is propagated to the API error layer
    """
    calls: list[str] = []

    def target() -> str:
        calls.append("handler")
        return "ok"

    wrapped = persistence.mutating_endpoint(target)

    original_get_context = persistence.runtime.get_runtime_context
    original_persist = persistence.bll.persist_context
    try:
        persistence.runtime.get_runtime_context = lambda: "ctx"

        def _raise_persist(_context):
            calls.append("persist")
            raise OSError("disk error")

        persistence.bll.persist_context = _raise_persist
        with pytest.raises(OSError, match="disk error"):
            wrapped()
    finally:
        persistence.runtime.get_runtime_context = original_get_context
        persistence.bll.persist_context = original_persist

    assert calls == ["handler", "persist"]
