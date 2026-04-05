package main

import (
	"context"
	"fmt"
	"time"

	orion "github.com/ManasBhole/AgentOps/sdk"
)

func main() {
	// Initialize tracer
	tracer, err := orion.NewAgentTracer(orion.Config{
		ServiceName:         "example-agent",
		Endpoint:            "localhost:4317",
		CollectInfraMetrics: true,
	})
	if err != nil {
		panic(err)
	}

	ctx := context.Background()

	// Start an agent run
	runID, ctx := tracer.StartAgentRun(ctx, "agent-123", "customer-support", map[string]interface{}{
		"user_query": "How do I reset my password?",
	})

	// Trace reasoning step
	tracer.TraceReasoningStep(ctx, "analyze_query", "User is asking about password reset", nil)

	// Trace tool call
	start := time.Now()
	// Simulate tool call
	time.Sleep(100 * time.Millisecond)
	duration := float64(time.Since(start).Nanoseconds()) / 1e6
	tracer.TraceToolCall(ctx, "database_query", map[string]interface{}{
		"query": "SELECT * FROM users WHERE email = ?",
	}, map[string]interface{}{
		"rows": 1,
	}, &duration, nil)

	// Trace LLM call
	start = time.Now()
	// Simulate LLM call
	time.Sleep(200 * time.Millisecond)
	latency := float64(time.Since(start).Nanoseconds()) / 1e6
	tokens := 150
	cost := 0.002
	response := "To reset your password, click the 'Forgot Password' link on the login page."
	tracer.TraceLLMCall(ctx, "openai", "gpt-4", "Generate password reset instructions", &response, &tokens, &cost, &latency, nil)

	// End agent run
	tracer.EndAgentRun(runID, true, map[string]interface{}{
		"response": response,
	}, nil)

	fmt.Println("Agent run completed:", runID)
}
