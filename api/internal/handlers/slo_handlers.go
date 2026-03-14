package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/slo/status — all SLO statuses with burn rates
func (h *Handlers) GetSLOStatuses(c *gin.Context) {
	statuses, err := h.sloService.GetAllStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"statuses": statuses, "total": len(statuses)})
}

// GET /api/v1/slo — list definitions
func (h *Handlers) ListSLOs(c *gin.Context) {
	slos, err := h.sloService.List(c.Query("agent_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"slos": slos})
}

// POST /api/v1/slo
func (h *Handlers) CreateSLO(c *gin.Context) {
	var req struct {
		AgentID     string  `json:"agent_id" binding:"required"`
		Name        string  `json:"name" binding:"required"`
		SLIType     string  `json:"sli_type" binding:"required"`
		TargetValue float64 `json:"target_value" binding:"required"`
		WindowDays  int     `json:"window_days"`
		ThresholdMs int64   `json:"threshold_ms"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.WindowDays <= 0 {
		req.WindowDays = 30
	}
	slo, err := h.sloService.Create(req.AgentID, req.Name, req.SLIType, req.TargetValue, req.WindowDays, req.ThresholdMs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, slo)
}

// DELETE /api/v1/slo/:id
func (h *Handlers) DeleteSLO(c *gin.Context) {
	if err := h.sloService.Delete(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// GET /api/v1/slo/:id/history?hours=24
func (h *Handlers) GetSLOHistory(c *gin.Context) {
	hours := 24
	if v, err := strconv.Atoi(c.Query("hours")); err == nil {
		hours = v
	}
	history, err := h.sloService.BurnRateHistory(c.Param("id"), hours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"history": history})
}
