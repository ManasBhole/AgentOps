package services

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

// anomalyMetrics defines which fingerprint fields to scan for anomalies.
var anomalyMetrics = []struct {
	Name      string
	Threshold float64 // z-score threshold for "warning"; critical = threshold + 1.0
}{
	{"p99_latency_ms", 2.5},
	{"error_rate", 2.5},
	{"avg_cost_per_req_usd", 3.0},
	{"avg_tokens_per_req", 2.5},
}

type AnomalyDetectionService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewAnomalyDetectionService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *AnomalyDetectionService {
	return &AnomalyDetectionService{db: db, logger: logger, hub: hub}
}

// RunDetection scans all active agents. For each, it:
//  1. Grabs the current 15-min window stats from behavioral fingerprints.
//  2. Loads the 7d baseline (mean/stddev) from stored fingerprints.
//  3. Computes z-score per metric; fires anomaly events when z >= threshold.
func (s *AnomalyDetectionService) RunDetection(ctx context.Context, zThreshold float64) ([]database.AnomalyEvent, error) {
	if zThreshold <= 0 {
		zThreshold = 2.5
	}

	var agents []database.Agent
	if err := s.db.WithContext(ctx).Where("status = ?", "active").Find(&agents).Error; err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	windowStart := now.Add(-15 * time.Minute)

	var fired []database.AnomalyEvent

	for _, agent := range agents {
		// Get the most recent 24h fingerprint as the "current" snapshot
		var current database.BehavioralFingerprint
		if err := s.db.WithContext(ctx).
			Where("agent_id = ? AND time_window = ?", agent.ID, "24h").
			Order("computed_at DESC").
			First(&current).Error; err != nil {
			continue // no fingerprint yet
		}

		// Build the 7d baseline: load last 7 days of 24h fingerprints for stats
		var history []database.BehavioralFingerprint
		s.db.WithContext(ctx).
			Where("agent_id = ? AND time_window = ? AND computed_at > ?", agent.ID, "24h", now.Add(-7*24*time.Hour)).
			Order("computed_at DESC").
			Limit(168). // 7 * 24 snapshots
			Find(&history)

		if len(history) < 3 {
			continue // not enough baseline history
		}

		// Check each metric
		for _, metric := range anomalyMetrics {
			observed := extractMetricValue(current, metric.Name)
			mean, stddev := computeBaselineStats(history, metric.Name)

			z := zScore(observed, mean, stddev)
			if math.Abs(z) < zThreshold {
				continue
			}

			// Deduplicate: skip if open anomaly already exists for this agent+metric in this window
			var existing int64
			s.db.WithContext(ctx).Model(&database.AnomalyEvent{}).
				Where("agent_id = ? AND metric = ? AND status = 'open' AND window_start > ?",
					agent.ID, metric.Name, now.Add(-30*time.Minute)).
				Count(&existing)
			if existing > 0 {
				continue
			}

			severity := "warning"
			if math.Abs(z) >= zThreshold+1.0 {
				severity = "critical"
			}

			devPct := 0.0
			if mean != 0 {
				devPct = (observed - mean) / mean * 100
			}

			evt := database.AnomalyEvent{
				ID:            "anm_" + uuid.New().String(),
				AgentID:       agent.ID,
				Metric:        metric.Name,
				ZScore:        math.Abs(z),
				BaselineMean:  mean,
				BaselineStdev: stddev,
				ObservedValue: observed,
				DeviationPct:  devPct,
				Severity:      severity,
				Status:        "open",
				WindowStart:   windowStart,
				WindowEnd:     now,
				CreatedAt:     now,
			}

			if err := s.db.WithContext(ctx).Create(&evt).Error; err != nil {
				s.logger.Warn("failed to save anomaly event", zap.Error(err))
				continue
			}

			// Publish to SSE hub
			s.hub.Publish(Event{
				Type:      "anomaly.detected",
				ID:        evt.ID,
				AgentID:   agent.ID,
				Title:     fmt.Sprintf("Anomaly: %s z=%.2f (%s)", metric.Name, math.Abs(z), agent.Name),
				Severity:  severity,
				Timestamp: now,
			})

			fired = append(fired, evt)
			s.logger.Info("anomaly detected",
				zap.String("agent", agent.ID),
				zap.String("metric", metric.Name),
				zap.Float64("z_score", math.Abs(z)),
				zap.String("severity", severity))
		}
	}
	return fired, nil
}

// GetAnomalyFeed returns recent anomaly events sorted newest-first.
func (s *AnomalyDetectionService) GetAnomalyFeed(ctx context.Context, agentID, status string, limit int) ([]database.AnomalyEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := s.db.WithContext(ctx).Order("created_at DESC").Limit(limit)
	if agentID != "" {
		q = q.Where("agent_id = ?", agentID)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var evts []database.AnomalyEvent
	return evts, q.Find(&evts).Error
}

// AcknowledgeAnomaly marks an event as acknowledged.
func (s *AnomalyDetectionService) AcknowledgeAnomaly(ctx context.Context, id string) (*database.AnomalyEvent, error) {
	var evt database.AnomalyEvent
	if err := s.db.WithContext(ctx).First(&evt, "id = ?", id).Error; err != nil {
		return nil, err
	}
	evt.Status = "acknowledged"
	return &evt, s.db.Save(&evt).Error
}

// ── helpers ──────────────────────────────────────────────────────────────────

func zScore(observed, mean, stddev float64) float64 {
	if stddev < 1e-10 {
		return 0
	}
	return (observed - mean) / stddev
}

func computeBaselineStats(fps []database.BehavioralFingerprint, metric string) (mean, stddev float64) {
	if len(fps) == 0 {
		return 0, 0
	}
	var sum float64
	for _, fp := range fps {
		sum += extractMetricValue(fp, metric)
	}
	mean = sum / float64(len(fps))

	var variance float64
	for _, fp := range fps {
		diff := extractMetricValue(fp, metric) - mean
		variance += diff * diff
	}
	variance /= float64(len(fps))
	stddev = math.Sqrt(variance)
	return mean, stddev
}

func extractMetricValue(fp database.BehavioralFingerprint, metric string) float64 {
	switch metric {
	case "p99_latency_ms":
		return fp.P99LatencyMs
	case "p95_latency_ms":
		return fp.P95LatencyMs
	case "error_rate":
		return fp.ErrorRate
	case "avg_cost_per_req_usd":
		return fp.AvgCostPerReqUSD
	case "avg_tokens_per_req":
		return fp.AvgTokensPerReq
	case "avg_latency_ms":
		return fp.AvgLatencyMs
	default:
		return 0
	}
}
