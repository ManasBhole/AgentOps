package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

// AlertRuleService manages threshold-based alert rules and fires them.
type AlertRuleService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewAlertRuleService(db *gorm.DB, logger *zap.Logger) *AlertRuleService {
	return &AlertRuleService{db: db, logger: logger}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

func (s *AlertRuleService) List() ([]database.AlertRule, error) {
	var rules []database.AlertRule
	err := s.db.Order("created_at DESC").Find(&rules).Error
	return rules, err
}

func (s *AlertRuleService) Get(id string) (*database.AlertRule, error) {
	var r database.AlertRule
	err := s.db.First(&r, "id = ?", id).Error
	return &r, err
}

func (s *AlertRuleService) Create(r *database.AlertRule) error {
	return s.db.Create(r).Error
}

func (s *AlertRuleService) Update(id string, updates map[string]any) (*database.AlertRule, error) {
	if err := s.db.Model(&database.AlertRule{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *AlertRuleService) Delete(id string) error {
	return s.db.Delete(&database.AlertRule{}, "id = ?", id).Error
}

func (s *AlertRuleService) ListFirings(ruleID string, limit int) ([]database.AlertFiring, error) {
	var firings []database.AlertFiring
	q := s.db.Order("fired_at DESC").Limit(limit)
	if ruleID != "" {
		q = q.Where("rule_id = ?", ruleID)
	}
	err := q.Find(&firings).Error
	return firings, err
}

// ── Evaluation loop ───────────────────────────────────────────────────────────

// EvaluateAll runs every enabled rule and fires notifications as needed.
// Call this on a ticker (e.g. every 60 s).
func (s *AlertRuleService) EvaluateAll() {
	var rules []database.AlertRule
	if err := s.db.Where("enabled = ?", true).Find(&rules).Error; err != nil {
		s.logger.Error("alert eval: list rules failed", zap.Error(err))
		return
	}

	for _, rule := range rules {
		agentIDs := s.resolveAgentIDs(rule.AgentID)
		for _, agentID := range agentIDs {
			value, err := s.measureMetric(agentID, rule.Metric)
			if err != nil {
				continue
			}
			breached := s.check(value, rule.Operator, rule.Threshold)
			now := time.Now().UTC()
			s.db.Model(&database.AlertRule{}).Where("id = ?", rule.ID).Update("last_eval_at", now)
			if breached {
				s.fire(rule, agentID, value)
			}
		}
	}
}

func (s *AlertRuleService) resolveAgentIDs(agentID string) []string {
	if agentID != "" {
		return []string{agentID}
	}
	var agents []struct{ ID string }
	s.db.Model(&database.Agent{}).Where("status != ?", "deleted").Select("id").Scan(&agents)
	ids := make([]string, len(agents))
	for i, a := range agents {
		ids[i] = a.ID
	}
	return ids
}

func (s *AlertRuleService) measureMetric(agentID, metric string) (float64, error) {
	window := time.Now().UTC().Add(-1 * time.Hour)
	switch metric {
	case "error_rate":
		var total, errors int64
		s.db.Model(&database.Trace{}).Where("agent_id = ? AND start_time > ?", agentID, window).Count(&total)
		s.db.Model(&database.Trace{}).Where("agent_id = ? AND start_time > ? AND status = ?", agentID, window, "error").Count(&errors)
		if total == 0 {
			return 0, nil
		}
		return float64(errors) / float64(total) * 100, nil

	case "avg_latency_ms":
		var avg *float64
		s.db.Model(&database.Trace{}).
			Select("avg(duration_ms)").
			Where("agent_id = ? AND start_time > ? AND duration_ms > 0", agentID, window).
			Scan(&avg)
		if avg == nil {
			return 0, nil
		}
		return *avg, nil

	case "cost_per_hour":
		var total *float64
		s.db.Model(&database.RouterLog{}).
			Select("sum(cost_est_usd)").
			Where("agent_id = ? AND created_at > ?", agentID, window).
			Scan(&total)
		if total == nil {
			return 0, nil
		}
		return *total, nil
	}
	return 0, fmt.Errorf("unknown metric: %s", metric)
}

func (s *AlertRuleService) check(value float64, operator string, threshold float64) bool {
	switch operator {
	case "gt":
		return value > threshold
	case "lt":
		return value < threshold
	}
	return false
}

func (s *AlertRuleService) fire(rule database.AlertRule, agentID string, value float64) {
	msg := fmt.Sprintf("Alert '%s': %s for agent %s is %.2f (%s %.2f)",
		rule.Name, rule.Metric, agentID, value, rule.Operator, rule.Threshold)

	firing := database.AlertFiring{
		ID:           fmt.Sprintf("af_%d", time.Now().UnixNano()),
		RuleID:       rule.ID,
		RuleName:     rule.Name,
		AgentID:      agentID,
		Metric:       rule.Metric,
		CurrentValue: value,
		Threshold:    rule.Threshold,
		Operator:     rule.Operator,
		Message:      msg,
		Status:       "firing",
		FiredAt:      time.Now().UTC(),
	}
	s.db.Create(&firing)

	now := time.Now().UTC()
	s.db.Model(&database.AlertRule{}).Where("id = ?", rule.ID).Update("last_fired_at", now)

	var channels []string
	_ = json.Unmarshal([]byte(rule.Channels), &channels)
	for _, ch := range channels {
		switch ch {
		case "webhook":
			s.deliverWebhook(rule, agentID, value, msg)
		case "slack":
			if rule.SlackURL != "" {
				s.deliverSlack(rule.SlackURL, msg)
			}
		}
	}
}

func (s *AlertRuleService) deliverWebhook(rule database.AlertRule, agentID string, value float64, msg string) {
	whs := NewWebhookService(s.db, s.logger)
	whs.Fire("alert.rule_fired", map[string]any{
		"rule_id":       rule.ID,
		"rule_name":     rule.Name,
		"agent_id":      agentID,
		"metric":        rule.Metric,
		"current_value": value,
		"threshold":     rule.Threshold,
		"operator":      rule.Operator,
		"message":       msg,
	})
}

func (s *AlertRuleService) deliverSlack(url, msg string) {
	payload := map[string]string{"text": msg}
	b, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		s.logger.Warn("slack delivery failed", zap.Error(err))
		return
	}
	resp.Body.Close()
}
