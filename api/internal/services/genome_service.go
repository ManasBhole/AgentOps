package services

import (
	"fmt"
	"math"
	"time"

	"github.com/agentops/agentops/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type GenomeService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewGenomeService(db *gorm.DB, logger *zap.Logger) *GenomeService {
	return &GenomeService{db: db, logger: logger}
}

// ComputeAndStore builds a new genome snapshot from the latest fingerprint for an agent.
func (s *GenomeService) ComputeAndStore(agentID string) (*database.AgentGenome, error) {
	var fp database.BehavioralFingerprint
	if err := s.db.Where("agent_id = ?", agentID).
		Order("computed_at DESC").First(&fp).Error; err != nil {
		return nil, fmt.Errorf("no fingerprint found for agent %s", agentID)
	}

	genome := database.AgentGenome{
		ID:           fmt.Sprintf("genome_%d", time.Now().UnixNano()),
		AgentID:      agentID,
		WindowStart:  fp.WindowStart,
		ErrorRate:    fp.ErrorRate,
		AvgLatencyMs: fp.AvgLatencyMs,
		AvgCostUSD:   fp.AvgCostPerReqUSD,
		HealthScore:  float64(fp.HealthScore),
		AvgTokens:    fp.AvgTokensPerReq,
		ComputedAt:   time.Now().UTC(),
	}

	// Compute drift vs previous genome
	var prev database.AgentGenome
	if err := s.db.Where("agent_id = ?", agentID).
		Order("computed_at DESC").First(&prev).Error; err == nil {
		genome.DriftScore = euclidean(
			[5]float64{genome.ErrorRate, genome.AvgLatencyMs / 1000.0, genome.AvgCostUSD * 100, genome.HealthScore / 100.0, genome.AvgTokens / 1000.0},
			[5]float64{prev.ErrorRate, prev.AvgLatencyMs / 1000.0, prev.AvgCostUSD * 100, prev.HealthScore / 100.0, prev.AvgTokens / 1000.0},
		)
		genome.IsDrifted = genome.DriftScore > 0.25
	}

	return &genome, s.db.Create(&genome).Error
}

// GetGenomeHistory returns recent genome snapshots for an agent.
func (s *GenomeService) GetGenomeHistory(agentID string, limit int) ([]database.AgentGenome, error) {
	var genomes []database.AgentGenome
	return genomes, s.db.Where("agent_id = ?", agentID).
		Order("computed_at DESC").Limit(limit).Find(&genomes).Error
}

// GetFleetDrift returns the latest genome for every agent with drift > threshold.
func (s *GenomeService) GetFleetDrift() ([]database.AgentGenome, error) {
	var genomes []database.AgentGenome
	// Get latest genome per agent
	subq := s.db.Table("agent_genomes").
		Select("agent_id, MAX(computed_at) as max_computed").
		Group("agent_id")

	err := s.db.Table("agent_genomes ag").
		Joins("JOIN (?) sub ON ag.agent_id = sub.agent_id AND ag.computed_at = sub.max_computed", subq).
		Order("ag.drift_score DESC").
		Find(&genomes).Error
	return genomes, err
}

func euclidean(a, b [5]float64) float64 {
	var sum float64
	for i := range a {
		d := a[i] - b[i]
		sum += d * d
	}
	return math.Sqrt(sum)
}
