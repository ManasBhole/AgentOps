"""
Auto-instrumentation patches for OpenAI and Anthropic SDKs.
These wrap the actual API call methods to record traces without any
changes to user code.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .client import AgentOpsClient


def patch_openai(client: "AgentOpsClient") -> None:
    """Monkey-patch openai.OpenAI so every chat.completions.create() is traced."""
    try:
        import openai
    except ImportError:
        return

    original_create = openai.resources.chat.completions.Completions.create

    def traced_create(self_inner, *args, **kwargs):
        from .client import _current_run_id

        start = time.monotonic()
        error = None
        response = None
        try:
            response = original_create(self_inner, *args, **kwargs)
            return response
        except Exception as e:
            error = e
            raise
        finally:
            duration_ms = int((time.monotonic() - start) * 1000)
            model = kwargs.get("model", "unknown")
            messages = kwargs.get("messages", [])
            prompt_preview = ""
            if messages:
                last = messages[-1]
                content = last.get("content", "")
                prompt_preview = content[:500] if isinstance(content, str) else str(content)[:500]

            attrs: dict = {
                "llm.provider": "openai",
                "llm.model": model,
                "llm.prompt_preview": prompt_preview,
            }

            if response is not None:
                usage = getattr(response, "usage", None)
                if usage:
                    attrs["llm.tokens_prompt"]     = getattr(usage, "prompt_tokens", 0)
                    attrs["llm.tokens_completion"]  = getattr(usage, "completion_tokens", 0)
                    attrs["llm.tokens_total"]       = getattr(usage, "total_tokens", 0)
                choices = getattr(response, "choices", [])
                if choices:
                    msg = getattr(choices[0], "message", None)
                    if msg:
                        content = getattr(msg, "content", "") or ""
                        attrs["llm.response_preview"] = content[:500]

            if error:
                attrs["llm.error"] = str(error)

            client.record_trace(
                name=f"openai.chat.{model}",
                status="error" if error else "ok",
                duration_ms=duration_ms,
                attributes=attrs,
                run_id=_current_run_id(),
            )

    openai.resources.chat.completions.Completions.create = traced_create
    print("[AgentOps] OpenAI instrumented ✓")


def patch_anthropic(client: "AgentOpsClient") -> None:
    """Monkey-patch anthropic.Anthropic so every messages.create() is traced."""
    try:
        import anthropic
    except ImportError:
        return

    original_create = anthropic.resources.messages.Messages.create

    def traced_create(self_inner, *args, **kwargs):
        from .client import _current_run_id

        start = time.monotonic()
        error = None
        response = None
        try:
            response = original_create(self_inner, *args, **kwargs)
            return response
        except Exception as e:
            error = e
            raise
        finally:
            duration_ms = int((time.monotonic() - start) * 1000)
            model = kwargs.get("model", "unknown")
            messages = kwargs.get("messages", [])
            prompt_preview = ""
            if messages:
                last = messages[-1]
                content = last.get("content", "")
                prompt_preview = content[:500] if isinstance(content, str) else str(content)[:500]

            attrs: dict = {
                "llm.provider": "anthropic",
                "llm.model": model,
                "llm.prompt_preview": prompt_preview,
            }

            if response is not None:
                usage = getattr(response, "usage", None)
                if usage:
                    attrs["llm.tokens_prompt"]    = getattr(usage, "input_tokens", 0)
                    attrs["llm.tokens_completion"] = getattr(usage, "output_tokens", 0)
                content_blocks = getattr(response, "content", [])
                if content_blocks:
                    text = getattr(content_blocks[0], "text", "") or ""
                    attrs["llm.response_preview"] = text[:500]

            if error:
                attrs["llm.error"] = str(error)

            client.record_trace(
                name=f"anthropic.messages.{model}",
                status="error" if error else "ok",
                duration_ms=duration_ms,
                attributes=attrs,
                run_id=_current_run_id(),
            )

    anthropic.resources.messages.Messages.create = traced_create
    print("[AgentOps] Anthropic instrumented ✓")
