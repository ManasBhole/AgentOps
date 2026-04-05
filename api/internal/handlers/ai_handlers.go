package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AnalyzeIncident calls Claude to generate a root cause analysis for an incident.
// POST /api/v1/incidents/:id/analyze
func (h *Handlers) AnalyzeIncident(c *gin.Context) {
	id := c.Param("id")
	result, err := h.aiAnalysisService.AnalyzeIncident(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
