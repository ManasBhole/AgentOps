package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/agentops/agentops/api/internal/middleware"
)

// POST /api/v1/blast-radius/simulate
func (h *Handlers) RunBlastRadius(c *gin.Context) {
	var req struct {
		SourceAgentID string `json:"source_agent_id" binding:"required"`
		ChangeType    string `json:"change_type" binding:"required"`
		ChangeDesc    string `json:"change_desc"`
		Iterations    int    `json:"iterations"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims := middleware.GetClaims(c)
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	out, err := h.blastRadiusService.Run(
		req.SourceAgentID, req.ChangeType, req.ChangeDesc, userID, req.Iterations,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

// GET /api/v1/blast-radius/simulations?agent_id=&limit=
func (h *Handlers) ListBlastRadiusSimulations(c *gin.Context) {
	limit := 20
	if v, err := strconv.Atoi(c.Query("limit")); err == nil {
		limit = v
	}
	sims, err := h.blastRadiusService.List(c.Query("agent_id"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"simulations": sims, "total": len(sims)})
}

// GET /api/v1/blast-radius/simulations/:id
func (h *Handlers) GetBlastRadiusSimulation(c *gin.Context) {
	out, err := h.blastRadiusService.Get(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}
