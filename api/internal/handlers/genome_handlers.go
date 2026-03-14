package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/genome/fleet
func (h *Handlers) GetFleetGenomeDrift(c *gin.Context) {
	genomes, err := h.genomeService.GetFleetDrift()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, genomes)
}

// GET /api/v1/genome/:agentID
func (h *Handlers) GetAgentGenome(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	genomes, err := h.genomeService.GetGenomeHistory(c.Param("agentID"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, genomes)
}

// POST /api/v1/genome/:agentID/compute
func (h *Handlers) ComputeAgentGenome(c *gin.Context) {
	genome, err := h.genomeService.ComputeAndStore(c.Param("agentID"))
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, genome)
}
