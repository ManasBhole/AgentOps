package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/manasbhole/orion/api/internal/middleware"
)

// GET /api/v1/timetravel/timelines
func (h *Handlers) ListTimelines(c *gin.Context) {
	limit := 30
	if v, err := strconv.Atoi(c.Query("limit")); err == nil {
		limit = v
	}
	timelines, err := h.timeTravelService.ListTimelines(c.Query("agent_id"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"timelines": timelines})
}

// GET /api/v1/timetravel/timelines/:traceID
func (h *Handlers) GetTimeline(c *gin.Context) {
	timeline, err := h.timeTravelService.BuildTimeline(c.Param("traceID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"timeline": timeline})
}

// GET /api/v1/timetravel/compare?a=traceID1&b=traceID2
func (h *Handlers) CompareTimelines(c *gin.Context) {
	result, err := h.timeTravelService.CompareForks(c.Query("a"), c.Query("b"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// POST /api/v1/timetravel/fork
func (h *Handlers) CreateTimelineFork(c *gin.Context) {
	var req struct {
		TraceID    string `json:"trace_id" binding:"required"`
		SnapshotID string `json:"snapshot_id" binding:"required"`
		Label      string `json:"label" binding:"required"`
		Notes      string `json:"notes"`
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
	fork, err := h.timeTravelService.CreateFork(req.TraceID, req.SnapshotID, req.Label, req.Notes, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, fork)
}
