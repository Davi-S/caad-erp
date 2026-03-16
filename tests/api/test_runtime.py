import pytest

from caad_erp.api import runtime


# happy path
def test_set_runtime_context_stores_context_for_dependency_resolution() -> None:
    """
    GIVEN a valid RuntimeContext instance
    WHEN set_runtime_context is called
    THEN get_runtime_context returns the same stored singleton instance
    """
    context = object()
    runtime.clear_runtime_context()

    runtime.set_runtime_context(context)

    assert runtime.get_runtime_context() is context


def test_clear_runtime_context_removes_previously_set_singleton() -> None:
    """
    GIVEN a runtime context singleton that has already been set
    WHEN clear_runtime_context is called
    THEN singleton state is reset for future startup initialization
    """
    runtime.set_runtime_context(object())

    runtime.clear_runtime_context()

    with pytest.raises(RuntimeError, match="RuntimeContext not initialized"):
        runtime.get_runtime_context()


# sad path
def test_get_runtime_context_raises_runtime_error_when_uninitialized() -> None:
    """
    GIVEN no runtime context has been initialized yet
    WHEN get_runtime_context is requested by dependency injection
    THEN RuntimeError is raised indicating startup has not completed
    """
    runtime.clear_runtime_context()

    with pytest.raises(RuntimeError, match="RuntimeContext not initialized"):
        runtime.get_runtime_context()


# edge path
def test_set_runtime_context_overwrites_previous_singleton_reference() -> None:
    """
    GIVEN an existing runtime singleton and a newer replacement context
    WHEN set_runtime_context is called again
    THEN latest context replaces previous reference deterministically
    """
    first = object()
    second = object()
    runtime.clear_runtime_context()
    runtime.set_runtime_context(first)

    runtime.set_runtime_context(second)

    assert runtime.get_runtime_context() is second
