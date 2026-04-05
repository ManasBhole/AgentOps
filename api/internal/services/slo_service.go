package services

import (
	"fmt"
	"math"
	"time"

	"github.com/manasbhole/orion/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type SLOService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewSLOService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *SLOService {
	return &SLOService{db: db, logger: logger, hub: hub}
}

// ─── Core SLO computation ────────────────────────────────────────────────────

type SLOStatus struct {
	SLO            database.SLODefinition `json:"slo"`
	ErrorBudget    float64                `json:"error_budget_remaining"` // 0-100 %
	BurnRate1h     float64                `json:"burn_rate_1h"`
	BurnRate6h     float64                `json:"burn_rate_6h"`
	BurnRate24h    float64                `json:"burn_rate_24h"`
	CurrentValue   float64                `json:"current_value"`   // e.g. current error rate
	TargetValue    float64                `json:"target_value"`    // e.g. 0.99
	BudgetConsumed float64                `json:"budget_consumed"` // 0-100 %
	Alert          string                 `json:"alert"`           // "", "warning", "critical"
	UpdatedAt      time.Time              `json:"updated_at"`
}

// ComputeStatus calculates current SLO health for one definition.
func (s *SLOService) ComputeStatus(slo database.SLODefinition) SLOStatus {
	now := time.Now().UTC()
	windowStart := now.Add(-time.Duration(slo.WindowDays) * 24 * time.Hour)

	var totalCount, badCount int64

	switch slo.SLIType {
	case "availability":
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ?", slo.AgentID, windowStart).
			Count(&totalCount)
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ? AND status = 'error'", slo.AgentID, windowStart).
			Count(&badCount)

	case "latency":
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ?", slo.AgentID, windowStart).
			Count(&totalCount)
		// bad = traces exceeding the latency threshold (stored in ThresholdMs)
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ? AND duration > ?", slo.AgentID, windowStart, slo.ThresholdMs).
			Count(&badCount)

	case "error_rate":
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ?", slo.AgentID, windowStart).
			Count(&totalCount)
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ? AND status = 'error'", slo.AgentID, windowStart).
			Count(&badCount)
	}

	var currentValue float64
	if totalCount > 0 {
		errorRate := float64(badCount) / float64(totalCount)
		if slo.SLIType == "availability" {
			currentValue = 1.0 - errorRate
		} else {
			currentValue = errorRate
		}
	} else {
		if slo.SLIType == "availability" {
			currentValue = 1.0
		}
	}

	// Error budget = allowable bad events in the window
	// Budget consumed = actual bad / allowable bad * 100
	targetBad := float64(totalCount) * (1.0 - slo.TargetValue)
	var budgetConsumed float64
	if targetBad > 0 {
		budgetConsumed = math.Min(100, (float64(badCount)/targetBad)*100)
	}
	budgetRemaining := math.Max(0, 100-budgetConsumed)

	// Burn rates: how fast are we consuming the error budget vs sustainable rate
	burnRate1h  := s.burnRate(slo, now, 1*time.Hour, slo.TargetValue)
	burnRate6h  := s.burnRate(slo, now, 6*time.Hour, slo.TargetValue)
	burnRate24h := s.burnRate(slo, now, 24*time.Hour, slo.TargetValue)

	// Alert tier: fast burn (1h > 14x) = critical; slow burn (6h > 6x) = warning
	alert := ""
	if burnRate1h > 14 {
		alert = "critical"
	} else if burnRate6h > 6 || burnRate24h > 3 {
		alert = "warning"
	}

	return SLOStatus{
		SLO:            slo,
		ErrorBudget:    budgetRemaining,
		BurnRate1h:     burnRate1h,
		BurnRate6h:     burnRate6h,
		BurnRate24h:    burnRate24h,
		CurrentValue:   currentValue,
		TargetValue:    slo.TargetValue,
		BudgetConsumed: budgetConsumed,
		Alert:          alert,
		UpdatedAt:      now,
	}
}

// burnRate = (bad_rate_in_window) / (1 - target)
// A burn rate of 1 = consuming budget at exactly sustainable pace
// A burn rate of 14 = will exhaust the 30-day budget in ~2 days
func (s *SLOService) burnRate(slo database.SLODefinition, now time.Time, window time.Duration, target float64) float64 {
	start := now.Add(-window)
	var total, bad int64
	s.db.Model(&database.Trace{}).
		Where("agent_id = ? AND created_at >= ?", slo.AgentID, start).Count(&total)
	if total == 0 {
		return 0
	}
	if slo.SLIType == "latency" {
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ? AND duration > ?", slo.AgentID, start, slo.ThresholdMs).Count(&bad)
	} else {
		s.db.Model(&database.Trace{}).
			Where("agent_id = ? AND created_at >= ? AND status = 'error'", slo.AgentID, start).Count(&bad)
	}
	badRate := float64(bad) / float64(total)
	allowable := 1.0 - target
	if allowable <= 0 {
		return 0
	}
	return badRate / allowable
}

// GetAllStatuses returns SLOStatus for every defined SLO.
func (s *SLOService) GetAllStatuses() ([]SLOStatus, error) {
	var slos []database.SLODefinition
	if err := s.db.Where("enabled = true").Find(&slos).Error; err != nil {
		return nil, err
	}
	out := make([]SLOStatus, 0, len(slos))
	for _, slo := range slos {
		st := s.ComputeStatus(slo)
		// Fire SSE on critical burn rate
		if st.Alert == "critical" {
			s.hub.Publish(Event{
				Type:    "slo.burning",
				AgentID: slo.AgentID,
				Data: map[string]any{
					"slo_id":      slo.ID,
					"agent_id":    slo.AgentID,
					"burn_rate":   st.BurnRate1h,
					"budget_left": st.ErrorBudget,
				},
				Timestamp: time.Now().UTC(),
			})
		}
		out = append(out, st)
	}
	return out, nil
}

// BurnRateHistory returns per-hour burn rates for the last N hours for charting.
func (s *SLOService) BurnRateHistory(sloID string, hours int) ([]map[string]any, error) {
	var slo database.SLODefinition
	if err := s.db.First(&slo, "id = ?", sloID).Error; err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	points := make([]map[string]any, 0, hours)
	for i := hours; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Hour)
		br := s.burnRate(slo, t, time.Hour, slo.TargetValue)
		points = append(points, map[string]any{
			"time":      t.Format(time.RFC3339),
			"burn_rate": math.Round(br*100) / 100,
		})
	}
	return points, nil
}

// CRUD
func (s *SLOService) Create(agentID, name, sliType string, target float64, windowDays int, thresholdMs int64) (*database.SLODefinition, error) {
	slo := database.SLODefinition{
		ID:          fmt.Sprintf("slo_%d", time.Now().UnixNano()),
		AgentID:     agentID,
		Name:        name,
		SLIType:     sliType,
		TargetValue: target,
		WindowDays:  windowDays,
		ThresholdMs: thresholdMs,
		Enabled:     true,
		CreatedAt:   time.Now().UTC(),
	}
	return &slo, s.db.Create(&slo).Error
}

func (s *SLOService) List(agentID string) ([]database.SLODefinition, error) {
	var slos []database.SLODefinition
	q := s.db.Order("created_at DESC")
	if agentID != "" {
		q = q.Where("agent_id = ?", agentID)
	}
	return slos, q.Find(&slos).Error
}

func (s *SLOService) Delete(id string) error {
	return s.db.Delete(&database.SLODefinition{}, "id = ?", id).Error
}
