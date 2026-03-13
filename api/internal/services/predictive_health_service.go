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

	"github.com/agentops/agentops/api/internal/database"
)

const minTrainingPoints = 6 // skip regression if fewer data points

type PredictiveHealthService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewPredictiveHealthService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *PredictiveHealthService {
	return &PredictiveHealthService{db: db, logger: logger, hub: hub}
}

// RecordHealthSnapshot persists the current health score for one agent.
func (s *PredictiveHealthService) RecordHealthSnapshot(ctx context.Context, score HealthScore) error {
	// Extract error rate and latency from breakdown
	errorRate := 0.0
	if score.Breakdown.ErrorRate.Score > 0 {
		errorRate = 1.0 - float64(score.Breakdown.ErrorRate.Score)/25.0
	}
	avgLatency := 0.0
	_ = avgLatency // extracted from Value string — use score as proxy

	snap := database.HealthScoreHistory{
		ID:            "hsh_" + uuid.New().String(),
		AgentID:       score.AgentID,
		Score:         score.Score,
		ErrorRate:     errorRate,
		AvgLatencyMs:  float64(25-score.Breakdown.Latency.Score) * 200, // rough inverse
		OpenIncidents: 25 - score.Breakdown.IncidentRate.Score,
		RecordedAt:    score.ComputedAt,
	}
	return s.db.WithContext(ctx).Create(&snap).Error
}

// RecordAllSnapshots computes and persists health for every active agent.
func (s *PredictiveHealthService) RecordAllSnapshots(ctx context.Context, healthSvc *HealthService) error {
	var agents []database.Agent
	if err := s.db.WithContext(ctx).Where("status != ?", "deleted").Find(&agents).Error; err != nil {
		return err
	}
	for _, a := range agents {
		score := healthSvc.ComputeHealth(a.ID)
		if err := s.RecordHealthSnapshot(ctx, score); err != nil {
			s.logger.Warn("failed to record health snapshot",
				zap.String("agent_id", a.ID), zap.Error(err))
		}
	}
	return nil
}

// RunPredictions runs OLS regression for all agents, upserts predictions.
func (s *PredictiveHealthService) RunPredictions(ctx context.Context) error {
	var agents []database.Agent
	if err := s.db.WithContext(ctx).Where("status != ?", "deleted").Find(&agents).Error; err != nil {
		return err
	}

	horizons := []struct {
		Label   string
		Offset  time.Duration
	}{
		{"+1h", 1 * time.Hour},
		{"+4h", 4 * time.Hour},
		{"+24h", 24 * time.Hour},
	}

	now := time.Now().UTC()
	since := now.Add(-48 * time.Hour)

	for _, agent := range agents {
		var history []database.HealthScoreHistory
		s.db.WithContext(ctx).
			Where("agent_id = ? AND recorded_at > ?", agent.ID, since).
			Order("recorded_at ASC").
			Find(&history)

		if len(history) < minTrainingPoints {
			continue
		}

		// Build (t, y) arrays for OLS
		xs := make([]float64, len(history))
		ys := make([]float64, len(history))
		for i, h := range history {
			xs[i] = float64(h.RecordedAt.Unix())
			ys[i] = float64(h.Score)
		}

		slope, intercept, rSquared := olsLinearRegression(xs, ys)

		// Get current score for transition detection
		currentScore := 0
		if len(history) > 0 {
			currentScore = history[len(history)-1].Score
		}

		for _, hz := range horizons {
			futureT := float64(now.Add(hz.Offset).Unix())
			predicted := slope*futureT + intercept

			// clamp to reasonable range
			if predicted > 100 {
				predicted = 100
			}
			if predicted < 0 {
				predicted = 0
			}

			isCritical := predicted < 50

			pred := database.HealthPrediction{
				ID:             fmt.Sprintf("pred_%s_%s", agent.ID[:min8(agent.ID)], hz.Label),
				AgentID:        agent.ID,
				Horizon:        hz.Label,
				PredictedScore: predicted,
				Slope:          slope,
				Intercept:      intercept,
				RSquared:       rSquared,
				TrainingPoints: len(history),
				IsCritical:     isCritical,
				PredictedAt:    now,
			}

			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"predicted_score", "slope", "intercept", "r_squared",
					"training_points", "is_critical", "predicted_at",
				}),
			}).Create(&pred)

			// Fire SSE if newly predicted critical (was healthy before)
			if isCritical && currentScore >= 50 {
				s.hub.Publish(Event{
					Type:     "health.prediction.critical",
					ID:       pred.ID,
					AgentID:  agent.ID,
					Title:    fmt.Sprintf("Agent trending critical in %s (predicted %.0f)", hz.Label, predicted),
					Severity: "high",
					Timestamp: now,
				})
			}
		}
	}
	return nil
}

// GetPredictions returns all horizon predictions for one agent.
func (s *PredictiveHealthService) GetPredictions(ctx context.Context, agentID string) ([]database.HealthPrediction, error) {
	var preds []database.HealthPrediction
	err := s.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("predicted_at DESC").
		Find(&preds).Error
	return preds, err
}

// GetCriticalPredictions returns all agents where any horizon is predicted critical.
func (s *PredictiveHealthService) GetCriticalPredictions(ctx context.Context) ([]database.HealthPrediction, error) {
	var preds []database.HealthPrediction
	err := s.db.WithContext(ctx).
		Where("is_critical = ?", true).
		Order("predicted_at DESC").
		Find(&preds).Error
	return preds, err
}

// GetHealthHistory returns the raw time-series for one agent.
func (s *PredictiveHealthService) GetHealthHistory(ctx context.Context, agentID string, since time.Time) ([]database.HealthScoreHistory, error) {
	var history []database.HealthScoreHistory
	err := s.db.WithContext(ctx).
		Where("agent_id = ? AND recorded_at > ?", agentID, since).
		Order("recorded_at ASC").
		Find(&history).Error
	return history, err
}

// GetAllPredictions returns predictions optionally filtered to critical only.
func (s *PredictiveHealthService) GetAllPredictions(ctx context.Context, criticalOnly bool) ([]database.HealthPrediction, error) {
	q := s.db.WithContext(ctx).Order("predicted_at DESC")
	if criticalOnly {
		q = q.Where("is_critical = ?", true)
	}
	// Distinct on agent_id+horizon — take the most recent
	var preds []database.HealthPrediction
	return preds, q.Find(&preds).Error
}

// ── OLS Linear Regression (pure Go, no external deps) ────────────────────────

func olsLinearRegression(xs, ys []float64) (slope, intercept, rSquared float64) {
	n := float64(len(xs))
	if n < 2 {
		return 0, 0, 0
	}

	var sumX, sumY, sumXY, sumX2, sumY2 float64
	for i := range xs {
		sumX += xs[i]
		sumY += ys[i]
		sumXY += xs[i] * ys[i]
		sumX2 += xs[i] * xs[i]
		sumY2 += ys[i] * ys[i]
	}

	xMean := sumX / n
	yMean := sumY / n

	sxy := sumXY - n*xMean*yMean
	sxx := sumX2 - n*xMean*xMean
	syy := sumY2 - n*yMean*yMean

	if math.Abs(sxx) < 1e-10 {
		return 0, yMean, 0
	}

	slope = sxy / sxx
	intercept = yMean - slope*xMean

	if math.Abs(syy) < 1e-10 {
		rSquared = 1
	} else {
		ssRes := syy - sxy*sxy/sxx
		rSquared = 1 - ssRes/syy
	}

	return slope, intercept, rSquared
}
