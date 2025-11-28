"""Dependency injection providers for the CAAD ERP API.

This module provides FastAPI dependencies for accessing shared application
state, particularly the RuntimeContext singleton initialized at startup.
"""

import typing as t

from caad_erp import bll

# Module-level reference to the RuntimeContext singleton.
# Initialized by the lifespan handler in app.py
_runtime_context: t.Optional[bll.RuntimeContext] = None


def set_runtime_context(context: bll.RuntimeContext) -> None:
    """Store the RuntimeContext singleton for dependency injection.

    This function is called by the lifespan handler during application startup
    to make the context available to route handlers.

    Args:
        context: The initialized RuntimeContext instance.
    """
    global _runtime_context
    _runtime_context = context


def get_runtime_context() -> bll.RuntimeContext:
    """Retrieve the shared RuntimeContext instance.

    This function serves as a FastAPI dependency, providing route handlers
    with access to the application's runtime state.

    Returns:
        The RuntimeContext singleton initialized at startup.

    Raises:
        RuntimeError: If the context has not been initialized.
    """
    if _runtime_context is None:
        raise RuntimeError("RuntimeContext not initialized")
    return _runtime_context


def clear_runtime_context() -> None:
    """Clear the RuntimeContext singleton.

    This function is called during application shutdown to release resources.
    """
    global _runtime_context
    _runtime_context = None
