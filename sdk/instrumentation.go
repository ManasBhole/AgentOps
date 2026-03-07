package agentops

import (
	"context"
	"fmt"
	"time"
)

// InstrumentAgent wraps an agent function with tracing
func InstrumentAgent(tracer *AgentTracer, agentID, agentType string, fn func(context.Context, map[string]interface{}) (interface{}, error)) func(context.Context, map[string]interface{}) (interface{}, error) {
	return func(ctx context.Context, input map[string]interface{}) (interface{}, error) {
		runID, ctx := tracer.StartAgentRun(ctx, agentID, agentType, input)
		
		result, err := fn(ctx, input)
		
		tracer.EndAgentRun(runID, err == nil, result, err)
		return result, err
	}
}

// InstrumentLLM wraps an LLM call with tracing
func InstrumentLLM(tracer *AgentTracer, provider string, fn func(context.Context, string, map[string]interface{}) (interface{}, error)) func(context.Context, string, map[string]interface{}) (interface{}, error) {
	return func(ctx context.Context, prompt string, params map[string]interface{}) (interface{}, error) {
		model := "unknown"
		if m, ok := params["model"].(string); ok {
			model = m
		}

		startTime := time.Now()
		result, err := fn(ctx, prompt, params)
		latencyMs := float64(time.Since(startTime).Nanoseconds()) / 1e6

		var responseStr *string
		var tokensUsed *int
		var cost *float64

		if result != nil {
			s := truncateString(fmt.Sprintf("%v", result), 1000)
			responseStr = &s
		}

		// Extract tokens and cost from result if available
		if resultMap, ok := result.(map[string]interface{}); ok {
			if tokens, ok := resultMap["tokens_used"].(int); ok {
				tokensUsed = &tokens
			}
			if c, ok := resultMap["cost"].(float64); ok {
				cost = &c
			}
		}

		tracer.TraceLLMCall(ctx, provider, model, prompt, responseStr, tokensUsed, cost, &latencyMs, err)
		
		return result, err
	}
}
