"""Core HTTP client that ships traces to the AgentOps REST API."""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

_global_client: Optional["AgentOpsClient"] = None


def init(
    api_url: str = "http://localhost:8080",
    agent_id: str = "",
    auto_patch: bool = True,
    timeout: int = 5,
) -> "AgentOpsClient":
    """
    Initialize the SDK and (optionally) auto-patch OpenAI + Anthropic clients.

    Args:
        api_url:    Base URL of your AgentOps API, e.g. "http://localhost:8080"
        agent_id:   The agent UUID shown in the Agents page of the dashboard.
                    If empty, a new agent named "python-agent" is auto-created.
        auto_patch: When True, monkey-patches openai and anthropic if installed.
        timeout:    HTTP request timeout in seconds.
    """
    global _global_client
    client = AgentOpsClient(api_url=api_url, agent_id=agent_id, timeout=timeout)
    _global_client = client

    if auto_patch:
        try:
            from .patches import patch_openai
            patch_openai(client)
        except ImportError:
            pass
        try:
            from .patches import patch_anthropic
            patch_anthropic(client)
        except ImportError:
            pass

    return client


def get_client() -> Optional["AgentOpsClient"]:
    return _global_client


class AgentOpsClient:
    def __init__(self, api_url: str, agent_id: str, timeout: int = 5):
        self.api_url = api_url.rstrip("/")
        self.agent_id = agent_id
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})
        self._lock = threading.Lock()

        # Auto-create agent if no ID given
        if not self.agent_id:
            self.agent_id = self._ensure_agent("python-agent", "llm", "1.0.0")

    # ── Public API ──────────────────────────────────────────────────────────

    def start_run(self, name: str = "agent-run") -> "Run":
        """Start a new agent run. Returns a Run context manager."""
        return Run(client=self, name=name)

    def record_trace(
        self,
        name: str,
        status: str,
        duration_ms: int,
        attributes: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Send a single trace to AgentOps.

        Args:
            name:        Human-readable span name, e.g. "openai.chat.gpt-4o"
            status:      "ok" | "error"
            duration_ms: How long the call took
            attributes:  Any extra key/value metadata (model, tokens, prompt, etc.)
            run_id:      Group multiple spans under one logical run

        Returns:
            The created trace ID, or None on failure.
        """
        payload = {
            "agent_id":    self.agent_id,
            "run_id":      run_id or str(uuid.uuid4()),
            "trace_id":    str(uuid.uuid4()),
            "name":        name,
            "status":      status,
            "duration_ms": duration_ms,
            "start_time":  datetime.now(timezone.utc).isoformat(),
            "attributes":  attributes or {},
        }
        try:
            resp = self._session.post(
                f"{self.api_url}/api/v1/traces",
                json=payload,
                timeout=self.timeout,
            )
            if resp.status_code == 201:
                return resp.json().get("trace", {}).get("id")
        except requests.RequestException:
            pass  # Never crash the agent — tracing is best-effort
        return None

    # ── Internal helpers ────────────────────────────────────────────────────

    def _ensure_agent(self, name: str, agent_type: str, version: str) -> str:
        """Create an agent in the dashboard and return its ID."""
        try:
            # Try to find existing
            resp = self._session.get(
                f"{self.api_url}/api/v1/agents", timeout=self.timeout
            )
            if resp.ok:
                for a in resp.json().get("agents", []):
                    if a.get("name") == name:
                        return a["id"]

            # Create new
            resp = self._session.post(
                f"{self.api_url}/api/v1/agents",
                json={"name": name, "type": agent_type, "version": version},
                timeout=self.timeout,
            )
            if resp.ok:
                return resp.json()["agent"]["id"]
        except requests.RequestException:
            pass
        return str(uuid.uuid4())  # Fallback: use a random ID


class Run:
    """
    Context manager for grouping multiple LLM calls under one logical run.

    Usage:
        with agentops.get_client().start_run("my-pipeline") as run:
            # all traces recorded inside inherit run.run_id
            result = openai_client.chat.completions.create(...)
    """

    def __init__(self, client: AgentOpsClient, name: str):
        self._client = client
        self.name = name
        self.run_id = str(uuid.uuid4())
        self._start = time.monotonic()
        # Push run_id into thread-local so patches can pick it up automatically
        _run_context.run_id = self.run_id

    def __enter__(self) -> "Run":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        _run_context.run_id = None
        return False  # Don't suppress exceptions

    def record(
        self,
        name: str,
        status: str,
        duration_ms: int,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        return self._client.record_trace(
            name=name,
            status=status,
            duration_ms=duration_ms,
            attributes=attributes,
            run_id=self.run_id,
        )


# Thread-local storage so nested calls can pick up the active run_id
_run_context = threading.local()


def _current_run_id() -> Optional[str]:
    return getattr(_run_context, "run_id", None)
