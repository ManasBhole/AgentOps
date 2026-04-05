package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ListRedTeamVectors GET /api/v1/redteam/vectors
func (h *Handlers) ListRedTeamVectors(c *gin.Context) {
	vectors, err := h.redTeamService.ListVectors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"vectors": vectors})
}

// ListRedTeamScans GET /api/v1/redteam/scans?agent_id=
func (h *Handlers) ListRedTeamScans(c *gin.Context) {
	scans, err := h.redTeamService.ListScans(c.Query("agent_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"scans": scans})
}

// GetRedTeamScan GET /api/v1/redteam/scans/:id
func (h *Handlers) GetRedTeamScan(c *gin.Context) {
	scan, err := h.redTeamService.GetScan(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, scan)
}

// RunRedTeamScan POST /api/v1/redteam/scan
func (h *Handlers) RunRedTeamScan(c *gin.Context) {
	var req struct {
		AgentID string `json:"agent_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scanID, err := h.redTeamService.RunScan(req.AgentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"scan_id": scanID, "status": "running"})
}

// FleetSecurityScores GET /api/v1/redteam/scores
func (h *Handlers) FleetSecurityScores(c *gin.Context) {
	scores, err := h.redTeamService.FleetScores()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"scores": scores})
}
