package handlers

import (
	"net/http"
	"time"

	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/agentops/agentops/api/internal/database"
	"github.com/agentops/agentops/api/internal/middleware"
)

// POST /api/v1/nlq/query
func (h *Handlers) NLQQuery(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var req struct {
		Question string `json:"question" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.nlqService.Query(req.Question)

	// Persist query history
	entry := database.NLQQuery{
		ID:        fmt.Sprintf("nlq_%d", time.Now().UnixNano()),
		UserID:    claims.UserID,
		UserEmail: claims.Email,
		Question:  req.Question,
		CreatedAt: time.Now().UTC(),
	}
	if err != nil {
		entry.Error = err.Error()
		h.db.Create(&entry)
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	entry.GeneratedSQL = result.SQL
	entry.RowCount = result.RowCount
	entry.ChartType = result.ChartType
	entry.DurationMs = result.DurationMs
	h.db.Create(&entry)

	c.JSON(http.StatusOK, result)
}

// GET /api/v1/nlq/history
func (h *Handlers) NLQHistory(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var entries []database.NLQQuery
	h.db.Where("user_id = ?", claims.UserID).
		Order("created_at DESC").Limit(50).Find(&entries)
	c.JSON(http.StatusOK, entries)
}
