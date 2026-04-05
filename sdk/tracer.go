package orion

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

// AgentTracer provides OpenTelemetry-native tracing for AI agents
type AgentTracer struct {
	tracer          trace.Tracer
	serviceName     string
	endpoint        string
	apiKey          string
	collectInfra    bool
	runContexts     map[string]*RunContext
}

// RunContext holds context for an agent run
type RunContext struct {
	RunID    string
	AgentID  string
	Span     trace.Span
	StartTime time.Time
}

// Config for AgentTracer
type Config struct {
	ServiceName      string
	Endpoint         string
	APIKey           string
	CollectInfraMetrics bool
}

// NewAgentTracer creates a new AgentTracer instance
func NewAgentTracer(config Config) (*AgentTracer, error) {
	if config.Endpoint == "" {
		config.Endpoint = "localhost:4317"
	}

	// Create OTLP exporter
	exporter, err := otlptracegrpc.New(
		context.Background(),
		otlptracegrpc.WithEndpoint(config.Endpoint),
		otlptracegrpc.WithInsecure(), // Use WithTLSCredentials in production
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP exporter: %w", err)
	}

	// Create resource
	res, err := resource.New(
		context.Background(),
		resource.WithAttributes(
			attribute.String("service.name", config.ServiceName),
			attribute.String("service.version", "0.1.0"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)

	tracer := otel.Tracer(config.ServiceName)

	return &AgentTracer{
		tracer:       tracer,
		serviceName:  config.ServiceName,
		endpoint:     config.Endpoint,
		apiKey:       config.APIKey,
		collectInfra: config.CollectInfraMetrics,
		runContexts:  make(map[string]*RunContext),
	}, nil
}

// StartAgentRun starts tracing an agent execution run
func (at *AgentTracer) StartAgentRun(ctx context.Context, agentID, agentType string, inputData map[string]interface{}) (string, context.Context) {
	runID := uuid.New().String()

	ctx, span := at.tracer.Start(ctx, fmt.Sprintf("agent.run.%s", agentType),
		trace.WithAttributes(
			attribute.String("agent.id", agentID),
			attribute.String("agent.type", agentType),
			attribute.String("agent.run_id", runID),
			attribute.String("agent.input", fmt.Sprintf("%v", inputData)),
		),
	)

	at.runContexts[runID] = &RunContext{
		RunID:    runID,
		AgentID:  agentID,
		Span:     span,
		StartTime: time.Now(),
	}

	return runID, ctx
}

// TraceReasoningStep traces a reasoning step in the agent's thought process
func (at *AgentTracer) TraceReasoningStep(ctx context.Context, stepName, reasoning string, confidence *float64) {
	attrs := []attribute.KeyValue{
		attribute.String("reasoning.step", stepName),
		attribute.String("reasoning.content", reasoning),
	}

	if confidence != nil {
		attrs = append(attrs, attribute.Float64("reasoning.confidence", *confidence))
	}

	_, span := at.tracer.Start(ctx, fmt.Sprintf("agent.reasoning.%s", stepName),
		trace.WithAttributes(attrs...),
	)
	defer span.End()
}

// TraceToolCall traces a tool/function call made by the agent
func (at *AgentTracer) TraceToolCall(ctx context.Context, toolName string, toolInput map[string]interface{}, toolOutput interface{}, durationMs *float64, err error) {
	attrs := []attribute.KeyValue{
		attribute.String("tool.name", toolName),
		attribute.String("tool.input", fmt.Sprintf("%v", toolInput)),
	}

	if toolOutput != nil {
		attrs = append(attrs, attribute.String("tool.output", fmt.Sprintf("%v", toolOutput)))
	}
	if durationMs != nil {
		attrs = append(attrs, attribute.Float64("tool.duration_ms", *durationMs))
	}
	if err != nil {
		attrs = append(attrs, attribute.String("tool.error", err.Error()))
	}

	ctx, span := at.tracer.Start(ctx, fmt.Sprintf("agent.tool.%s", toolName),
		trace.WithAttributes(attrs...),
	)
	defer span.End()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	} else {
		span.SetStatus(codes.Ok, "")
	}
}

// TraceLLMCall traces an LLM API call
func (at *AgentTracer) TraceLLMCall(ctx context.Context, provider, model, prompt string, response *string, tokensUsed *int, cost *float64, latencyMs *float64, err error) {
	attrs := []attribute.KeyValue{
		attribute.String("llm.provider", provider),
		attribute.String("llm.model", model),
		attribute.String("llm.prompt", truncateString(prompt, 1000)),
	}

	if response != nil {
		attrs = append(attrs, attribute.String("llm.response", truncateString(*response, 1000)))
	}
	if tokensUsed != nil {
		attrs = append(attrs, attribute.Int("llm.tokens_used", *tokensUsed))
	}
	if cost != nil {
		attrs = append(attrs, attribute.Float64("llm.cost", *cost))
	}
	if latencyMs != nil {
		attrs = append(attrs, attribute.Float64("llm.latency_ms", *latencyMs))
	}
	if err != nil {
		attrs = append(attrs, attribute.String("llm.error", err.Error()))
	}

	ctx, span := at.tracer.Start(ctx, fmt.Sprintf("llm.call.%s.%s", provider, model),
		trace.WithAttributes(attrs...),
	)
	defer span.End()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	} else {
		span.SetStatus(codes.Ok, "")
	}
}

// TraceInfraMetric traces infrastructure metrics correlated with agent runs
func (at *AgentTracer) TraceInfraMetric(ctx context.Context, metricName string, value float64, unit string, labels map[string]string) {
	if !at.collectInfra {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.String("metric.name", metricName),
		attribute.Float64("metric.value", value),
		attribute.String("metric.unit", unit),
	}

	for k, v := range labels {
		attrs = append(attrs, attribute.String(fmt.Sprintf("metric.label.%s", k), v))
	}

	_, span := at.tracer.Start(ctx, fmt.Sprintf("infra.metric.%s", metricName),
		trace.WithAttributes(attrs...),
	)
	defer span.End()
}

// EndAgentRun ends an agent execution run
func (at *AgentTracer) EndAgentRun(runID string, success bool, output interface{}, err error) {
	runCtx, exists := at.runContexts[runID]
	if !exists {
		return
	}

	span := runCtx.Span
	span.SetAttributes(
		attribute.Bool("agent.success", success),
	)

	if output != nil {
		span.SetAttributes(attribute.String("agent.output", fmt.Sprintf("%v", output)))
	}
	if err != nil {
		span.SetAttributes(attribute.String("agent.error", err.Error()))
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	} else {
		span.SetStatus(codes.Ok, "")
	}

	span.End()
	delete(at.runContexts, runID)
}

// Helper function to truncate strings
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
