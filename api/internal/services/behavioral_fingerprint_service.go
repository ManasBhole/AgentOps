package services

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/manasbhole/orion/api/internal/database"
)

var fingerprintWindows = []struct {
	Label    string
	Duration time.Duration
}{
	{"1h", 1 * time.Hour},
	{"6h", 6 * time.Hour},
	{"24h", 24 * time.Hour},
	{"7d", 7 * 24 * time.Hour},
}

// windowStats is the raw aggregation result from Postgres.
type windowStats struct {
	SampleCount   int64
	P50LatencyMs  float64
	P95LatencyMs  float64
	P99LatencyMs  float64
	AvgLatencyMs  float64
	MaxLatencyMs  float64
	ErrorRate     float64
	ErrorCount    int64
	AvgTokens     float64
	P95Tokens     float64
	AvgCostPerReq float64
	TotalCost     float64
}

type BehavioralFingerprintService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewBehavioralFingerprintService(db *gorm.DB, logger *zap.Logger) *BehavioralFingerprintService {
	return &BehavioralFingerprintService{db: db, logger: logger}
}

// ComputeFingerprint computes and upserts the behavioral fingerprint for one agent + window.
func (s *BehavioralFingerprintService) ComputeFingerprint(
	ctx context.Context,
	agentID string,
	windowLabel string,
	healthSvc *HealthService,
) (*database.BehavioralFingerprint, error) {
	dur := windowDuration(windowLabel)
	if dur == 0 {
		return nil, fmt.Errorf("unknown window: %s", windowLabel)
	}
	now := time.Now().UTC()
	windowStart := now.Add(-dur)

	stats, err := s.queryWindowStats(ctx, agentID, windowStart, now)
	if err != nil {
		return nil, err
	}

	healthScore := 0
	if healthSvc != nil {
		hs := healthSvc.ComputeHealth(agentID)
		healthScore = hs.Score
	}

	fp := database.BehavioralFingerprint{
		ID:               fmt.Sprintf("fp_%s_%s_%d", agentID[:min8(agentID)], windowLabel, windowStart.Unix()),
		AgentID:          agentID,
		Window:           windowLabel,
		WindowStart:      windowStart,
		WindowEnd:        now,
		SampleCount:      stats.SampleCount,
		P50LatencyMs:     stats.P50LatencyMs,
		P95LatencyMs:     stats.P95LatencyMs,
		P99LatencyMs:     stats.P99LatencyMs,
		AvgLatencyMs:     stats.AvgLatencyMs,
		MaxLatencyMs:     stats.MaxLatencyMs,
		ErrorRate:        stats.ErrorRate,
		ErrorCount:       stats.ErrorCount,
		AvgTokensPerReq:  stats.AvgTokens,
		P95TokensPerReq:  stats.P95Tokens,
		AvgCostPerReqUSD: stats.AvgCostPerReq,
		TotalCostUSD:     stats.TotalCost,
		HealthScore:      healthScore,
		ComputedAt:       now,
	}

	result := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"sample_count", "p50_latency_ms", "p95_latency_ms", "p99_latency_ms",
			"avg_latency_ms", "max_latency_ms", "error_rate", "error_count",
			"avg_tokens_per_req", "p95_tokens_per_req", "avg_cost_per_req_usd",
			"total_cost_usd", "health_score", "computed_at", "window_end",
		}),
	}).Create(&fp)

	return &fp, result.Error
}

// ComputeAllFingerprints iterates every active agent and all 4 windows.
func (s *BehavioralFingerprintService) ComputeAllFingerprints(ctx context.Context, healthSvc *HealthService) error {
	var agents []database.Agent
	if err := s.db.WithContext(ctx).Where("status != ?", "deleted").Find(&agents).Error; err != nil {
		return err
	}
	for _, agent := range agents {
		for _, w := range fingerprintWindows {
			if _, err := s.ComputeFingerprint(ctx, agent.ID, w.Label, healthSvc); err != nil {
				s.logger.Warn("fingerprint compute failed",
					zap.String("agent_id", agent.ID),
					zap.String("window", w.Label),
					zap.Error(err))
			}
		}
	}
	return nil
}

// GetFingerprint returns the most recent fingerprint for agent + window.
func (s *BehavioralFingerprintService) GetFingerprint(
	ctx context.Context, agentID, windowLabel string,
) (*database.BehavioralFingerprint, error) {
	var fp database.BehavioralFingerprint
	err := s.db.WithContext(ctx).
		Where("agent_id = ? AND window = ?", agentID, windowLabel).
		Order("computed_at DESC").
		First(&fp).Error
	if err != nil {
		return nil, err
	}
	return &fp, nil
}

// GetFingerprintHistory returns the last N fingerprints for one agent + window.
func (s *BehavioralFingerprintService) GetFingerprintHistory(
	ctx context.Context, agentID, windowLabel string, limit int,
) ([]database.BehavioralFingerprint, error) {
	var fps []database.BehavioralFingerprint
	err := s.db.WithContext(ctx).
		Where("agent_id = ? AND window = ?", agentID, windowLabel).
		Order("computed_at DESC").
		Limit(limit).
		Find(&fps).Error
	return fps, err
}

// GetFleetFingerprints returns the latest fingerprint per agent for a given window.
func (s *BehavioralFingerprintService) GetFleetFingerprints(
	ctx context.Context, windowLabel string,
) ([]database.BehavioralFingerprint, error) {
	// Subquery: max computed_at per agent for this window
	subSQL := `
		SELECT DISTINCT ON (agent_id) *
		FROM behavioral_fingerprints
		WHERE window = ?
		ORDER BY agent_id, computed_at DESC
	`
	var fps []database.BehavioralFingerprint
	err := s.db.WithContext(ctx).Raw(subSQL, windowLabel).Scan(&fps).Error
	return fps, err
}

// queryWindowStats runs the heavy Postgres aggregation for one agent+window.
// Uses PERCENTILE_CONT for exact server-side percentile computation.
func (s *BehavioralFingerprintService) queryWindowStats(
	ctx context.Context, agentID string, from, to time.Time,
) (*windowStats, error) {
	type row struct {
		SampleCount int64   `gorm:"column:sample_count"`
		P50         float64 `gorm:"column:p50"`
		P95         float64 `gorm:"column:p95"`
		P99         float64 `gorm:"column:p99"`
		AvgLatency  float64 `gorm:"column:avg_latency"`
		MaxLatency  float64 `gorm:"column:max_latency"`
		ErrorRate   float64 `gorm:"column:error_rate"`
		ErrorCount  int64   `gorm:"column:error_count"`
		AvgTokens   float64 `gorm:"column:avg_tokens"`
		P95Tokens   float64 `gorm:"column:p95_tokens"`
		AvgCost     float64 `gorm:"column:avg_cost"`
		TotalCost   float64 `gorm:"column:total_cost"`
	}

	var r row
	sql := `
		SELECT
			COUNT(*) AS sample_count,
			COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms), 0) AS p50,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95,
			COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms), 0) AS p99,
			COALESCE(AVG(duration_ms), 0)                                           AS avg_latency,
			COALESCE(MAX(duration_ms), 0)                                           AS max_latency,
			COALESCE(AVG(CASE WHEN status='error' THEN 1.0 ELSE 0.0 END), 0)        AS error_rate,
			COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END), 0)            AS error_count,
			COALESCE(AVG(NULLIF((attributes::jsonb->>'llm.usage.total_tokens')::float, 0)), 0) AS avg_tokens,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY NULLIF((attributes::jsonb->>'llm.usage.total_tokens')::float, NULL)), 0) AS p95_tokens,
			COALESCE(AVG(NULLIF((attributes::jsonb->>'llm.cost_usd')::float, 0)), 0) AS avg_cost,
			COALESCE(SUM(NULLIF((attributes::jsonb->>'llm.cost_usd')::float, 0)), 0) AS total_cost
		FROM traces
		WHERE agent_id = ? AND start_time >= ? AND start_time < ?
	`
	err := s.db.WithContext(ctx).Raw(sql, agentID, from, to).Scan(&r).Error
	if err != nil {
		// Fallback to simple aggregation if PERCENTILE_CONT unavailable (non-Postgres)
		return s.fallbackWindowStats(ctx, agentID, from, to)
	}

	return &windowStats{
		SampleCount:   r.SampleCount,
		P50LatencyMs:  r.P50,
		P95LatencyMs:  r.P95,
		P99LatencyMs:  r.P99,
		AvgLatencyMs:  r.AvgLatency,
		MaxLatencyMs:  r.MaxLatency,
		ErrorRate:     r.ErrorRate,
		ErrorCount:    r.ErrorCount,
		AvgTokens:     r.AvgTokens,
		P95Tokens:     r.P95Tokens,
		AvgCostPerReq: r.AvgCost,
		TotalCost:     r.TotalCost,
	}, nil
}

// fallbackWindowStats computes percentiles in Go memory for non-Postgres DBs.
func (s *BehavioralFingerprintService) fallbackWindowStats(
	ctx context.Context, agentID string, from, to time.Time,
) (*windowStats, error) {
	var traces []database.Trace
	if err := s.db.WithContext(ctx).
		Where("agent_id = ? AND start_time >= ? AND start_time < ?", agentID, from, to).
		Find(&traces).Error; err != nil {
		return nil, err
	}
	if len(traces) == 0 {
		return &windowStats{}, nil
	}

	durations := make([]float64, len(traces))
	var errCount int64
	var totalMs, maxMs float64
	for i, t := range traces {
		d := float64(t.Duration)
		durations[i] = d
		totalMs += d
		if d > maxMs {
			maxMs = d
		}
		if t.Status == "error" {
			errCount++
		}
	}
	n := len(durations)
	sortFloat64(durations)

	return &windowStats{
		SampleCount:  int64(n),
		P50LatencyMs: percentile(durations, 0.50),
		P95LatencyMs: percentile(durations, 0.95),
		P99LatencyMs: percentile(durations, 0.99),
		AvgLatencyMs: totalMs / float64(n),
		MaxLatencyMs: maxMs,
		ErrorRate:    float64(errCount) / float64(n),
		ErrorCount:   errCount,
	}, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func windowDuration(label string) time.Duration {
	for _, w := range fingerprintWindows {
		if w.Label == label {
			return w.Duration
		}
	}
	return 0
}

func min8(s string) int {
	if len(s) < 8 {
		return len(s)
	}
	return 8
}

func sortFloat64(a []float64) {
	// insertion sort — adequate for typical trace counts
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := p * float64(len(sorted)-1)
	lo := int(math.Floor(idx))
	hi := int(math.Ceil(idx))
	if lo == hi {
		return sorted[lo]
	}
	frac := idx - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}

// ensure uuid is imported
var _ = uuid.New
