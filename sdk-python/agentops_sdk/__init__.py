"""
AgentOps Python SDK
====================
Auto-instruments OpenAI, Anthropic, and any LLM call to send real traces
to your AgentOps API.

Quickstart:
    import agentops_sdk as agentops

    agentops.init(
        api_url="http://localhost:8080",
        agent_id="<your-agent-id-from-dashboard>",
    )

    # Now use OpenAI / Anthropic normally — every call is traced automatically
    from openai import OpenAI
    client = OpenAI()
    resp = client.chat.completions.create(model="gpt-4o", messages=[...])
"""

from .client import AgentOpsClient, init, get_client
from .decorators import trace_agent, trace_tool
from .patches import patch_openai, patch_anthropic

__all__ = [
    "init",
    "get_client",
    "AgentOpsClient",
    "trace_agent",
    "trace_tool",
    "patch_openai",
    "patch_anthropic",
]
