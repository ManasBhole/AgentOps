package services

import (
	"encoding/json"
	"fmt"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/manasbhole/orion/api/internal/database"
)

type BudgetService struct {
	db     *gorm.DB
	logger *zap.Logger
}

type BudgetStatus struct {
	AgentID         string  `json:"agent_id"`
	DailyLimitUSD   float64 `json:"daily_limit_usd"`
	MonthlyLimitUSD float64 `json:"monthly_limit_usd"`
	AlertPct        float64 `json:"alert_threshold_pct"`
	DailySpendUSD   float64 `json:"daily_spend_usd"`
	MonthlySpendUSD float64 `json:"monthly_spend_usd"`
	DailyPct        float64 `json:"daily_pct"`
	MonthlyPct      float64 `json:"monthly_pct"`
	DailyStatus     string  `json:"daily_status"`   // ok | warning | exceeded
	MonthlyStatus   string  `json:"monthly_status"` // ok | warning | exceeded
}

func NewBudgetService(db *gorm.DB, logger *zap.Logger) *BudgetService {
	return &BudgetService{db: db, logger: logger}
}

// Set upserts the budget config for an agent.
func (s *BudgetService) Set(agentID string, dailyLimit, monthlyLimit, alertPct float64) (*database.AgentBudget, error) {
	budget := database.AgentBudget{
		AgentID:           agentID,
		DailyLimitUSD:     dailyLimit,
		MonthlyLimitUSD:   monthlyLimit,
		AlertThresholdPct: alertPct,
		Active:            true,
		UpdatedAt:         time.Now().UTC(),
	}
	err := s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "agent_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"daily_limit_usd", "monthly_limit_usd", "alert_threshold_pct", "active", "updated_at",
		}),
	}).Create(&budget).Error
	return &budget, err
}

// Get returns the budget config for an agent.
func (s *BudgetService) Get(agentID string) (*database.AgentBudget, error) {
	var b database.AgentBudget
	err := s.db.First(&b, "agent_id = ?", agentID).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Status computes current spend vs limits for an agent.
func (s *BudgetService) Status(agentID string) (*BudgetStatus, error) {
	budget, err := s.Get(agentID)
	if err != nil {
		return nil, err
	}

	daily := s.computeSpend(agentID, time.Now().UTC().Add(-24*time.Hour))
	monthly := s.computeSpend(agentID, time.Now().UTC().AddDate(0, -1, 0))

	dailyPct, monthlyPct := 0.0, 0.0
	if budget.DailyLimitUSD > 0 {
		dailyPct = (daily / budget.DailyLimitUSD) * 100
	}
	if budget.MonthlyLimitUSD > 0 {
		monthlyPct = (monthly / budget.MonthlyLimitUSD) * 100
	}

	return &BudgetStatus{
		AgentID:         agentID,
		DailyLimitUSD:   budget.DailyLimitUSD,
		MonthlyLimitUSD: budget.MonthlyLimitUSD,
		AlertPct:        budget.AlertThresholdPct,
		DailySpendUSD:   daily,
		MonthlySpendUSD: monthly,
		DailyPct:        dailyPct,
		MonthlyPct:      monthlyPct,
		DailyStatus:     budgetStatusLabel(dailyPct, budget.AlertThresholdPct),
		MonthlyStatus:   budgetStatusLabel(monthlyPct, budget.AlertThresholdPct),
	}, nil
}

// AllStatuses returns budget status for every agent that has a budget set.
func (s *BudgetService) AllStatuses() []BudgetStatus {
	var budgets []database.AgentBudget
	s.db.Where("active = ?", true).Find(&budgets)
	result := make([]BudgetStatus, 0, len(budgets))
	for _, b := range budgets {
		if st, err := s.Status(b.AgentID); err == nil {
			result = append(result, *st)
		}
	}
	return result
}

// computeSpend sums llm.cost_usd from trace attributes since `since`.
func (s *BudgetService) computeSpend(agentID string, since time.Time) float64 {
	var traces []database.Trace
	s.db.Where("agent_id = ? AND created_at > ? AND status = ?", agentID, since, "ok").Find(&traces)

	var total float64
	for _, t := range traces {
		var attrs map[string]interface{}
		if err := json.Unmarshal([]byte(t.Attributes), &attrs); err != nil {
			continue
		}
		if cost, ok := attrs["llm.cost_usd"].(float64); ok {
			total += cost
		}
	}
	return total
}

func budgetStatusLabel(pct, alertThreshold float64) string {
	if alertThreshold == 0 {
		alertThreshold = 80
	}
	switch {
	case pct >= 100:
		return "exceeded"
	case pct >= alertThreshold:
		return "warning"
	default:
		return "ok"
	}
}

// FormatUSD formats a dollar amount for display.
func FormatUSD(v float64) string {
	if v < 0.01 {
		return fmt.Sprintf("$%.5f", v)
	}
	return fmt.Sprintf("$%.4f", v)
}
