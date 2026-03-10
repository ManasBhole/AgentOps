//go:build ignore

package main

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ── Minimal model copies (no import cycle) ───────────────────────────────────

type Agent struct {
	ID        string    `gorm:"primaryKey"`
	Name      string
	Type      string
	Version   string
	Status    string
	Config    string    `gorm:"type:jsonb"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Trace struct {
	ID         string    `gorm:"primaryKey"`
	AgentID    string
	RunID      string    `gorm:"index"`
	TraceID    string    `gorm:"index"`
	SpanID     string
	ParentID   string
	Name       string
	StartTime  time.Time
	EndTime    *time.Time
	Duration   int64
	Status     string
	Attributes string    `gorm:"type:jsonb"`
	Events     string    `gorm:"type:jsonb"`
	CreatedAt  time.Time
}

type Incident struct {
	ID               string    `gorm:"primaryKey"`
	Title            string
	Severity         string
	Status           string
	AgentID          string    `gorm:"index"`
	TraceID          string    `gorm:"index"`
	RootCause        string    `gorm:"type:text"`
	SuggestedFix     string    `gorm:"type:text"`
	Confidence       float64
	CorrelatedTraces string    `gorm:"type:jsonb"`
	InfraMetrics     string    `gorm:"type:jsonb"`
	ResolvedAt       *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Deployment struct {
	ID        string    `gorm:"primaryKey"`
	AgentID   string    `gorm:"index"`
	Namespace string
	Replicas  int
	Status    string
	Config    string    `gorm:"type:jsonb"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ── Seed data pools ──────────────────────────────────────────────────────────

var agentDefs = []struct{ name, typ, version string }{
	{"research-agent-v2", "rag", "2.1.0"},
	{"code-review-bot", "tool-use", "1.4.2"},
	{"customer-support-ai", "llm", "3.0.1"},
	{"data-pipeline-agent", "tool-use", "1.2.0"},
	{"doc-summarizer", "rag", "1.0.5"},
	{"sql-query-agent", "tool-use", "2.0.0"},
	{"email-classifier", "llm", "1.1.3"},
	{"alert-triage-agent", "multi-agent", "1.3.0"},
	{"infra-diagnostics", "tool-use", "2.2.1"},
	{"onboarding-assistant", "llm", "1.0.0"},
	{"log-analysis-agent", "rag", "1.5.0"},
	{"billing-agent", "llm", "1.0.2"},
}

var traceNames = []string{
	"agent.run", "llm.completion", "tool.call", "retrieval.search",
	"reasoning.step", "memory.lookup", "action.execute", "planning.step",
	"validation.check", "summarization.run", "embedding.generate", "rerank.documents",
}

var toolNames = []string{
	"web_search", "code_executor", "file_reader", "db_query",
	"api_caller", "email_sender", "calendar_lookup", "slack_message",
}

var errorAttrs = []string{
	`{"error":"context deadline exceeded","timeout":true}`,
	`{"error":"rate limit exceeded","status":429}`,
	`{"error":"tool_error: web_search returned 503"}`,
	`{"error":"out of memory","oom":true}`,
	`{"error":"invalid json: unexpected token at position 42"}`,
	`{"error":"connection refused: dial tcp 10.0.0.5:5432"}`,
	`{"error":"context canceled","reason":"parent span ended"}`,
}

var rootCauses = []struct{ cause, fix, severity string; confidence float64 }{
	{
		"Agent execution timed out — downstream LLM call exceeded the configured deadline.",
		"Increase the agent timeout budget or add retry with exponential back-off.",
		"high", 0.88,
	},
	{
		"LLM rate limit hit during agent execution (HTTP 429).",
		"Implement token-bucket throttling before LLM calls. Add jitter to retry logic.",
		"medium", 0.92,
	},
	{
		"Agent tool call failed — web_search returned unexpected error.",
		"Add input validation and fallback behavior in the tool wrapper.",
		"high", 0.85,
	},
	{
		"Agent process OOM-killed — context window too large for pod memory limit.",
		"Increase pod memory limit or reduce context window size.",
		"critical", 0.90,
	},
	{
		"LLM returned malformed JSON that the agent could not parse.",
		"Enable JSON mode. Add parse-and-retry loop with stricter prompt.",
		"medium", 0.82,
	},
	{
		"Network connectivity failure — agent could not reach Postgres on port 5432.",
		"Verify DB DNS, firewall rules and health checks. Add circuit-breaker.",
		"critical", 0.87,
	},
	{
		"Agent run exceeded 60 s — possible infinite loop in reasoning chain.",
		"Add max-iterations guard and hard wall-clock timeout.",
		"high", 0.75,
	},
}

func main() {
	dsn := "postgres://manasbhole@localhost:5432/agentops?sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	// Auto-migrate
	if err := db.AutoMigrate(&Agent{}, &Trace{}, &Incident{}, &Deployment{}); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	now := time.Now().UTC()

	// ── Agents ───────────────────────────────────────────────────────────────
	fmt.Print("Seeding agents... ")
	agents := make([]Agent, 0, len(agentDefs))
	for i, def := range agentDefs {
		status := "active"
		if i%5 == 4 {
			status = "paused"
		}
		a := Agent{
			ID:        fmt.Sprintf("agent-%02d", i+1),
			Name:      def.name,
			Type:      def.typ,
			Version:   def.version,
			Status:    status,
			Config:    `{"max_tokens":4096,"temperature":0.7}`,
			CreatedAt: now.Add(-time.Duration(rng.Intn(30*24)) * time.Hour),
			UpdatedAt: now.Add(-time.Duration(rng.Intn(24)) * time.Hour),
		}
		db.Where("id = ?", a.ID).FirstOrCreate(&a)
		agents = append(agents, a)
	}
	fmt.Printf("%d agents\n", len(agents))

	// ── Traces ───────────────────────────────────────────────────────────────
	fmt.Print("Seeding traces... ")
	traceCount := 0
	var errorTraces []Trace

	for _, agent := range agents {
		// 15–25 traces per agent
		n := 15 + rng.Intn(11)
		for j := 0; j < n; j++ {
			startOffset := time.Duration(rng.Intn(7*24*60)) * time.Minute
			startTime := now.Add(-startOffset)
			durMs := int64(200 + rng.Intn(45_000))
			endTime := startTime.Add(time.Duration(durMs) * time.Millisecond)

			status := "ok"
			attrs := fmt.Sprintf(`{"agent.type":%q,"model":"claude-3-5-sonnet","tokens":%d}`,
				agent.Type, 500+rng.Intn(3500))
			events := `[]`

			// ~18% error rate
			if rng.Intn(100) < 18 {
				status = "error"
				attrs = errorAttrs[rng.Intn(len(errorAttrs))]
				events = fmt.Sprintf(`[{"name":"error","timestamp":%q}]`, startTime.Format(time.RFC3339))
				if durMs < 5000 {
					durMs = 5000 + int64(rng.Intn(30_000))
				}
			}

			traceID := fmt.Sprintf("trace-%s-%04d", agent.ID, j)
			t := Trace{
				ID:        traceID,
				AgentID:   agent.ID,
				RunID:     fmt.Sprintf("run-%s-%04d", agent.ID, j),
				TraceID:   traceID,
				Name:      traceNames[rng.Intn(len(traceNames))],
				StartTime: startTime,
				EndTime:   &endTime,
				Duration:  durMs,
				Status:    status,
				Attributes: attrs,
				Events:    events,
				CreatedAt: startTime,
			}
			db.Where("trace_id = ?", t.TraceID).FirstOrCreate(&t)
			if status == "error" {
				errorTraces = append(errorTraces, t)
			}
			traceCount++
		}
	}
	fmt.Printf("%d traces\n", traceCount)

	// ── Incidents ────────────────────────────────────────────────────────────
	fmt.Print("Seeding incidents... ")
	incidentCount := 0

	// One incident per error trace (up to 30)
	maxInc := 30
	if len(errorTraces) < maxInc {
		maxInc = len(errorTraces)
	}

	for i, t := range errorTraces[:maxInc] {
		rc := rootCauses[i%len(rootCauses)]
		status := "open"
		var resolvedAt *time.Time
		if i%3 == 0 {
			status = "resolved"
			ts := t.StartTime.Add(time.Duration(10+rng.Intn(120)) * time.Minute)
			resolvedAt = &ts
		} else if i%4 == 1 {
			status = "investigating"
		}

		inc := Incident{
			ID:           fmt.Sprintf("inc_%d_%04d", t.StartTime.Unix(), i),
			Title:        fmt.Sprintf("Agent Error: %s [%s]", t.Name, t.AgentID),
			Severity:     rc.severity,
			Status:       status,
			AgentID:      t.AgentID,
			TraceID:      t.TraceID,
			RootCause:    rc.cause,
			SuggestedFix: rc.fix,
			Confidence:   rc.confidence,
			CorrelatedTraces: "[]",
			InfraMetrics: `{}`,
			ResolvedAt:   resolvedAt,
			CreatedAt:    t.StartTime,
			UpdatedAt:    t.StartTime.Add(5 * time.Minute),
		}
		db.Where("id = ?", inc.ID).FirstOrCreate(&inc)
		incidentCount++
	}
	fmt.Printf("%d incidents\n", incidentCount)

	// ── Deployments ──────────────────────────────────────────────────────────
	fmt.Print("Seeding deployments... ")
	depCount := 0
	for _, agent := range agents {
		dep := Deployment{
			ID:        fmt.Sprintf("deploy-%s", agent.ID),
			AgentID:   agent.ID,
			Namespace: "production",
			Replicas:  1 + rng.Intn(4),
			Status:    "active",
			Config:    `{"image":"agentops/runtime:latest","resources":{"cpu":"500m","memory":"512Mi"}}`,
			CreatedAt: agent.CreatedAt,
			UpdatedAt: agent.UpdatedAt,
		}
		db.Where("id = ?", dep.ID).FirstOrCreate(&dep)
		depCount++
	}
	fmt.Printf("%d deployments\n", depCount)

	fmt.Println("\n✓ Seed complete. Refresh the dashboard.")
}
