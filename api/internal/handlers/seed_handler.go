package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/agentops/agentops/api/internal/database"
)


// SeedIfEmpty is called at startup — silently seeds demo data when the DB has no agents.
func SeedIfEmpty(db *gorm.DB, logger *zap.Logger) {
	var count int64
	db.Model(&database.Agent{}).Count(&count)
	if count >= 5 {
		return
	}
	logger.Info("seeding demo data...")
	if err := runSeed(db); err != nil {
		logger.Error("demo seed failed", zap.Error(err))
	} else {
		logger.Info("demo data seeded successfully")
	}
}

// POST /api/v1/seed  — force re-seed via API (admin use)
func (h *Handlers) SeedDemoData(c *gin.Context) {
	if err := runSeed(h.db); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "seeded"})
}

// GET /api/v1/seed/status
func (h *Handlers) SeedStatus(c *gin.Context) {
	var counts struct{ Agents, Incidents, Traces int64 }
	h.db.Model(&database.Agent{}).Count(&counts.Agents)
	h.db.Model(&database.Incident{}).Count(&counts.Incidents)
	h.db.Model(&database.Trace{}).Count(&counts.Traces)
	c.JSON(http.StatusOK, gin.H{
		"seeded": counts.Agents >= 5, "agents": counts.Agents,
		"incidents": counts.Incidents, "traces": counts.Traces,
	})
}

func runSeed(db *gorm.DB) error {

	rng := rand.New(rand.NewSource(42))
	now := time.Now().UTC()
	day := 24 * time.Hour

	mustJSON := func(v any) string { b, _ := json.Marshal(v); return string(b) }

	// ── Fixed agent IDs ──────────────────────────────────────────────────────
	type agentMeta struct{ id, name, typ string }
	agents := []agentMeta{
		{"agt_research01", "research-agent", "llm"},
		{"agt_codeass02", "code-assistant", "tool-use"},
		{"agt_ragpipe03", "rag-pipeline", "rag"},
		{"agt_orchest04", "orchestrator", "multi-agent"},
		{"agt_dataanl05", "data-analyzer", "custom"},
	}

	// ── Agents ───────────────────────────────────────────────────────────────
	statuses := []string{"active", "active", "active", "active", "paused"}
	dbAgents := make([]database.Agent, len(agents))
	for i, a := range agents {
		dbAgents[i] = database.Agent{
			ID: a.id, Name: a.name, Type: a.typ, Version: "1.0." + fmt.Sprint(i),
			Status: statuses[i], Config: mustJSON(map[string]string{"model": "ai-model-balanced"}),
			CreatedAt: now.Add(-time.Duration(30-i*5) * day), UpdatedAt: now.Add(-time.Duration(i) * day),
		}
	}
	db.Clauses(clause.OnConflict{DoNothing: true}).Create(&dbAgents)

	// ── Traces ───────────────────────────────────────────────────────────────
	type traceMeta struct{ id, agentID, runID string; durationMs int64; status string; start time.Time }
	var traceMetas []traceMeta
	traceStatuses := []string{"ok", "ok", "ok", "error", "ok"}
	for ai, a := range agents {
		for j := 0; j < 10; j++ {
			durMs := int64(200 + rng.Intn(4000))
			start := now.Add(-time.Duration(rng.Intn(72)) * time.Hour)
			end := start.Add(time.Duration(durMs) * time.Millisecond)
			tid := fmt.Sprintf("trc_%s_%02d", a.id[4:12], j)
			rid := fmt.Sprintf("run_%s_%02d", a.id[4:12], j)
			st := traceStatuses[(ai+j)%len(traceStatuses)]
			tokens := int64(800 + rng.Intn(3200))
			cost := float64(tokens) * 0.000003
			attrs := mustJSON(map[string]any{
				"tokens_used": tokens, "cost_usd": cost,
				"model": "ai-model-balanced", "agent_name": a.name,
			})
			span := database.Trace{
				ID: tid, AgentID: a.id, RunID: rid, TraceID: tid,
				SpanID: "spn_root_" + tid, ParentID: "",
				Name: "agent.run", StartTime: start, EndTime: &end,
				Duration: durMs, Status: st,
				Attributes: attrs, Events: "[]", CreatedAt: start,
			}
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&span)

			// 3 child spans per trace
			for k := 0; k < 3; k++ {
				childDur := durMs / 4
				childStart := start.Add(time.Duration(k) * time.Duration(childDur) * time.Millisecond)
				childEnd := childStart.Add(time.Duration(childDur) * time.Millisecond)
				names := []string{"llm.call", "tool.execute", "memory.retrieve"}
				child := database.Trace{
					ID: fmt.Sprintf("%s_c%d", tid, k), AgentID: a.id, RunID: rid, TraceID: tid,
					SpanID: fmt.Sprintf("spn_%s_c%d", tid[4:], k), ParentID: "spn_root_" + tid,
					Name: names[k], StartTime: childStart, EndTime: &childEnd,
					Duration: childDur, Status: st,
					Attributes: attrs, Events: "[]", CreatedAt: childStart,
				}
				db.Clauses(clause.OnConflict{DoNothing: true}).Create(&child)
			}

			traceMetas = append(traceMetas, traceMeta{tid, a.id, rid, durMs, st, start})
		}
	}
	// ── Incidents ───────────────────────────────────────────────────────────
	type incSpec struct {
		id, title, sev, status, agentID, traceID, root, fix string
		conf                                                  float64
		hoursAgo                                              int
	}
	specs := []incSpec{
		{"inc_001", "Token budget exceeded — research-agent", "critical", "open", "agt_research01", "trc_research01_03", "Agent consumed 150% of daily token budget during recursive reasoning loop.", "Implement hard token cap with graceful degradation fallback.", 0.94, 2},
		{"inc_002", "Hallucination detected in rag-pipeline output", "critical", "investigating", "agt_ragpipe03", "trc_ragpipe03_07", "Retrieval context mismatch caused fabricated citations in 23% of responses.", "Add cross-reference validation layer and confidence threshold filter.", 0.91, 5},
		{"inc_003", "Latency spike — code-assistant p99 > 8s", "high", "open", "agt_codeass02", "trc_codeass02_04", "Upstream model API throttling caused cascading queue backlog.", "Implement circuit breaker with exponential backoff. Add replica.", 0.87, 8},
		{"inc_004", "Orchestrator tool-call failure loop", "high", "resolved", "agt_orchest04", "trc_orchest04_02", "Missing null-check in tool response parser caused infinite retry loop.", "Defensive parsing with max-retry guard deployed. Resolved.", 0.95, 48},
		{"inc_005", "Response quality degraded — data-analyzer", "medium", "resolved", "agt_dataanl05", "trc_dataanl05_06", "Stale prompt template produced low-quality structured output.", "Updated prompt template. Quality score restored to 92/100.", 0.79, 72},
		{"inc_006", "Memory overflow — research-agent context window", "medium", "open", "agt_research01", "trc_research01_08", "Agent accumulated 48k tokens of uncompressed memory across 12 hops.", "Enable rolling memory compression after 20k tokens.", 0.82, 14},
		{"inc_007", "Rate limit warning — code-assistant", "low", "resolved", "agt_codeass02", "trc_codeass02_09", "Burst traffic hit provider rate limits during peak load.", "Smoothed request distribution with jitter. Monitoring added.", 0.70, 96},
		{"inc_008", "RAG retrieval latency > 2s", "low", "resolved", "agt_ragpipe03", "trc_ragpipe03_05", "Vector index fragmentation increased retrieval time by 340ms.", "Triggered index compaction. p95 latency back to 480ms.", 0.75, 120},
	}
	for _, s := range specs {
		created := now.Add(-time.Duration(s.hoursAgo) * time.Hour)
		inc := database.Incident{
			ID: s.id, Title: s.title, Severity: s.sev, Status: s.status,
			AgentID: s.agentID, TraceID: s.traceID, RootCause: s.root,
			SuggestedFix: s.fix, Confidence: s.conf,
			CorrelatedTraces: mustJSON([]string{s.traceID}),
			InfraMetrics:     mustJSON(map[string]any{"cpu_pct": 65 + rng.Intn(30), "mem_mb": 512 + rng.Intn(1024)}),
			CreatedAt: created, UpdatedAt: created,
		}
		if s.status == "resolved" {
			t := created.Add(2 * time.Hour)
			inc.ResolvedAt = &t
		}
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&inc)
	}

	// ── Deployments ──────────────────────────────────────────────────────────
	depStatuses := []string{"deployed", "deployed", "deployed", "rolling", "failed"}
	namespaces := []string{"prod-eastus2", "prod-eastus2", "stage-westus3", "dev-westus3", "dev-westus3"}
	for i, a := range agents {
		dep := database.Deployment{
			ID: fmt.Sprintf("dep_%s", a.id), AgentID: a.id,
			Namespace: namespaces[i], Replicas: 1 + i%3,
			Status: depStatuses[i],
			Config: mustJSON(map[string]any{
				"image": "ghcr.io/agentops/agentops-api:main-abc123",
				"resources": map[string]string{"cpu": "500m", "memory": "512Mi"},
			}),
			CreatedAt: now.Add(-time.Duration(20-i*3) * day),
			UpdatedAt: now.Add(-time.Duration(i) * day),
		}
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&dep)
	}

	// ── Router Logs (cost + analytics) ──────────────────────────────────────
	models := []string{"ai-model-fast", "ai-model-balanced", "ai-model-pro"}
	complexities := []string{"simple", "moderate", "complex"}
	modelCosts := map[string]float64{"ai-model-fast": 0.000001, "ai-model-balanced": 0.000003, "ai-model-pro": 0.000015}
	tasks := []string{
		"Summarize research paper", "Generate unit tests", "Retrieve relevant documents",
		"Coordinate sub-agents", "Analyze dataset", "Write documentation",
		"Debug error trace", "Extract structured data", "Plan multi-step task",
	}
	for i := 0; i < 80; i++ {
		ag := agents[i%len(agents)]
		model := models[i%len(models)]
		tokens := int64(500 + rng.Intn(3000))
		rl := database.RouterLog{
			ID: fmt.Sprintf("rl_%04d", i), AgentID: ag.id,
			Task: tasks[i%len(tasks)], Complexity: complexities[i%len(complexities)],
			ModelChosen: model, CostEstUSD: float64(tokens) * modelCosts[model],
			CreatedAt: now.Add(-time.Duration(rng.Intn(30)) * day),
		}
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&rl)
	}

	// ── Behavioral Fingerprints (NEXUS) ──────────────────────────────────────
	baseLatency := []float64{320, 180, 450, 280, 620}
	baseError := []float64{0.02, 0.04, 0.08, 0.01, 0.12}
	for ai, a := range agents {
		for d := 0; d < 7; d++ {
			wStart := now.Add(-time.Duration(7-d) * day).Truncate(day)
			wEnd := wStart.Add(day)
			jitter := 1 + (rng.Float64()-0.5)*0.3
			avgLat := baseLatency[ai] * jitter
			fp := database.BehavioralFingerprint{
				ID: fmt.Sprintf("fp_%s_%02d", a.id, d), AgentID: a.id,
				Window: "24h", WindowStart: wStart, WindowEnd: wEnd,
				SampleCount: int64(50 + rng.Intn(200)),
				P50LatencyMs: avgLat * 0.7, P95LatencyMs: avgLat * 1.8,
				P99LatencyMs: avgLat * 2.5, AvgLatencyMs: avgLat,
				MaxLatencyMs: avgLat * 3.2,
				ErrorRate:    baseError[ai] * (1 + (rng.Float64()-0.5)*0.5),
				ErrorCount:   int64(rng.Intn(20)),
				AvgTokensPerReq: 1200 + rng.Float64()*800,
				P95TokensPerReq: 2800 + rng.Float64()*1200,
				AvgCostPerReqUSD: avgLat * 0.000003,
				TotalCostUSD:     avgLat * 0.000003 * float64(50+rng.Intn(200)),
				HealthScore:  int(75 + rng.Intn(25)),
				ComputedAt:  wEnd,
			}
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&fp)
		}
	}

	// ── Health Score History (predictive health) ─────────────────────────────
	for ai, a := range agents {
		baseScore := 70 + ai*4
		for d := 0; d < 30; d++ {
			score := baseScore + rng.Intn(20) - 5
			if score > 100 { score = 100 }
			if score < 20 { score = 20 }
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.HealthScoreHistory{
				ID: fmt.Sprintf("hsh_%s_%03d", a.id, d), AgentID: a.id,
				Score: score, ErrorRate: baseError[ai] * (1 + rng.Float64()*0.3),
				AvgLatencyMs: baseLatency[ai] * (1 + rng.Float64()*0.2),
				OpenIncidents: rng.Intn(3),
				RecordedAt: now.Add(-time.Duration(30-d) * day),
			})
		}
	}

	// ── Health Predictions ───────────────────────────────────────────────────
	horizons := []string{"+1h", "+4h", "+24h"}
	for ai, a := range agents {
		for _, horizon := range horizons {
			pred := float64(75 + ai*3 + rng.Intn(15))
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.HealthPrediction{
				ID: fmt.Sprintf("hp_%s_%s", a.id, horizon[1:]), AgentID: a.id,
				Horizon: horizon, PredictedScore: pred,
				Slope: (rng.Float64() - 0.5) * 0.5, Intercept: pred,
				RSquared: 0.7 + rng.Float64()*0.25, TrainingPoints: 30,
				IsCritical: pred < 60,
				PredictedAt: now,
			})
		}
	}

	// ── Anomaly Events ───────────────────────────────────────────────────────
	anomalySpecs := []struct{ agentID, metric, sev, status string; zScore, obs float64 }{
		{"agt_research01", "error_rate", "critical", "open", 3.8, 0.18},
		{"agt_ragpipe03", "p99_latency_ms", "critical", "open", 4.1, 2340},
		{"agt_codeass02", "avg_tokens_per_req", "warning", "acknowledged", 2.7, 4100},
		{"agt_orchest04", "error_rate", "warning", "resolved", 2.9, 0.09},
		{"agt_dataanl05", "avg_cost_per_req_usd", "warning", "open", 2.6, 0.0089},
		{"agt_research01", "p95_latency_ms", "warning", "resolved", 3.0, 1890},
	}
	for i, s := range anomalySpecs {
		created := now.Add(-time.Duration(i*8+2) * time.Hour)
		ae := database.AnomalyEvent{
			ID: fmt.Sprintf("anm_%03d", i), AgentID: s.agentID,
			Metric: s.metric, ZScore: s.zScore,
			BaselineMean: s.obs * 0.5, BaselineStdev: s.obs * 0.1,
			ObservedValue: s.obs, DeviationPct: (s.zScore - 2.5) * 15,
			Severity: s.sev, Status: s.status,
			WindowStart: created.Add(-time.Hour), WindowEnd: created,
			CreatedAt: created,
		}
		if s.status == "resolved" {
			t := created.Add(3 * time.Hour)
			ae.ResolvedAt = &t
		}
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&ae)
	}

	// ── Topology Edges ───────────────────────────────────────────────────────
	edges := [][2]string{
		{"agt_orchest04", "agt_research01"},
		{"agt_orchest04", "agt_codeass02"},
		{"agt_orchest04", "agt_ragpipe03"},
		{"agt_research01", "agt_ragpipe03"},
		{"agt_codeass02", "agt_dataanl05"},
	}
	for i, e := range edges {
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.TopologyEdge{
			ID: fmt.Sprintf("topo_%02d", i), ParentAgentID: e[0], ChildAgentID: e[1],
			EdgeCount: int64(10 + rng.Intn(90)),
			LastSeenAt: now.Add(-time.Duration(rng.Intn(24)) * time.Hour),
			WindowStart: now.Add(-7 * day),
		})
	}

	// ── Causal Edges ─────────────────────────────────────────────────────────
	causalPairs := [][2]string{{"inc_001", "inc_006"}, {"inc_002", "inc_008"}, {"inc_003", "inc_007"}}
	for i, p := range causalPairs {
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.CausalEdge{
			ID: fmt.Sprintf("ce_%02d", i), CauseID: p[0], EffectID: p[1],
			Confidence: 0.75 + rng.Float64()*0.2, LagMs: int64(300000 + rng.Intn(600000)),
			CorrelationMethod: "pearson", SharedAgentID: agents[i%len(agents)].id,
			GraphID: "graph_main", CreatedAt: now.Add(-time.Duration(i) * day),
		})
	}

	// ── SLO Definitions ──────────────────────────────────────────────────────
	sloTypes := []struct{ name, sliType string; target float64; threshMs int64 }{
		{"Availability ≥ 99%", "availability", 0.99, 0},
		{"Latency p99 < 2s", "latency", 0.95, 2000},
	}
	for i, a := range agents {
		for j, st := range sloTypes {
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.SLODefinition{
				ID: fmt.Sprintf("slo_%s_%d", a.id, j), AgentID: a.id,
				Name: a.name + " — " + st.name, SLIType: st.sliType,
				TargetValue: st.target, WindowDays: 30, ThresholdMs: st.threshMs,
				Enabled: i < 4, CreatedAt: now.Add(-20 * day),
			})
		}
	}

	// ── Agent Genomes ────────────────────────────────────────────────────────
	for ai, a := range agents {
		var prevDrift float64 = 0
		for d := 0; d < 7; d++ {
			wStart := now.Add(-time.Duration(7-d) * day).Truncate(day)
			jitter := rng.Float64() * 0.1
			errRate := baseError[ai] + jitter
			latency := baseLatency[ai] * (1 + jitter)
			cost := latency * 0.000003
			healthScore := 75.0 + float64(ai)*4 - jitter*100
			tokens := 1200.0 + float64(rng.Intn(800))
			drift := 0.0
			if d > 0 {
				drift = prevDrift + (rng.Float64()-0.4)*0.1
				if drift < 0 { drift = 0 }
			}
			prevDrift = drift
			isDrifted := drift > 0.25
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.AgentGenome{
				ID: fmt.Sprintf("genome_%s_%02d", a.id, d), AgentID: a.id,
				WindowStart: wStart, ErrorRate: errRate, AvgLatencyMs: latency,
				AvgCostUSD: cost, HealthScore: healthScore, AvgTokens: tokens,
				DriftScore: drift, IsDrifted: isDrifted, ComputedAt: wStart.Add(time.Hour),
			})
		}
	}

	// ── Chaos Experiments ────────────────────────────────────────────────────
	faultTypes := []string{"latency_spike", "error_injection", "memory_pressure", "network_partition"}
	for i, a := range agents[:4] {
		ft := faultTypes[i]
		intensity := 0.3 + float64(i)*0.15
		created := now.Add(-time.Duration(i*24+6) * time.Hour)
		completed := created.Add(time.Duration(30+i*15) * time.Second)
		result := mustJSON(map[string]any{
			"fault_type": ft, "intensity": intensity,
			"projected_error_rate": 0.05 + intensity*0.3,
			"projected_latency_ms": 400 + intensity*2000,
			"projected_health_drop": intensity * 40,
			"recovery_time_sec":    int(30 + intensity*120),
			"affected_traces":      int(10 + intensity*50),
			"breached_slos":        []string{},
			"recommendation":       "Consider adding circuit breaker and retry with exponential backoff.",
		})
		exp := database.ChaosExperiment{
			ID: fmt.Sprintf("chaos_%03d", i), AgentID: a.id,
			FaultType: ft, Intensity: intensity, DurationSec: 30 + i*15,
			Status: "completed", Results: result,
			Notes:     fmt.Sprintf("Test %s resilience under %s conditions", a.name, ft),
			CreatedBy: "system", CreatedAt: created, CompletedAt: &completed,
		}
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&exp)
	}

	// ── Alert Clusters ────────────────────────────────────────────────────────
	clusters := []database.AlertCluster{
		{
			ID: "cluster_001", Label: "Agent: agt_research01 — multi-alert",
			Pattern:     "Multiple alerts from same agent within 24h window",
			IncidentIDs: mustJSON([]string{"inc_001", "inc_006"}),
			AnomalyIDs:  mustJSON([]string{"anm_000", "anm_005"}),
			AgentIDs:    mustJSON([]string{"agt_research01"}),
			Confidence: 0.92, Severity: "critical", Count: 4,
			FirstSeen: now.Add(-14 * time.Hour), LastSeen: now.Add(-2 * time.Hour),
			Status: "active", CreatedAt: now.Add(-14 * time.Hour),
		},
		{
			ID: "cluster_002", Label: "Critical wave — 3+ critical alerts",
			Pattern:     "3 critical severity alerts fired within 15 min window",
			IncidentIDs: mustJSON([]string{"inc_001", "inc_002", "inc_003"}),
			AnomalyIDs:  mustJSON([]string{"anm_000", "anm_001"}),
			AgentIDs:    mustJSON([]string{"agt_research01", "agt_ragpipe03", "agt_codeass02"}),
			Confidence: 0.88, Severity: "critical", Count: 5,
			FirstSeen: now.Add(-6 * time.Hour), LastSeen: now.Add(-1 * time.Hour),
			Status: "active", CreatedAt: now.Add(-6 * time.Hour),
		},
		{
			ID: "cluster_003", Label: "Time window: 2025-01-15 14:00",
			Pattern:     "3+ alerts in same 15-minute window",
			IncidentIDs: mustJSON([]string{"inc_003", "inc_004"}),
			AnomalyIDs:  mustJSON([]string{"anm_002"}),
			AgentIDs:    mustJSON([]string{"agt_codeass02", "agt_orchest04"}),
			Confidence: 0.75, Severity: "high", Count: 3,
			FirstSeen: now.Add(-36 * time.Hour), LastSeen: now.Add(-34 * time.Hour),
			Status: "suppressed", CreatedAt: now.Add(-36 * time.Hour),
		},
	}
	db.Clauses(clause.OnConflict{DoNothing: true}).Create(&clusters)

	// ── Agent Memories ────────────────────────────────────────────────────────
	memories := []struct{ agentID, key, value, scope string }{
		{"agt_research01", "preferred_sources", `["arxiv.org","pubmed.ncbi.nlm.nih.gov","nature.com"]`, "agent"},
		{"agt_research01", "last_topic", "transformer attention mechanisms", "agent"},
		{"agt_codeass02", "language_prefs", `{"primary":"typescript","secondary":"go"}`, "agent"},
		{"agt_codeass02", "test_framework", "vitest", "agent"},
		{"agt_ragpipe03", "chunk_size", "512", "agent"},
		{"agt_ragpipe03", "embedding_model", "text-embedding-3-small", "agent"},
		{"", "org_style_guide", "Use camelCase for variables, PascalCase for types.", "shared"},
		{"", "incident_runbook_url", "https://wiki.internal/runbooks/ai-incidents", "shared"},
	}
	for i, m := range memories {
		scope := m.scope
		if scope == "" { scope = "shared" }
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.AgentMemory{
			ID: fmt.Sprintf("mem_%03d", i), AgentID: m.agentID, Scope: scope,
			Key: m.key, Value: m.value, RunID: "run_seed",
			CreatedAt: now.Add(-time.Duration(i) * day),
			UpdatedAt: now.Add(-time.Duration(i) * day),
		})
	}

	// ── Trace Snapshots (time-travel) ─────────────────────────────────────────
	for ti := 0; ti < 3; ti++ {
		tm := traceMetas[ti]
		for seq := 0; seq < 5; seq++ {
			snapAt := tm.start.Add(time.Duration(seq) * time.Duration(tm.durationMs/5) * time.Millisecond)
			st := "ok"
			if seq == 4 && tm.status == "error" { st = "error" }
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.TraceSnapshot{
				ID:      fmt.Sprintf("snap_%s_%02d", tm.id, seq),
				TraceID: tm.id, SpanID: fmt.Sprintf("spn_root_%s", tm.id),
				AgentID: tm.agentID, RunID: tm.runID, SeqNum: seq,
				SpanName: []string{"init", "plan", "execute", "validate", "finalize"}[seq],
				State: mustJSON(map[string]any{
					"step": seq, "tokens_so_far": (seq + 1) * 240,
					"memory_keys": seq, "tool_calls": seq * 2,
				}),
				TokensUsed: int64((seq + 1) * 240),
				CostUSD:    float64((seq+1)*240) * 0.000003,
				DurationMs: tm.durationMs / 5,
				Status:     st, RecordedAt: snapAt,
			})
		}
	}

	// ── NLQ History ───────────────────────────────────────────────────────────
	nlqItems := []struct{ q, sql, chart string; rows int }{
		{"Show top 5 agents by error rate", "SELECT name, error_rate FROM agents ORDER BY error_rate DESC LIMIT 5", "bar", 5},
		{"How many incidents per day last 7 days?", "SELECT DATE(created_at) as day, COUNT(*) FROM incidents GROUP BY day ORDER BY day", "line", 7},
		{"What is average latency by agent?", "SELECT agent_id, AVG(duration_ms) as avg_latency FROM traces GROUP BY agent_id", "bar", 5},
		{"Total cost per agent this month", "SELECT agent_id, SUM(cost_est_usd) FROM router_logs GROUP BY agent_id", "pie", 5},
		{"List all critical open incidents", "SELECT id, title, agent_id FROM incidents WHERE severity='critical' AND status='open'", "table", 2},
	}
	for i, n := range nlqItems {
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.NLQQuery{
			ID: fmt.Sprintf("nlq_%03d", i), UserID: "system", UserEmail: "admin@agentops.io",
			Question: n.q, GeneratedSQL: n.sql, RowCount: n.rows,
			ChartType: n.chart, DurationMs: int64(120 + rng.Intn(400)),
			CreatedAt: now.Add(-time.Duration(i*3+1) * time.Hour),
		})
	}

	// ── Audit Log ─────────────────────────────────────────────────────────────
	auditActions := []struct{ action, resource, method, path string; code int }{
		{"agent.create", "agent", "POST", "/api/v1/agents", 201},
		{"trace.ingest", "trace", "POST", "/api/v1/traces", 201},
		{"incident.create", "incident", "POST", "/api/v1/incidents", 201},
		{"incident.resolve", "incident", "POST", "/api/v1/incidents/inc_004/resolve", 200},
		{"slo.create", "slo", "POST", "/api/v1/slo", 201},
		{"deployment.create", "deployment", "POST", "/api/v1/deployments", 201},
		{"agent.toggle", "agent", "PUT", "/api/v1/agents/agt_dataanl05", 200},
		{"webhook.create", "webhook", "POST", "/api/v1/webhooks", 201},
		{"budget.set", "budget", "POST", "/api/v1/agents/agt_research01/budget", 201},
		{"nlq.query", "nlq", "POST", "/api/v1/nlq/query", 200},
		{"chaos.run", "chaos", "POST", "/api/v1/chaos/experiments", 201},
		{"login", "session", "POST", "/auth/login", 200},
	}
	for i, aa := range auditActions {
		for j := 0; j < 2; j++ {
			idx := i*2 + j
			db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.AuditEntry{
				ID: fmt.Sprintf("audit_%04d", idx), UserID: "usr_admin_01",
				UserEmail: "admin@agentops.io", UserRole: "owner",
				Action: aa.action, Resource: aa.resource, ResourceID: uuid.New().String()[:8],
				Method: aa.method, Path: aa.path, StatusCode: aa.code,
				IPAddress: "192.168.1.100", UserAgent: "AgentOps-Dashboard/1.0",
				Detail:    mustJSON(map[string]string{"note": "demo seed"}),
				CreatedAt: now.Add(-time.Duration(idx*2+1) * time.Hour),
			})
		}
	}

	// ── Budget Limits ─────────────────────────────────────────────────────────
	dailyLimits := []float64{5.0, 3.0, 4.0, 8.0, 2.0}
	for i, a := range agents {
		db.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.AgentBudget{
			AgentID: a.id, DailyLimitUSD: dailyLimits[i],
			MonthlyLimitUSD: dailyLimits[i] * 30, AlertThresholdPct: 80,
			Active: true, CreatedAt: now.Add(-20 * day), UpdatedAt: now,
		})
	}

	return nil
}
