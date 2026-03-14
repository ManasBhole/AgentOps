package services

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"github.com/agentops/agentops/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ChaosService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewChaosService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *ChaosService {
	return &ChaosService{db: db, logger: logger, hub: hub}
}

type ChaosResult struct {
	FaultType           string   `json:"fault_type"`
	Intensity           float64  `json:"intensity"`
	ProjectedErrorRate  float64  `json:"projected_error_rate"`
	ProjectedLatencyMs  float64  `json:"projected_latency_ms"`
	ProjectedHealthDrop float64  `json:"projected_health_drop"`
	RecoveryTimeSec     int      `json:"recovery_time_sec"`
	AffectedTraces      int      `json:"affected_traces"`
	BreachedSLOs        []string `json:"breached_slos"`
	Recommendation      string   `json:"recommendation"`
}

func (s *ChaosService) RunExperiment(agentID, faultType, notes, createdBy string, intensity float64, durationSec int) (*database.ChaosExperiment, error) {
	exp := database.ChaosExperiment{
		ID:          fmt.Sprintf("chaos_%d", time.Now().UnixNano()),
		AgentID:     agentID,
		FaultType:   faultType,
		Intensity:   intensity,
		DurationSec: durationSec,
		Status:      "running",
		Notes:       notes,
		CreatedBy:   createdBy,
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.db.Create(&exp).Error; err != nil {
		return nil, err
	}

	// Simulate asynchronously
	go s.simulate(&exp)
	return &exp, nil
}

func (s *ChaosService) simulate(exp *database.ChaosExperiment) {
	// Fetch agent baseline
	var fp database.BehavioralFingerprint
	s.db.Where("agent_id = ?", exp.AgentID).Order("computed_at DESC").First(&fp)

	baseErrorRate := fp.ErrorRate
	baseLatency := fp.AvgLatencyMs
	baseHealth := float64(fp.HealthScore)

	var result ChaosResult
	result.FaultType = exp.FaultType
	result.Intensity = exp.Intensity

	switch exp.FaultType {
	case "latency_spike":
		multiplier := 1.0 + exp.Intensity*9.0 // 1x to 10x
		result.ProjectedLatencyMs = baseLatency * multiplier
		result.ProjectedErrorRate = baseErrorRate + exp.Intensity*0.1
		result.ProjectedHealthDrop = exp.Intensity * 30
		result.RecoveryTimeSec = int(exp.Intensity * 120)
		result.Recommendation = "Consider circuit breaker with 2s timeout. Enable request hedging."

	case "error_injection":
		result.ProjectedErrorRate = baseErrorRate + exp.Intensity*0.8
		result.ProjectedLatencyMs = baseLatency * (1 + exp.Intensity*0.3)
		result.ProjectedHealthDrop = exp.Intensity * 50
		result.RecoveryTimeSec = int(exp.Intensity * 60)
		result.Recommendation = "Implement retry with exponential backoff. Add fallback response."

	case "memory_pressure":
		result.ProjectedLatencyMs = baseLatency * (1 + exp.Intensity*5)
		result.ProjectedErrorRate = baseErrorRate + exp.Intensity*0.3
		result.ProjectedHealthDrop = exp.Intensity * 40
		result.RecoveryTimeSec = int(exp.Intensity * 180)
		result.Recommendation = "Increase memory limits. Add OOM kill recovery. Consider streaming."

	case "network_partition":
		result.ProjectedErrorRate = baseErrorRate + exp.Intensity*0.9
		result.ProjectedLatencyMs = baseLatency * (1 + exp.Intensity*15)
		result.ProjectedHealthDrop = exp.Intensity * 60
		result.RecoveryTimeSec = int(exp.Intensity * 300)
		result.Recommendation = "Implement service mesh with mTLS. Enable local caching for partition tolerance."

	default:
		result.ProjectedErrorRate = baseErrorRate
		result.ProjectedLatencyMs = baseLatency
	}

	// Jitter
	result.ProjectedErrorRate = clampF(result.ProjectedErrorRate+rand.Float64()*0.02-0.01, 0, 1)
	result.ProjectedLatencyMs = result.ProjectedLatencyMs * (0.95 + rand.Float64()*0.1)
	result.ProjectedHealthDrop = clampF(result.ProjectedHealthDrop+rand.Float64()*5-2.5, 0, 100)

	// suppress unused variable warning
	_ = baseHealth

	// Check SLO breaches
	var slos []database.SLODefinition
	s.db.Where("agent_id = ? AND enabled = true", exp.AgentID).Find(&slos)
	for _, slo := range slos {
		switch slo.SLIType {
		case "availability":
			if 1.0-result.ProjectedErrorRate < slo.TargetValue {
				result.BreachedSLOs = append(result.BreachedSLOs, slo.Name)
			}
		case "latency":
			if result.ProjectedLatencyMs > float64(slo.ThresholdMs) {
				result.BreachedSLOs = append(result.BreachedSLOs, slo.Name)
			}
		}
	}
	if result.BreachedSLOs == nil {
		result.BreachedSLOs = []string{}
	}

	// Simulate elapsed time proportional to duration
	time.Sleep(time.Duration(clampI(exp.DurationSec/10, 1, 5)) * time.Second)

	resultJSON, _ := json.Marshal(result)
	now := time.Now().UTC()
	s.db.Model(exp).Updates(map[string]any{
		"status":       "completed",
		"results":      string(resultJSON),
		"completed_at": now,
	})

	// SSE event
	s.hub.Publish(Event{
		Type:    "chaos.completed",
		AgentID: exp.AgentID,
		Data: map[string]any{
			"experiment_id": exp.ID,
			"fault_type":    exp.FaultType,
			"health_drop":   result.ProjectedHealthDrop,
			"breached_slos": result.BreachedSLOs,
		},
	})
}

func (s *ChaosService) ListExperiments(agentID string) ([]database.ChaosExperiment, error) {
	var exps []database.ChaosExperiment
	q := s.db.Order("created_at DESC").Limit(100)
	if agentID != "" {
		q = q.Where("agent_id = ?", agentID)
	}
	return exps, q.Find(&exps).Error
}

func (s *ChaosService) GetExperiment(id string) (*database.ChaosExperiment, error) {
	var exp database.ChaosExperiment
	return &exp, s.db.First(&exp, "id = ?", id).Error
}

func clampF(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func clampI(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
