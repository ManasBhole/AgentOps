package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ListABTests GET /api/v1/prompts/ab-tests
func (h *Handlers) ListABTests(c *gin.Context) {
	tests, err := h.abTestService.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tests": tests})
}

// GetABTest GET /api/v1/prompts/ab-tests/:id
func (h *Handlers) GetABTest(c *gin.Context) {
	t, err := h.abTestService.Get(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

// CreateABTest POST /api/v1/prompts/ab-tests
func (h *Handlers) CreateABTest(c *gin.Context) {
	var req struct {
		Name         string  `json:"name" binding:"required"`
		Description  string  `json:"description"`
		PromptAID    string  `json:"prompt_a_id" binding:"required"`
		PromptBID    string  `json:"prompt_b_id" binding:"required"`
		TrafficSplit float64 `json:"traffic_split"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TrafficSplit == 0 {
		req.TrafficSplit = 0.5
	}
	userID := ""
	if u, ok := c.Get("userID"); ok {
		userID = u.(string)
	}
	t, err := h.abTestService.Create(req.Name, req.Description, req.PromptAID, req.PromptBID, userID, req.TrafficSplit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, t)
}

// RecordABResult POST /api/v1/prompts/ab-tests/:id/record
func (h *Handlers) RecordABResult(c *gin.Context) {
	var req struct {
		Variant   string  `json:"variant" binding:"required"`
		Success   bool    `json:"success"`
		LatencyMS int64   `json:"latency_ms"`
		Tokens    int     `json:"tokens_used"`
		CostUSD   float64 `json:"cost_usd"`
		Feedback  int     `json:"feedback"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.abTestService.RecordResult(c.Param("id"), req.Variant, req.Success, req.LatencyMS, req.Tokens, req.CostUSD, req.Feedback); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "recorded"})
}

// ConcludeABTest POST /api/v1/prompts/ab-tests/:id/conclude
func (h *Handlers) ConcludeABTest(c *gin.Context) {
	var req struct {
		WinnerID string `json:"winner_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t, err := h.abTestService.Conclude(c.Param("id"), req.WinnerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

// SimulateABResults POST /api/v1/prompts/ab-tests/:id/simulate
// Injects synthetic results so the chart fills immediately in demo.
func (h *Handlers) SimulateABResults(c *gin.Context) {
	id := c.Param("id")
	t, err := h.abTestService.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// 40 results per variant with realistic-looking data
	aSuccessRate := 0.72
	bSuccessRate := 0.84
	for i := 0; i < 40; i++ {
		aOk := float64(i%100) < aSuccessRate*100
		bOk := float64(i%100) < bSuccessRate*100
		_ = h.abTestService.RecordResult(id, "a", aOk, int64(800+i*3), 520+i, 0.0032+float64(i)*0.00001, successFeedback(aOk))
		_ = h.abTestService.RecordResult(id, "b", bOk, int64(650+i*2), 480+i, 0.0028+float64(i)*0.00001, successFeedback(bOk))
	}
	_ = t
	c.JSON(http.StatusOK, gin.H{"status": "simulated", "runs_per_variant": 40})
}

func successFeedback(ok bool) int {
	if ok {
		return 1
	}
	return -1
}

