package handlers

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/agentops/agentops/api/internal/database"
)

type FlameNode struct {
	ID       string       `json:"id"`
	Name     string       `json:"name"`
	Duration int64        `json:"duration_ms"`
	Status   string       `json:"status"`
	AgentID  string       `json:"agent_id"`
	CostUSD  float64      `json:"cost_usd"`
	Tokens   int64        `json:"tokens"`
	Children []*FlameNode `json:"children"`
}

// GET /api/v1/flame/:traceID
func (h *Handlers) GetFlameGraph(c *gin.Context) {
	traceID := c.Param("traceID")

	var spans []database.Trace
	if err := h.db.Where("trace_id = ?", traceID).
		Order("start_time ASC").Find(&spans).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(spans) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}

	// Build node map
	nodes := make(map[string]*FlameNode, len(spans))
	for i := range spans {
		s := &spans[i]
		dur := s.Duration
		if dur == 0 && s.EndTime != nil {
			dur = s.EndTime.Sub(s.StartTime).Milliseconds()
		}
		nodes[s.SpanID] = &FlameNode{
			ID:       s.SpanID,
			Name:     s.Name,
			Duration: dur,
			Status:   s.Status,
			AgentID:  s.AgentID,
			Children: []*FlameNode{},
		}
	}

	// Wire parent-child relationships
	var roots []*FlameNode
	for i := range spans {
		s := &spans[i]
		node := nodes[s.SpanID]
		if s.ParentID == "" {
			roots = append(roots, node)
		} else if parent, ok := nodes[s.ParentID]; ok {
			parent.Children = append(parent.Children, node)
		} else {
			roots = append(roots, node)
		}
	}

	// Sort children by duration desc
	var sortChildren func(n *FlameNode)
	sortChildren = func(n *FlameNode) {
		sort.Slice(n.Children, func(i, j int) bool {
			return n.Children[i].Duration > n.Children[j].Duration
		})
		for _, child := range n.Children {
			sortChildren(child)
		}
	}
	for _, root := range roots {
		sortChildren(root)
	}

	if roots == nil {
		roots = []*FlameNode{}
	}

	// Total duration
	var totalDur int64
	for _, r := range roots {
		totalDur += r.Duration
	}

	c.JSON(http.StatusOK, gin.H{
		"trace_id":     traceID,
		"span_count":   len(spans),
		"total_dur_ms": totalDur,
		"roots":        roots,
	})
}

// GET /api/v1/flame — list traces available for flame graph
func (h *Handlers) ListFlameTraces(c *gin.Context) {
	type TraceRow struct {
		TraceID   string `json:"trace_id"`
		AgentID   string `json:"agent_id"`
		SpanCount int64  `json:"span_count"`
		StartTime string `json:"start_time"`
	}
	var rows []TraceRow
	h.db.Raw(`
		SELECT trace_id, agent_id, COUNT(*) as span_count, MIN(start_time) as start_time
		FROM traces
		WHERE trace_id != ''
		GROUP BY trace_id, agent_id
		ORDER BY start_time DESC
		LIMIT 100
	`).Scan(&rows)
	if rows == nil {
		rows = []TraceRow{}
	}
	c.JSON(http.StatusOK, rows)
}
