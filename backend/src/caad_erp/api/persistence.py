"""Persistence helpers for API mutation endpoints.

The decorator in this module wraps mutating route handlers so successful
requests automatically persist workbook changes to disk. Exceptions are left
untouched so the API layer's centralized error handling continues to map them
to HTTP responses.
"""

import functools
import inspect
import typing as t

from caad_erp import bll

from . import runtime

P = t.ParamSpec("P")
R = t.TypeVar("R")


def mutating_endpoint[**P, R](handler: t.Callable[P, R]) -> t.Callable[P, R]:
    """Persist the runtime context after a successful mutating handler.

    Args:
        handler: Route function to wrap.

    Returns:
        Callable preserving the original signature while persisting on success.
    """

    if inspect.iscoroutinefunction(handler):

        @functools.wraps(handler)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            result = await handler(*args, **kwargs)
            bll.persist_context(runtime.get_runtime_context())
            return result

        async_wrapper.__signature__ = inspect.signature(handler)
        return t.cast(t.Callable[P, R], async_wrapper)

    @functools.wraps(handler)
    def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        result = handler(*args, **kwargs)
        bll.persist_context(runtime.get_runtime_context())
        return result

    sync_wrapper.__signature__ = inspect.signature(handler)
    return sync_wrapper
