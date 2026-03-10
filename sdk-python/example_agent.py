"""
Example: Real agent that sends live traces to AgentOps.

Setup:
    cd sdk-python
    pip install -e ".[openai]"   # or [anthropic] or [all]
    pip install openai            # if not already installed
    export OPENAI_API_KEY=sk-...

    # Make sure your AgentOps API is running:
    # cd ../api && go run .

Then run:
    python example_agent.py
"""

import os
import agentops_sdk as agentops

# ── 1. Initialize SDK — this auto-instruments OpenAI/Anthropic ──────────────
agentops.init(
    api_url="http://localhost:8080",
    # Leave agent_id blank to auto-create a "python-agent" in the dashboard,
    # or paste the UUID from your Agents page:
    agent_id=os.getenv("AGENTOPS_AGENT_ID", ""),
)


# ── 2. Optional: manual instrumentation with decorators ─────────────────────
@agentops.trace_tool("web-search")
def fake_web_search(query: str) -> list[str]:
    """Simulates a tool call (replace with real search)."""
    import time, random
    time.sleep(random.uniform(0.05, 0.3))
    return [f"Result {i} for: {query}" for i in range(3)]


@agentops.trace_agent("research-agent")
def run_research_agent(question: str) -> str:
    """A simple research agent pipeline."""
    from openai import OpenAI

    client = OpenAI()

    # Tool call — traced automatically via @trace_tool
    search_results = fake_web_search(question)
    context = "\n".join(search_results)

    # LLM call — traced automatically via OpenAI patch
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a research assistant."},
            {"role": "user",   "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
        max_tokens=200,
    )
    return response.choices[0].message.content


# ── 3. Run the agent inside a logical "Run" (groups all spans together) ──────
if __name__ == "__main__":
    questions = [
        "What are the latest breakthroughs in AI agent architectures?",
        "How do circuit breakers improve distributed system reliability?",
        "What is OpenTelemetry and why do engineers use it?",
    ]

    for q in questions:
        print(f"\n>> {q}")
        # All LLM + tool calls inside this block share the same run_id
        with agentops.get_client().start_run("research-pipeline") as run:
            answer = run_research_agent(q)
            print(f"   {answer[:120]}...")

    print("\n✅ Traces sent to AgentOps — open http://localhost:3000/traces to see them")
