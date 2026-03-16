"""Persistence helpers for API mutation endpoints.

This module defines a lightweight marker used to flag handlers that mutate
workbook state. The FastAPI application middleware checks this marker to
decide whether it should persist the runtime context after a successful
response.
"""

import typing as t

_MUTATING_ENDPOINT_ATTR = "__caad_mutating_endpoint__"


def mutating_endpoint(handler: t.Callable[..., t.Any]) -> t.Callable[..., t.Any]:
    """Mark an API handler as mutating workbook state.

    Args:
        handler: Route function to mark.

    Returns:
        The same callable with a mutation marker attribute attached.
    """
    setattr(handler, _MUTATING_ENDPOINT_ATTR, True)
    return handler


def is_mutating_endpoint(handler: t.Any) -> bool:
    """Return whether the supplied handler is marked as mutating."""
    return bool(handler is not None and getattr(handler, _MUTATING_ENDPOINT_ATTR, False))
