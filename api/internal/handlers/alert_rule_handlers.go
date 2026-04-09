package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/manasbhole/orion/api/internal/database"
	"github.com/manasbhole/orion/api/internal/middleware"
)

// GET /api/v1/alert-rules
func (h *Handlers) ListAlertRules(c *gin.Context) {
	rules, err := h.alertRuleService.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rules": rules, "count": len(rules)})
}

// POST /api/v1/alert-rules
func (h *Handlers) CreateAlertRule(c *gin.Context) {
	var body struct {
		Name      string   `json:"name" binding:"required"`
		AgentID   string   `json:"agent_id"`
		Metric    string   `json:"metric" binding:"required"`
		Operator  string   `json:"operator" binding:"required"`
		Threshold float64  `json:"threshold"`
		Channels  []string `json:"channels"`
		SlackURL  string   `json:"slack_url"`
		EmailTo   string   `json:"email_to"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validMetrics := map[string]bool{"error_rate": true, "avg_latency_ms": true, "cost_per_hour": true}
	if !validMetrics[body.Metric] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid metric, must be: error_rate, avg_latency_ms, cost_per_hour"})
		return
	}
	if body.Operator != "gt" && body.Operator != "lt" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "operator must be gt or lt"})
		return
	}

	channels, _ := json.Marshal(body.Channels)
	claims := middleware.GetClaims(c)
	createdBy := ""
	if claims != nil {
		createdBy = claims.Email
	}

	rule := &database.AlertRule{
		ID:        "ar_" + uuid.New().String()[:8],
		Name:      body.Name,
		AgentID:   body.AgentID,
		Metric:    body.Metric,
		Operator:  body.Operator,
		Threshold: body.Threshold,
		Channels:  string(channels),
		SlackURL:  body.SlackURL,
		EmailTo:   body.EmailTo,
		Enabled:   true,
		CreatedBy: createdBy,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := h.alertRuleService.Create(rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"rule": rule})
}

// PATCH /api/v1/alert-rules/:id
func (h *Handlers) UpdateAlertRule(c *gin.Context) {
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body["updated_at"] = time.Now().UTC()
	rule, err := h.alertRuleService.Update(c.Param("id"), body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rule": rule})
}

// DELETE /api/v1/alert-rules/:id
func (h *Handlers) DeleteAlertRule(c *gin.Context) {
	if err := h.alertRuleService.Delete(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// GET /api/v1/alert-rules/:id/firings
func (h *Handlers) ListAlertFirings(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	firings, err := h.alertRuleService.ListFirings(c.Param("id"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"firings": firings, "count": len(firings)})
}

// GET /api/v1/alert-rules/firings
func (h *Handlers) ListAllFirings(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	firings, err := h.alertRuleService.ListFirings("", limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"firings": firings, "count": len(firings)})
}
