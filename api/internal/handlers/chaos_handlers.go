package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manasbhole/orion/api/internal/middleware"
)

// POST /api/v1/chaos/experiments
func (h *Handlers) CreateChaosExperiment(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var req struct {
		AgentID     string  `json:"agent_id" binding:"required"`
		FaultType   string  `json:"fault_type" binding:"required"`
		Intensity   float64 `json:"intensity"`
		DurationSec int     `json:"duration_sec"`
		Notes       string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Intensity <= 0 || req.Intensity > 1 {
		req.Intensity = 0.5
	}
	if req.DurationSec <= 0 {
		req.DurationSec = 30
	}
	exp, err := h.chaosService.RunExperiment(req.AgentID, req.FaultType, req.Notes, claims.UserID, req.Intensity, req.DurationSec)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, exp)
}

// GET /api/v1/chaos/experiments
func (h *Handlers) ListChaosExperiments(c *gin.Context) {
	agentID := c.Query("agent_id")
	exps, err := h.chaosService.ListExperiments(agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, exps)
}

// GET /api/v1/chaos/experiments/:id
func (h *Handlers) GetChaosExperiment(c *gin.Context) {
	exp, err := h.chaosService.GetExperiment(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "experiment not found"})
		return
	}
	c.JSON(http.StatusOK, exp)
}
