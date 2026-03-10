"""Decorators for manual instrumentation when auto-patching isn't enough."""

from __future__ import annotations

import functools
import time
from typing import Any, Callable, Optional

from .client import _current_run_id, get_client


def trace_agent(name: Optional[str] = None):
    """
    Decorator that traces an entire agent function as a single span.

    Usage:
        @agentops.trace_agent("research-pipeline")
        def run_agent(query: str) -> str:
            ...
    """
    def decorator(fn: Callable) -> Callable:
        span_name = name or fn.__name__

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            client = get_client()
            start = time.monotonic()
            error = None
            try:
                result = fn(*args, **kwargs)
                return result
            except Exception as e:
                error = e
                raise
            finally:
                if client:
                    duration_ms = int((time.monotonic() - start) * 1000)
                    client.record_trace(
                        name=f"agent.{span_name}",
                        status="error" if error else "ok",
                        duration_ms=duration_ms,
                        attributes={"agent.error": str(error)} if error else {},
                        run_id=_current_run_id(),
                    )

        return wrapper
    return decorator


def trace_tool(name: Optional[str] = None):
    """
    Decorator that traces a tool/function call.

    Usage:
        @agentops.trace_tool("web-search")
        def search(query: str) -> list:
            ...
    """
    def decorator(fn: Callable) -> Callable:
        span_name = name or fn.__name__

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            client = get_client()
            start = time.monotonic()
            error = None
            try:
                result = fn(*args, **kwargs)
                return result
            except Exception as e:
                error = e
                raise
            finally:
                if client:
                    duration_ms = int((time.monotonic() - start) * 1000)
                    attrs: dict[str, Any] = {}
                    if args:
                        attrs["tool.input"] = str(args[0])[:500]
                    if error:
                        attrs["tool.error"] = str(error)
                    client.record_trace(
                        name=f"tool.{span_name}",
                        status="error" if error else "ok",
                        duration_ms=duration_ms,
                        attributes=attrs,
                        run_id=_current_run_id(),
                    )

        return wrapper
    return decorator
