package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/manasbhole/orion/api/internal/database"
)

// GET /api/v1/stats/live
// Returns token usage buckets, cost burn rate, and fleet uptime %.
func (h *Handlers) GetLiveStats(c *gin.Context) {
	ctx := c.Request.Context()
	now := time.Now().UTC()

	// ── Token / trace counts (proxy for LLM calls) ────────────────────────────
	var count1h, count24h, count7d int64
	h.db.WithContext(ctx).Model(&database.Trace{}).Where("start_time > ?", now.Add(-1*time.Hour)).Count(&count1h)
	h.db.WithContext(ctx).Model(&database.Trace{}).Where("start_time > ?", now.Add(-24*time.Hour)).Count(&count24h)
	h.db.WithContext(ctx).Model(&database.Trace{}).Where("start_time > ?", now.Add(-7*24*time.Hour)).Count(&count7d)

	// ── Cost burn (from router logs) ──────────────────────────────────────────
	var cost1h, cost24h *float64
	h.db.WithContext(ctx).Model(&database.RouterLog{}).
		Select("sum(cost_est_usd)").
		Where("created_at > ?", now.Add(-1*time.Hour)).
		Scan(&cost1h)
	h.db.WithContext(ctx).Model(&database.RouterLog{}).
		Select("sum(cost_est_usd)").
		Where("created_at > ?", now.Add(-24*time.Hour)).
		Scan(&cost24h)

	safeF := func(p *float64) float64 {
		if p == nil {
			return 0
		}
		return *p
	}

	costPerHour := safeF(cost1h)
	costPerDayProjection := costPerHour * 24
	if safeF(cost24h) > 0 {
		costPerDayProjection = safeF(cost24h)
	}

	// ── Agent uptime (ok traces / total traces last 30d, per active agent) ───
	var agents []database.Agent
	h.db.WithContext(ctx).Where("status = ?", "active").Find(&agents)

	agentUptimes := make([]map[string]any, 0, len(agents))
	var totalUptime float64
	window30 := now.Add(-30 * 24 * time.Hour)

	for _, ag := range agents {
		var total, ok int64
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ?", ag.ID, window30).Count(&total)
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ? AND status = ?", ag.ID, window30, "ok").Count(&ok)

		pct := 100.0
		if total > 0 {
			pct = float64(ok) / float64(total) * 100
		}
		totalUptime += pct
		agentUptimes = append(agentUptimes, map[string]any{
			"agent_id":   ag.ID,
			"agent_name": ag.Name,
			"uptime_pct": round2(pct),
			"ok_traces":  ok,
			"total":      total,
		})
	}

	fleetUptime := 100.0
	if len(agents) > 0 {
		fleetUptime = totalUptime / float64(len(agents))
	}

	c.JSON(http.StatusOK, gin.H{
		"tokens": gin.H{
			"last_1h":  count1h,
			"last_24h": count24h,
			"last_7d":  count7d,
		},
		"cost": gin.H{
			"per_hour":          round2(costPerHour),
			"per_day_projected": round2(costPerDayProjection),
			"last_24h_actual":   round2(safeF(cost24h)),
		},
		"uptime": gin.H{
			"fleet_pct": round2(fleetUptime),
			"agents":    agentUptimes,
		},
		"computed_at": now,
	})
}

// GET /api/v1/agents/compare?ids=id1,id2,id3
// Returns side-by-side metrics for up to 5 agents.
func (h *Handlers) CompareAgents(c *gin.Context) {
	ctx := c.Request.Context()
	rawIDs := c.Query("ids")
	if rawIDs == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids query param required (comma-separated)"})
		return
	}
	ids := strings.Split(rawIDs, ",")
	if len(ids) > 5 {
		ids = ids[:5]
	}

	now := time.Now().UTC()
	window24h := now.Add(-24 * time.Hour)
	window7d := now.Add(-7 * 24 * time.Hour)
	window30d := now.Add(-30 * 24 * time.Hour)

	results := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		var agent database.Agent
		if err := h.db.WithContext(ctx).First(&agent, "id = ?", id).Error; err != nil {
			continue
		}

		var total24h, errors24h int64
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ?", id, window24h).Count(&total24h)
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ? AND status = ?", id, window24h, "error").Count(&errors24h)

		var avgLatency *float64
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Select("avg(duration_ms)").
			Where("agent_id = ? AND start_time > ? AND duration_ms > 0", id, window24h).
			Scan(&avgLatency)

		var p95Latency *float64
		h.db.WithContext(ctx).Raw(`
			SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
			FROM traces WHERE agent_id = ? AND start_time > ? AND duration_ms > 0`, id, window24h).
			Scan(&p95Latency)

		var cost7d, cost30d *float64
		h.db.WithContext(ctx).Model(&database.RouterLog{}).
			Select("sum(cost_est_usd)").
			Where("agent_id = ? AND created_at > ?", id, window7d).Scan(&cost7d)
		h.db.WithContext(ctx).Model(&database.RouterLog{}).
			Select("sum(cost_est_usd)").
			Where("agent_id = ? AND created_at > ?", id, window30d).Scan(&cost30d)

		var total30d, ok30d int64
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ?", id, window30d).Count(&total30d)
		h.db.WithContext(ctx).Model(&database.Trace{}).
			Where("agent_id = ? AND start_time > ? AND status = ?", id, window30d, "ok").Count(&ok30d)

		uptime := 100.0
		if total30d > 0 {
			uptime = float64(ok30d) / float64(total30d) * 100
		}

		errorRate := 0.0
		if total24h > 0 {
			errorRate = float64(errors24h) / float64(total24h) * 100
		}

		safeF := func(p *float64) float64 {
			if p == nil {
				return 0
			}
			return *p
		}

		var incidentCount int64
		h.db.WithContext(ctx).Model(&database.Incident{}).
			Where("agent_id = ? AND created_at > ? AND status != ?", id, window30d, "resolved").
			Count(&incidentCount)

		results = append(results, map[string]any{
			"agent_id":       agent.ID,
			"agent_name":     agent.Name,
			"agent_type":     agent.Type,
			"agent_status":   agent.Status,
			"traces_24h":     total24h,
			"errors_24h":     errors24h,
			"error_rate_pct": round2(errorRate),
			"avg_latency_ms": round2(safeF(avgLatency)),
			"p95_latency_ms": round2(safeF(p95Latency)),
			"cost_7d_usd":    round2(safeF(cost7d)),
			"cost_30d_usd":   round2(safeF(cost30d)),
			"uptime_30d_pct": round2(uptime),
			"open_incidents": incidentCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{"agents": results, "count": len(results)})
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
