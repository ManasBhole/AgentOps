package services

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/agentops/agentops/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type TimeTravelService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewTimeTravelService(db *gorm.DB, logger *zap.Logger) *TimeTravelService {
	return &TimeTravelService{db: db, logger: logger}
}

// Timeline is the full reconstructed execution timeline for a trace.
type Timeline struct {
	TraceID     string                   `json:"trace_id"`
	AgentID     string                   `json:"agent_id"`
	RunID       string                   `json:"run_id"`
	Snapshots   []database.TraceSnapshot `json:"snapshots"`
	Forks       []database.TimelineFork  `json:"forks"`
	TotalCost   float64                  `json:"total_cost_usd"`
	TotalTokens int64                    `json:"total_tokens"`
	DurationMs  int64                    `json:"duration_ms"`
}

// BuildTimeline reconstructs a full execution timeline from stored traces.
// It synthesizes snapshots from the trace spans in the DB.
func (s *TimeTravelService) BuildTimeline(traceID string) (*Timeline, error) {
	// Get all spans for this trace
	var traces []database.Trace
	if err := s.db.Where("trace_id = ?", traceID).
		Order("start_time ASC").Find(&traces).Error; err != nil {
		return nil, err
	}
	if len(traces) == 0 {
		return nil, fmt.Errorf("trace not found: %s", traceID)
	}

	root := traces[0]

	// Check if we have pre-recorded snapshots
	var existing []database.TraceSnapshot
	s.db.Where("trace_id = ?", traceID).Order("seq_num ASC").Find(&existing)

	var snapshots []database.TraceSnapshot
	if len(existing) > 0 {
		snapshots = existing
	} else {
		// Synthesize snapshots from spans
		snapshots = s.synthesizeSnapshots(traces)
		// Persist for future fast retrieval
		for _, snap := range snapshots {
			s.db.Create(&snap)
		}
	}

	var forks []database.TimelineFork
	s.db.Where("original_trace_id = ?", traceID).Order("created_at ASC").Find(&forks)

	var totalCost float64
	var totalTokens int64
	for _, snap := range snapshots {
		totalCost += snap.CostUSD
		totalTokens += snap.TokensUsed
	}

	var durationMs int64
	if len(snapshots) > 0 {
		last := snapshots[len(snapshots)-1]
		durationMs = last.DurationMs
	}

	return &Timeline{
		TraceID:     traceID,
		AgentID:     root.AgentID,
		RunID:       root.RunID,
		Snapshots:   snapshots,
		Forks:       forks,
		TotalCost:   totalCost,
		TotalTokens: totalTokens,
		DurationMs:  durationMs,
	}, nil
}

// synthesizeSnapshots builds TraceSnapshot records from raw span data.
func (s *TimeTravelService) synthesizeSnapshots(spans []database.Trace) []database.TraceSnapshot {
	sort.Slice(spans, func(i, j int) bool {
		return spans[i].StartTime.Before(spans[j].StartTime)
	})

	snapshots := make([]database.TraceSnapshot, 0, len(spans))
	var cumulativeCost float64
	var cumulativeTokens int64

	for i, span := range spans {
		// Parse attributes to extract cost/tokens if available
		var attrs map[string]any
		if span.Attributes != "" {
			json.Unmarshal([]byte(span.Attributes), &attrs)
		}

		var costUSD float64
		var tokensUsed int64
		if v, ok := attrs["cost_usd"].(float64); ok {
			costUSD = v
		}
		if v, ok := attrs["tokens"].(float64); ok {
			tokensUsed = int64(v)
		}
		if v, ok := attrs["tokens_used"].(float64); ok {
			tokensUsed = int64(v)
		}
		cumulativeCost += costUSD
		cumulativeTokens += tokensUsed

		// Build a state snapshot — captures what we know at this point in execution
		state := map[string]any{
			"span_name":         span.Name,
			"status":            span.Status,
			"duration_ms":       span.Duration,
			"cumulative_cost":   cumulativeCost,
			"cumulative_tokens": cumulativeTokens,
			"attributes":        attrs,
			"step_index":        i,
			"total_steps":       len(spans),
		}
		stateJSON, _ := json.Marshal(state)

		snapshots = append(snapshots, database.TraceSnapshot{
			ID:         fmt.Sprintf("snap_%s_%d", span.TraceID, i),
			TraceID:    span.TraceID,
			SpanID:     span.SpanID,
			AgentID:    span.AgentID,
			RunID:      span.RunID,
			SeqNum:     i,
			SpanName:   span.Name,
			State:      string(stateJSON),
			TokensUsed: tokensUsed,
			CostUSD:    costUSD,
			DurationMs: span.Duration,
			Status:     span.Status,
			RecordedAt: span.StartTime,
		})
	}
	return snapshots
}

// GetSnapshot returns a single snapshot by ID.
func (s *TimeTravelService) GetSnapshot(id string) (*database.TraceSnapshot, error) {
	var snap database.TraceSnapshot
	return &snap, s.db.First(&snap, "id = ?", id).Error
}

// CreateFork records a user branching from a specific point in a timeline.
func (s *TimeTravelService) CreateFork(traceID, snapshotID, label, notes, userID string) (*database.TimelineFork, error) {
	var snap database.TraceSnapshot
	if err := s.db.First(&snap, "id = ?", snapshotID).Error; err != nil {
		return nil, fmt.Errorf("snapshot not found")
	}
	fork := database.TimelineFork{
		ID:              fmt.Sprintf("fork_%d", time.Now().UnixNano()),
		OriginalTraceID: traceID,
		ForkSnapshotID:  snapshotID,
		ForkSeqNum:      snap.SeqNum,
		Label:           label,
		Notes:           notes,
		CreatedBy:       userID,
		CreatedAt:       time.Now().UTC(),
	}
	return &fork, s.db.Create(&fork).Error
}

// CompareForks returns the snapshots from two different traces side by side for diffing.
func (s *TimeTravelService) CompareForks(traceIDa, traceIDB string) (map[string]any, error) {
	timelineA, err := s.BuildTimeline(traceIDa)
	if err != nil {
		return nil, fmt.Errorf("timeline A: %w", err)
	}
	timelineB, err := s.BuildTimeline(traceIDB)
	if err != nil {
		return nil, fmt.Errorf("timeline B: %w", err)
	}
	return map[string]any{
		"timeline_a": timelineA,
		"timeline_b": timelineB,
		"diff": map[string]any{
			"cost_delta_usd":    timelineB.TotalCost - timelineA.TotalCost,
			"token_delta":       timelineB.TotalTokens - timelineA.TotalTokens,
			"duration_delta_ms": timelineB.DurationMs - timelineA.DurationMs,
			"step_count_a":      len(timelineA.Snapshots),
			"step_count_b":      len(timelineB.Snapshots),
		},
	}, nil
}

// ListTimelines returns recent traces that have timelines available.
func (s *TimeTravelService) ListTimelines(agentID string, limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 20
	}
	type row struct {
		TraceID   string    `json:"trace_id"`
		AgentID   string    `json:"agent_id"`
		RunID     string    `json:"run_id"`
		SpanCount int       `json:"span_count"`
		CreatedAt time.Time `json:"created_at"`
	}

	query := s.db.Model(&database.Trace{}).
		Select("trace_id, agent_id, run_id, count(*) as span_count, min(created_at) as created_at").
		Group("trace_id, agent_id, run_id").
		Order("min(created_at) DESC").
		Limit(limit)
	if agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	var rows []row
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"trace_id":   r.TraceID,
			"agent_id":   r.AgentID,
			"run_id":     r.RunID,
			"span_count": r.SpanCount,
			"created_at": r.CreatedAt,
		})
	}
	return out, nil
}
