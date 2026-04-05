package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const nlqSchemaContext = `
You are a PostgreSQL expert. Convert natural language questions into safe, read-only SQL SELECT queries.

Available tables and columns:
- agents: id, name, type, version, status, created_at, updated_at
- traces: id, agent_id, run_id, trace_id, span_id, parent_id, name, start_time, end_time, duration (integer ms), status, attributes (jsonb), created_at
- incidents: id, title, severity (critical/high/medium/low), status (open/investigating/resolved), agent_id, trace_id, root_cause, confidence (float), created_at, resolved_at
- deployments: id, agent_id, namespace, replicas, status, created_at
- router_logs: id, agent_id, task, complexity (simple/moderate/complex), model_chosen, cost_est_usd (float), created_at
- behavioral_fingerprints: id, agent_id, window, window_start, p50_latency_ms, p95_latency_ms, error_rate, total_cost_usd, health_score, computed_at
- anomaly_events: id, agent_id, metric, z_score, observed_value, deviation_pct, severity, status, created_at
- audit_entries: id, user_id, user_email, user_role, action, resource, method, path, status_code, created_at
- slo_definitions: id, agent_id, name, sli_type, target_value, window_days, enabled, created_at
- war_rooms: id, incident_id, title, status, commander, created_at
- war_room_tasks: id, room_id, title, assigned_to, done, created_at

Rules:
1. ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, EXECUTE.
2. Always add LIMIT 500 unless user asks for aggregation.
3. Use PostgreSQL syntax.
4. Return ONLY the SQL query, no explanation, no markdown, no backticks.
5. Also suggest a chart type on the last line as a comment: -- chart:bar, -- chart:line, -- chart:pie, or -- chart:table
`

type NLQService struct {
	db     *gorm.DB
	logger *zap.Logger
	apiKey string
}

func NewNLQService(db *gorm.DB, logger *zap.Logger, apiKey string) *NLQService {
	return &NLQService{db: db, logger: logger, apiKey: apiKey}
}

type NLQResult struct {
	SQL        string           `json:"sql"`
	Columns    []string         `json:"columns"`
	Rows       []map[string]any `json:"rows"`
	RowCount   int              `json:"row_count"`
	ChartType  string           `json:"chart_type"`
	DurationMs int64            `json:"duration_ms"`
}

func (s *NLQService) Query(question string) (*NLQResult, error) {
	start := time.Now()

	sql, err := s.generateSQL(question)
	if err != nil {
		return nil, fmt.Errorf("SQL generation failed: %w", err)
	}

	// Extract chart type from comment
	chartType := "table"
	lines := strings.Split(sql, "\n")
	cleanLines := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "-- chart:") {
			chartType = strings.TrimPrefix(trimmed, "-- chart:")
			chartType = strings.TrimSpace(chartType)
		} else {
			cleanLines = append(cleanLines, line)
		}
	}
	cleanSQL := strings.TrimSpace(strings.Join(cleanLines, "\n"))

	// Safety: only allow SELECT
	upperSQL := strings.ToUpper(strings.TrimSpace(cleanSQL))
	if !strings.HasPrefix(upperSQL, "SELECT") {
		return nil, fmt.Errorf("only SELECT queries are allowed")
	}
	// Block dangerous keywords
	for _, kw := range []string{"INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "EXECUTE"} {
		if strings.Contains(upperSQL, kw) {
			return nil, fmt.Errorf("forbidden keyword: %s", kw)
		}
	}

	rows, err := s.execSQL(cleanSQL)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}

	cols := []string{}
	if len(rows) > 0 {
		for k := range rows[0] {
			cols = append(cols, k)
		}
	}

	return &NLQResult{
		SQL:        cleanSQL,
		Columns:    cols,
		Rows:       rows,
		RowCount:   len(rows),
		ChartType:  chartType,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

type llmRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	System    string       `json:"system"`
	Messages  []llmMessage `json:"messages"`
}

type llmMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type llmResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (s *NLQService) generateSQL(question string) (string, error) {
	if s.apiKey == "" {
		// Fallback: return a simple query if no API key configured
		return "SELECT id, name, status, created_at FROM agents ORDER BY created_at DESC LIMIT 20 -- chart:table", nil
	}

	reqBody := llmRequest{
		Model:     "ai-model-fast",
		MaxTokens: 512,
		System:    nlqSchemaContext,
		Messages: []llmMessage{
			{Role: "user", Content: question},
		},
	}
	b, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "https://api.orion.io/v1/messages", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("api-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var ar llmResponse
	if err := json.Unmarshal(body, &ar); err != nil {
		return "", fmt.Errorf("parse error: %w", err)
	}
	if ar.Error != nil {
		return "", fmt.Errorf("llm error: %s", ar.Error.Message)
	}
	if len(ar.Content) == 0 {
		return "", fmt.Errorf("empty response from AI")
	}
	return strings.TrimSpace(ar.Content[0].Text), nil
}

func (s *NLQService) execSQL(query string) ([]map[string]any, error) {
	rows, err := s.db.Raw(query).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		valPtrs := make([]any, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if err := rows.Scan(valPtrs...); err != nil {
			continue
		}
		row := make(map[string]any, len(cols))
		for i, col := range cols {
			row[col] = vals[i]
		}
		results = append(results, row)
	}
	if results == nil {
		results = []map[string]any{}
	}
	return results, nil
}
