package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

type IncidentEngine struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewIncidentEngine(db *gorm.DB, logger *zap.Logger, hub *EventHub) *IncidentEngine {
	return &IncidentEngine{db: db, logger: logger, hub: hub}
}

// AnalyzeTrace inspects a trace and creates an incident if it represents an error.
func (ie *IncidentEngine) AnalyzeTrace(ctx context.Context, traceID string) error {
	var trace database.Trace
	if err := ie.db.WithContext(ctx).Where("trace_id = ?", traceID).First(&trace).Error; err != nil {
		return err
	}

	if trace.Status != "error" {
		return nil
	}

	// Deduplication: skip if an open incident already exists for this trace
	var existing database.Incident
	if err := ie.db.Where("trace_id = ? AND status != ?", traceID, "resolved").First(&existing).Error; err == nil {
		return nil
	}

	incident, err := ie.investigateError(ctx, &trace)
	if err != nil {
		return err
	}
	if incident != nil {
		ie.logger.Info("incident created",
			zap.String("incident_id", incident.ID),
			zap.String("severity", incident.Severity),
		)
	}
	return nil
}

func (ie *IncidentEngine) investigateError(ctx context.Context, trace *database.Trace) (*database.Incident, error) {
	relatedTraces, _ := ie.findRelatedTraces(ctx, trace)
	rootCause, suggestedFix, confidence := ie.analyzeRootCause(trace, relatedTraces)

	now := time.Now().UTC()
	incident := &database.Incident{
		ID:               fmt.Sprintf("inc_%d", now.UnixNano()),
		Title:            fmt.Sprintf("Agent Error: %s", trace.Name),
		Severity:         ie.determineSeverity(trace, len(relatedTraces)),
		Status:           "open",
		AgentID:          trace.AgentID,
		TraceID:          trace.TraceID,
		RootCause:        rootCause,
		SuggestedFix:     suggestedFix,
		Confidence:       confidence,
		CorrelatedTraces: strings.Join(relatedTraces, ","),
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := ie.db.Create(incident).Error; err != nil {
		return nil, err
	}

	// Broadcast to SSE subscribers
	if ie.hub != nil {
		ie.hub.Publish(Event{
			Type:      "incident.created",
			ID:        incident.ID,
			Title:     incident.Title,
			Severity:  incident.Severity,
			AgentID:   incident.AgentID,
			TraceID:   incident.TraceID,
			Timestamp: now,
			Data: map[string]any{
				"root_cause":    incident.RootCause,
				"suggested_fix": incident.SuggestedFix,
				"confidence":    incident.Confidence,
			},
		})
	}

	return incident, nil
}

// rcaPattern is a matching rule with its diagnosis.
type rcaPattern struct {
	match        func(trace *database.Trace, attrs string) bool
	rootCause    string
	suggestedFix string
	confidence   float64
}

var rcaPatterns = []rcaPattern{
	{
		match: func(t *database.Trace, attrs string) bool {
			return t.Duration > 30_000 && containsAny(attrs, "timeout", "deadline", "context canceled")
		},
		rootCause:    "Agent execution timed out — downstream service or LLM call exceeded the configured deadline.",
		suggestedFix: "Increase the agent timeout budget or add a retry with exponential back-off. Check downstream service latency.",
		confidence:   0.88,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return containsAny(attrs, "rate limit", "429", "too many requests", "quota exceeded")
		},
		rootCause:    "LLM or external API rate limit hit during agent execution.",
		suggestedFix: "Implement token-bucket throttling before LLM calls. Add jitter to retry logic and consider increasing API quota.",
		confidence:   0.92,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return containsAny(attrs, "tool_error", "tool failed", "tool call", "function_call")
		},
		rootCause:    "Agent tool call failed — a tool returned an error or produced an unexpected result.",
		suggestedFix: "Inspect tool input/output schemas. Add input validation and fallback behavior in the tool wrapper.",
		confidence:   0.85,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return containsAny(attrs, "oom", "out of memory", "memory pressure", "killed")
		},
		rootCause:    "Agent process or pod was terminated due to memory pressure.",
		suggestedFix: "Increase pod memory limits, reduce context window size, or stream large payloads instead of buffering.",
		confidence:   0.90,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return containsAny(attrs, "invalid json", "parse error", "unmarshal", "syntax error")
		},
		rootCause:    "LLM returned malformed output that the agent could not parse.",
		suggestedFix: "Add output validation with JSON mode. Implement a parse-and-retry loop with a stricter prompt.",
		confidence:   0.82,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return containsAny(attrs, "connection refused", "connection reset", "no such host", "dial tcp")
		},
		rootCause:    "Network connectivity failure — agent could not reach a required service.",
		suggestedFix: "Verify service DNS, firewall rules, and health checks. Add circuit-breaker around network calls.",
		confidence:   0.87,
	},
	{
		match: func(t *database.Trace, attrs string) bool {
			return t.Duration > 60_000
		},
		rootCause:    "Agent run exceeded 60 s — possible infinite loop or stalled reasoning chain.",
		suggestedFix: "Add a max-iterations guard and a hard wall-clock timeout. Review the agent's planning loop for cycles.",
		confidence:   0.75,
	},
}

func (ie *IncidentEngine) analyzeRootCause(trace *database.Trace, relatedTraces []string) (rootCause, suggestedFix string, confidence float64) {
	attrs := strings.ToLower(trace.Attributes + " " + trace.Events)

	for _, p := range rcaPatterns {
		if p.match(trace, attrs) {
			boost := 0.0
			if len(relatedTraces) >= 3 {
				boost = 0.05
			}
			conf := p.confidence + boost
			if conf > 0.99 {
				conf = 0.99
			}
			return p.rootCause, p.suggestedFix, conf
		}
	}

	return "Agent execution failed — no matching pattern detected. Manual investigation required.",
		"Review the full trace attributes and events for clues. Check agent logs around " + trace.StartTime.Format(time.RFC3339) + ".",
		0.50
}

func (ie *IncidentEngine) findRelatedTraces(ctx context.Context, trace *database.Trace) ([]string, error) {
	window := 5 * time.Minute
	var related []database.Trace
	err := ie.db.WithContext(ctx).
		Where("agent_id = ? AND status = ? AND start_time BETWEEN ? AND ? AND trace_id != ?",
			trace.AgentID, "error",
			trace.StartTime.Add(-window), trace.StartTime.Add(window),
			trace.TraceID).
		Limit(20).
		Find(&related).Error
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(related))
	for i, t := range related {
		ids[i] = t.TraceID
	}
	return ids, nil
}

func (ie *IncidentEngine) determineSeverity(trace *database.Trace, relatedCount int) string {
	switch {
	case trace.Duration > 60_000 || relatedCount >= 5:
		return "critical"
	case trace.Duration > 30_000 || relatedCount >= 2:
		return "high"
	case trace.Duration > 10_000:
		return "medium"
	default:
		return "low"
	}
}

// ─── Public service methods ──────────────────────────────────────────────────

func (ie *IncidentEngine) ListIncidents(ctx context.Context, agentID, status string, limit int) ([]database.Incident, error) {
	if limit <= 0 {
		limit = 50
	}
	query := ie.db.WithContext(ctx).Order("created_at DESC").Limit(limit)
	if agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var incidents []database.Incident
	return incidents, query.Find(&incidents).Error
}

func (ie *IncidentEngine) GetIncident(ctx context.Context, id string) (*database.Incident, error) {
	var incident database.Incident
	if err := ie.db.WithContext(ctx).Where("id = ?", id).First(&incident).Error; err != nil {
		return nil, err
	}
	return &incident, nil
}

func (ie *IncidentEngine) ResolveIncident(ctx context.Context, id string) (*database.Incident, error) {
	incident, err := ie.GetIncident(ctx, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	incident.Status = "resolved"
	incident.ResolvedAt = &now
	incident.UpdatedAt = now
	if err := ie.db.WithContext(ctx).Save(incident).Error; err != nil {
		return nil, err
	}
	if ie.hub != nil {
		ie.hub.Publish(Event{
			Type:      "incident.resolved",
			ID:        incident.ID,
			Title:     incident.Title,
			Severity:  incident.Severity,
			AgentID:   incident.AgentID,
			Timestamp: now,
		})
	}
	return incident, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func containsAny(s string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}
