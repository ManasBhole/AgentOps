package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type CostBreakdownItem struct {
	AgentID     string  `json:"agent_id"`
	AgentName   string  `json:"agent_name"`
	TotalCostUSD float64 `json:"total_cost_usd"`
	TraceCount  int64   `json:"trace_count"`
	TokensUsed  int64   `json:"tokens_used"`
	AvgCostPerCall float64 `json:"avg_cost_per_call"`
	PctOfTotal  float64 `json:"pct_of_total"`
}

type DailyCostRow struct {
	Day     string  `json:"day"`
	AgentID string  `json:"agent_id"`
	Cost    float64 `json:"cost_usd"`
}

// GET /api/v1/cost/breakdown
func (h *Handlers) GetCostBreakdown(c *gin.Context) {
	days := 30
	since := time.Now().UTC().AddDate(0, 0, -days)

	// Aggregate from router_logs (has cost_est_usd)
	type RouterCost struct {
		AgentID      string  `json:"agent_id"`
		TotalCostUSD float64 `json:"total_cost_usd"`
		CallCount    int64   `json:"call_count"`
	}
	var routerCosts []RouterCost
	h.db.Raw(`
		SELECT agent_id, SUM(cost_est_usd) as total_cost_usd, COUNT(*) as call_count
		FROM router_logs
		WHERE created_at >= ?
		GROUP BY agent_id
	`, since).Scan(&routerCosts)

	// Aggregate from behavioral_fingerprints (has total_cost_usd per window)
	type FpCost struct {
		AgentID      string  `json:"agent_id"`
		TotalCostUSD float64 `json:"total_cost_usd"`
		SampleCount  int64   `json:"sample_count"`
	}
	var fpCosts []FpCost
	h.db.Raw(`
		SELECT agent_id, SUM(total_cost_usd) as total_cost_usd, SUM(sample_count) as sample_count
		FROM behavioral_fingerprints
		WHERE computed_at >= ? AND window = '24h'
		GROUP BY agent_id
	`, since).Scan(&fpCosts)

	// Merge costs by agent
	costMap := make(map[string]*CostBreakdownItem)
	for _, rc := range routerCosts {
		costMap[rc.AgentID] = &CostBreakdownItem{
			AgentID:     rc.AgentID,
			TotalCostUSD: rc.TotalCostUSD,
			TraceCount:  rc.CallCount,
		}
	}
	for _, fc := range fpCosts {
		if item, ok := costMap[fc.AgentID]; ok {
			if fc.TotalCostUSD > item.TotalCostUSD {
				item.TotalCostUSD = fc.TotalCostUSD
			}
			item.TokensUsed = fc.SampleCount
		} else {
			costMap[fc.AgentID] = &CostBreakdownItem{
				AgentID:     fc.AgentID,
				TotalCostUSD: fc.TotalCostUSD,
				TokensUsed:  fc.SampleCount,
			}
		}
	}

	// Fetch agent names
	type AgentName struct {
		ID   string
		Name string
	}
	var agents []AgentName
	h.db.Raw("SELECT id, name FROM agents").Scan(&agents)
	nameMap := make(map[string]string)
	for _, a := range agents {
		nameMap[a.ID] = a.Name
	}

	var total float64
	items := make([]*CostBreakdownItem, 0, len(costMap))
	for _, item := range costMap {
		if item.AgentName == "" {
			item.AgentName = nameMap[item.AgentID]
			if item.AgentName == "" {
				item.AgentName = item.AgentID
			}
		}
		if item.TraceCount > 0 {
			item.AvgCostPerCall = item.TotalCostUSD / float64(item.TraceCount)
		}
		total += item.TotalCostUSD
		items = append(items, item)
	}
	for _, item := range items {
		if total > 0 {
			item.PctOfTotal = (item.TotalCostUSD / total) * 100
		}
	}

	if items == nil {
		items = []*CostBreakdownItem{}
	}

	c.JSON(http.StatusOK, gin.H{
		"items":           items,
		"total_cost_usd":  total,
		"period_days":     days,
	})
}

// GET /api/v1/cost/daily
func (h *Handlers) GetDailyCost(c *gin.Context) {
	var rows []DailyCostRow
	h.db.Raw(`
		SELECT DATE(created_at) as day, agent_id, SUM(cost_est_usd) as cost_usd
		FROM router_logs
		WHERE created_at >= NOW() - INTERVAL '30 days'
		GROUP BY DATE(created_at), agent_id
		ORDER BY day ASC
	`).Scan(&rows)
	if rows == nil {
		rows = []DailyCostRow{}
	}
	c.JSON(http.StatusOK, rows)
}
