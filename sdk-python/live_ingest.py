"""
Live ingestion demo — sends real traces, agents, and incidents to AgentOps API.
No LLM API key required. Simulates what instrumented agents produce in production.
"""
import random
import time
import uuid
from datetime import datetime, timezone

import agentops_sdk as agentops

API_URL = "http://localhost:8080"

# ── Agent profiles ──────────────────────────────────────────────────────────
AGENT_PROFILES = [
    {"name": "research-agent",         "type": "llm",          "version": "2.1.0"},
    {"name": "code-review-bot",        "type": "tool-use",     "version": "1.4.2"},
    {"name": "customer-support-ai",    "type": "multi-agent",  "version": "3.0.1"},
    {"name": "data-pipeline-agent",    "type": "rag",          "version": "1.2.0"},
    {"name": "alert-triage-agent",     "type": "llm",          "version": "1.3.0"},
]

# ── Pipeline templates ──────────────────────────────────────────────────────
PIPELINES = {
    "research-agent": [
        ("tool.web-search",            "ok",    (80, 320)),
        ("tool.document-retrieval",    "ok",    (40, 120)),
        ("openai.chat.gpt-4o",         "ok",    (600, 2800)),
        ("tool.citation-formatter",    "ok",    (20, 60)),
    ],
    "code-review-bot": [
        ("tool.git-diff",              "ok",    (30, 80)),
        ("tool.static-analysis",       "ok",    (200, 800)),
        ("openai.chat.gpt-4o-mini",    "ok",    (300, 1200)),
        ("tool.comment-poster",        "ok",    (50, 150)),
    ],
    "customer-support-ai": [
        ("tool.ticket-lookup",         "ok",    (40, 100)),
        ("openai.chat.gpt-4o",         "ok",    (500, 2000)),
        ("tool.kb-search",             "ok",    (60, 180)),
        ("anthropic.messages.claude-3-5-sonnet-20241022", "ok", (400, 1800)),
        ("tool.email-sender",          "ok",    (80, 200)),
    ],
    "data-pipeline-agent": [
        ("tool.db-query",              "ok",    (100, 500)),
        ("tool.data-transform",        "ok",    (200, 1000)),
        ("openai.embeddings.text-embedding-3-small", "ok", (50, 200)),
        ("tool.vector-upsert",         "ok",    (80, 300)),
    ],
    "alert-triage-agent": [
        ("tool.log-fetch",             "ok",    (60, 200)),
        ("tool.metric-query",          "ok",    (40, 150)),
        ("openai.chat.gpt-4o",         "ok",    (600, 3000)),
        ("tool.slack-notify",          "ok",    (30, 80)),
    ],
}

# Error injection scenarios
ERROR_SCENARIOS = [
    {"span": "openai.chat.gpt-4o",       "error": "rate_limit_exceeded: Too many requests",        "pct": 0.06},
    {"span": "tool.db-query",            "error": "timeout: connection timeout after 30s",          "pct": 0.05},
    {"span": "tool.vector-upsert",       "error": "tool_failure: upstream service unavailable",     "pct": 0.04},
    {"span": "tool.web-search",          "error": "network_error: DNS resolution failed",           "pct": 0.03},
    {"span": "anthropic.messages.claude-3-5-sonnet-20241022", "error": "context_length_exceeded: prompt too long", "pct": 0.05},
]

def maybe_inject_error(span_name: str) -> tuple[str, dict]:
    for scenario in ERROR_SCENARIOS:
        if scenario["span"] == span_name and random.random() < scenario["pct"]:
            return "error", {"error": scenario["error"]}
    return "ok", {}


def simulate_agent(client, agent_id: str, agent_name: str, runs: int = 3):
    pipeline = PIPELINES.get(agent_name, PIPELINES["research-agent"])

    for _ in range(runs):
        run_id = str(uuid.uuid4())
        run_has_error = False

        for span_name, _, (lo, hi) in pipeline:
            duration_ms = random.randint(lo, hi)
            status, extra_attrs = maybe_inject_error(span_name)

            # Build realistic attributes per span type
            attrs: dict = {}
            if span_name.startswith("openai.chat"):
                model = span_name.split(".")[-1]
                prompt_tokens = random.randint(200, 2000)
                completion_tokens = random.randint(50, 500)
                attrs = {
                    "llm.provider": "openai",
                    "llm.model": model,
                    "llm.tokens_prompt": prompt_tokens,
                    "llm.tokens_completion": completion_tokens,
                    "llm.tokens_total": prompt_tokens + completion_tokens,
                    "llm.cost_usd": round((prompt_tokens * 0.000005 + completion_tokens * 0.000015), 6),
                }
            elif span_name.startswith("anthropic."):
                model = span_name.split(".")[-1]
                attrs = {
                    "llm.provider": "anthropic",
                    "llm.model": model,
                    "llm.tokens_prompt": random.randint(300, 2500),
                    "llm.tokens_completion": random.randint(100, 800),
                }
            elif span_name.startswith("openai.embeddings"):
                attrs = {
                    "llm.provider": "openai",
                    "llm.model": "text-embedding-3-small",
                    "llm.tokens_total": random.randint(50, 300),
                    "embedding.dimensions": 1536,
                }
            elif span_name.startswith("tool."):
                tool = span_name.split(".", 1)[1]
                attrs = {"tool.name": tool, "tool.duration_ms": duration_ms}

            attrs.update(extra_attrs)
            if status == "error":
                run_has_error = True

            client.record_trace(
                name=span_name,
                status=status,
                duration_ms=duration_ms,
                attributes=attrs,
                run_id=run_id,
            )

        # Small delay between spans so timestamps look natural
        time.sleep(random.uniform(0.05, 0.2))


def main():
    print("🚀 AgentOps Live Ingestion")
    print(f"   Target: {API_URL}\n")

    # Init SDK (creates "python-agent" if no ID given — we pass "" to auto-detect)
    # We manage agent IDs ourselves below
    import requests
    session = requests.Session()
    session.headers["Content-Type"] = "application/json"

    # ── Step 1: resolve or create agents ────────────────────────────────────
    existing = {a["name"]: a["id"] for a in session.get(f"{API_URL}/api/v1/agents").json().get("agents", [])}

    agent_ids: dict[str, str] = {}
    for profile in AGENT_PROFILES:
        name = profile["name"]
        if name in existing:
            agent_ids[name] = existing[name]
            print(f"   ✓ Agent exists:  {name} ({existing[name][:8]}…)")
        else:
            resp = session.post(f"{API_URL}/api/v1/agents", json=profile)
            if resp.ok:
                aid = resp.json()["agent"]["id"]
                agent_ids[name] = aid
                print(f"   + Created agent: {name} ({aid[:8]}…)")

    print()

    # ── Step 2: stream traces for each agent ─────────────────────────────────
    total_traces = 0
    for profile in AGENT_PROFILES:
        name = profile["name"]
        aid  = agent_ids[name]
        runs = random.randint(4, 8)

        # Create a per-agent SDK client
        client = agentops.AgentOpsClient(api_url=API_URL, agent_id=aid)
        simulate_agent(client, aid, name, runs=runs)

        spans_per_run = len(PIPELINES.get(name, PIPELINES["research-agent"]))
        total_traces += runs * spans_per_run
        print(f"   ✓ {name}: {runs} runs × {spans_per_run} spans = {runs * spans_per_run} traces")

    print(f"\n   Total traces sent: {total_traces}")
    print("\n✅ Done! Open http://localhost:3000 to see live data.")
    print("   Traces page    → real spans with LLM metadata")
    print("   Incidents page → auto-triggered from errors above")


if __name__ == "__main__":
    main()
