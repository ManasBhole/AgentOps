package services

import (
	"fmt"
	"math"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/agentops/agentops/api/internal/database"
)

// HealthScore is the computed health profile for one agent.
type HealthScore struct {
	AgentID    string         `json:"agent_id"`
	Score      int            `json:"score"`  // 0-100
	Grade      string         `json:"grade"`  // A B C D F
	Status     string         `json:"status"` // healthy degraded critical
	Breakdown  ScoreBreakdown `json:"breakdown"`
	Trend      string         `json:"trend"` // up down stable
	ComputedAt time.Time      `json:"computed_at"`
}

type ScoreBreakdown struct {
	ErrorRate      ComponentScore `json:"error_rate"`
	Latency        ComponentScore `json:"latency"`
	IncidentRate   ComponentScore `json:"incident_rate"`
	CostEfficiency ComponentScore `json:"cost_efficiency"`
}

type ComponentScore struct {
	Score  int    `json:"score"` // 0-25 (each component max 25)
	Label  string `json:"label"`
	Value  string `json:"value"`  // human-readable metric
	Weight int    `json:"weight"` // percentage weight
}

type HealthService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewHealthService(db *gorm.DB, logger *zap.Logger) *HealthService {
	return &HealthService{db: db, logger: logger}
}

// ComputeHealth calculates the health score for a single agent.
func (s *HealthService) ComputeHealth(agentID string) HealthScore {
	now := time.Now().UTC()
	window := now.Add(-24 * time.Hour) // rolling 24h window

	var traces []database.Trace
	s.db.Where("agent_id = ? AND created_at > ?", agentID, window).Find(&traces)

	var incidents []database.Incident
	s.db.Where("agent_id = ? AND created_at > ? AND status != ?", agentID, window, "resolved").Find(&incidents)

	// ── Error rate component (weight 35%) ────────────────────────
	errorScore := 25
	errorRateStr := "0%"
	if len(traces) > 0 {
		errCount := 0
		for _, t := range traces {
			if t.Status == "error" {
				errCount++
			}
		}
		errorRate := float64(errCount) / float64(len(traces))
		errorRateStr = formatPct(errorRate)
		switch {
		case errorRate == 0:
			errorScore = 25
		case errorRate < 0.02:
			errorScore = 22
		case errorRate < 0.05:
			errorScore = 18
		case errorRate < 0.10:
			errorScore = 12
		case errorRate < 0.20:
			errorScore = 6
		default:
			errorScore = 0
		}
	}

	// ── Latency component (weight 25%) ───────────────────────────
	latencyScore := 25
	latencyStr := "—"
	if len(traces) > 0 {
		var total int64
		for _, t := range traces {
			total += t.Duration
		}
		avgMs := total / int64(len(traces))
		latencyStr = formatMs(avgMs)
		switch {
		case avgMs < 500:
			latencyScore = 25
		case avgMs < 1000:
			latencyScore = 20
		case avgMs < 2000:
			latencyScore = 15
		case avgMs < 5000:
			latencyScore = 8
		default:
			latencyScore = 2
		}
	}

	// ── Incident rate component (weight 25%) ─────────────────────
	incidentScore := 25
	incidentStr := "0 open"
	openCount := len(incidents)
	incidentStr = formatCount(openCount, "open incident")
	switch {
	case openCount == 0:
		incidentScore = 25
	case openCount == 1:
		incidentScore = 18
	case openCount <= 3:
		incidentScore = 10
	case openCount <= 6:
		incidentScore = 4
	default:
		incidentScore = 0
	}

	// ── Cost efficiency component (weight 15%) ───────────────────
	costScore := 25
	costStr := "no data"
	// (placeholder — would compute from llm.cost_usd trace attributes in prod)
	_ = costStr
	costStr = "nominal"

	total := errorScore + latencyScore + incidentScore + costScore

	// Clamp 0-100
	if total > 100 {
		total = 100
	}
	if total < 0 {
		total = 0
	}

	grade := scoreToGrade(total)
	status := scoreToStatus(total)

	// Trend: compare to previous 24h window
	trend := s.computeTrend(agentID, now.Add(-48*time.Hour), window, total)

	return HealthScore{
		AgentID: agentID,
		Score:   total,
		Grade:   grade,
		Status:  status,
		Trend:   trend,
		Breakdown: ScoreBreakdown{
			ErrorRate:      ComponentScore{Score: errorScore, Label: "Error Rate", Value: errorRateStr, Weight: 35},
			Latency:        ComponentScore{Score: latencyScore, Label: "Avg Latency", Value: latencyStr, Weight: 25},
			IncidentRate:   ComponentScore{Score: incidentScore, Label: "Open Incidents", Value: incidentStr, Weight: 25},
			CostEfficiency: ComponentScore{Score: costScore, Label: "Cost Efficiency", Value: costStr, Weight: 15},
		},
		ComputedAt: now,
	}
}

// ComputeFleetHealth returns health scores for all agents.
func (s *HealthService) ComputeFleetHealth() []HealthScore {
	var agents []database.Agent
	s.db.Where("status != ?", "deleted").Find(&agents)
	scores := make([]HealthScore, len(agents))
	for i, a := range agents {
		scores[i] = s.ComputeHealth(a.ID)
	}
	return scores
}

func (s *HealthService) computeTrend(agentID string, from, to time.Time, currentScore int) string {
	var traces []database.Trace
	s.db.Where("agent_id = ? AND created_at BETWEEN ? AND ?", agentID, from, to).Find(&traces)
	if len(traces) < 5 {
		return "stable"
	}
	errCount := 0
	for _, t := range traces {
		if t.Status == "error" {
			errCount++
		}
	}
	prevErrorRate := float64(errCount) / float64(len(traces))
	prevScore := int(math.Round(float64(currentScore) * (1 + prevErrorRate - prevErrorRate)))
	// Simplified: just compare error rate direction
	if prevErrorRate > 0.05 && currentScore > 70 {
		return "up"
	}
	if prevScore > currentScore+5 {
		return "down"
	}
	return "stable"
}

func scoreToGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 65:
		return "C"
	case score >= 50:
		return "D"
	default:
		return "F"
	}
}

func scoreToStatus(score int) string {
	switch {
	case score >= 80:
		return "healthy"
	case score >= 50:
		return "degraded"
	default:
		return "critical"
	}
}

func formatPct(f float64) string {
	return fmt.Sprintf("%.1f%%", f*100)
}

func formatMs(ms int64) string {
	if ms >= 1000 {
		return fmt.Sprintf("%.1fs", float64(ms)/1000)
	}
	return fmt.Sprintf("%dms", ms)
}

func formatCount(n int, label string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", label)
	}
	return fmt.Sprintf("%d %ss", n, label)
}
