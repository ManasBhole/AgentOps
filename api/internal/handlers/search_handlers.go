package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/search?q=...
func (h *Handlers) Search(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"agents": []any{}, "traces": []any{}, "incidents": []any{}})
		return
	}
	like := "%" + strings.ToLower(q) + "%"

	var agents []map[string]any
	h.db.Raw(
		`SELECT id, name, status, type FROM agents WHERE LOWER(name) LIKE ? OR LOWER(id) LIKE ? LIMIT 5`,
		like, like,
	).Scan(&agents)

	var traces []map[string]any
	h.db.Raw(
		`SELECT id, agent_id, status FROM traces WHERE LOWER(id) LIKE ? OR LOWER(agent_id) LIKE ? LIMIT 5`,
		like, like,
	).Scan(&traces)

	var incidents []map[string]any
	h.db.Raw(
		`SELECT id, title, severity, status FROM incidents WHERE LOWER(title) LIKE ? OR LOWER(id) LIKE ? LIMIT 5`,
		like, like,
	).Scan(&incidents)

	if agents == nil {
		agents = []map[string]any{}
	}
	if traces == nil {
		traces = []map[string]any{}
	}
	if incidents == nil {
		incidents = []map[string]any{}
	}

	c.JSON(http.StatusOK, gin.H{
		"agents":    agents,
		"traces":    traces,
		"incidents": incidents,
	})
}
