package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/manasbhole/orion/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const anthropicAPI = "https://api.anthropic.com/v1/messages"
const analysisModel = "claude-sonnet-4-6"

type AIAnalysisService struct {
	db     *gorm.DB
	logger *zap.Logger
	apiKey string
	client *http.Client
}

func NewAIAnalysisService(db *gorm.DB, logger *zap.Logger, apiKey string) *AIAnalysisService {
	return &AIAnalysisService{
		db:     db,
		logger: logger,
		apiKey: apiKey,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

// IncidentAnalysis is the structured response returned to the frontend.
type IncidentAnalysis struct {
	Summary         string   `json:"summary"`
	RootCause       string   `json:"root_cause"`
	FixSteps        []string `json:"fix_steps"`
	ImpactedSystems []string `json:"impacted_systems"`
	TimeToFix       string   `json:"time_to_fix"`
	Priority        string   `json:"priority"`
	Confidence      float64  `json:"confidence"`
	ModelUsed       string   `json:"model_used"`
	TokensUsed      int      `json:"tokens_used"`
	Cached          bool     `json:"cached"`
	CachedAt        *string  `json:"cached_at,omitempty"`
}

// AnalyzeIncident returns a cached analysis or calls Claude to generate one.
func (s *AIAnalysisService) AnalyzeIncident(incidentID string) (*IncidentAnalysis, error) {
	if s.apiKey == "" {
		return nil, errors.New("no api key configured")
	}

	// Check cache (valid for 24h)
	var cached database.AIIncidentAnalysis
	if err := s.db.Where("incident_id = ?", incidentID).First(&cached).Error; err == nil {
		if time.Since(cached.CreatedAt) < 24*time.Hour {
			return fromCached(&cached), nil
		}
	}

	// Fetch incident
	var inc database.Incident
	if err := s.db.First(&inc, "id = ?", incidentID).Error; err != nil {
		return nil, fmt.Errorf("incident not found: %w", err)
	}

	// Fetch recent traces for that agent (last 20)
	var traces []database.Trace
	s.db.Where("agent_id = ?", inc.AgentID).
		Order("created_at DESC").Limit(20).Find(&traces)

	// Fetch recent anomalies for that agent
	var anomalies []database.AnomalyEvent
	s.db.Where("agent_id = ?", inc.AgentID).
		Order("created_at DESC").Limit(5).Find(&anomalies)

	// Build context string
	ctx := buildContext(inc, traces, anomalies)

	// Call Claude
	result, tokens, err := s.callClaude(ctx)
	if err != nil {
		return nil, fmt.Errorf("claude analysis failed: %w", err)
	}

	// Persist to cache
	row := database.AIIncidentAnalysis{
		ID:              "aia_" + incidentID,
		IncidentID:      incidentID,
		Summary:         result.Summary,
		RootCause:       result.RootCause,
		FixSteps:        mustMarshal(result.FixSteps),
		ImpactedSystems: mustMarshal(result.ImpactedSystems),
		TimeToFix:       result.TimeToFix,
		Priority:        result.Priority,
		Confidence:      result.Confidence,
		ModelUsed:       analysisModel,
		TokensUsed:      tokens,
		CreatedAt:       time.Now().UTC(),
	}
	s.db.Save(&row)

	result.ModelUsed = analysisModel
	result.TokensUsed = tokens
	result.Cached = false
	return result, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func buildContext(inc database.Incident, traces []database.Trace, anomalies []database.AnomalyEvent) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INCIDENT ID: %s\nTITLE: %s\nSEVERITY: %s\nSTATUS: %s\nAGENT: %s\n", inc.ID, inc.Title, inc.Severity, inc.Status, inc.AgentID))
	sb.WriteString(fmt.Sprintf("ROOT CAUSE (initial): %s\nSUGGESTED FIX (initial): %s\nCONFIDENCE: %.0f%%\n\n", inc.RootCause, inc.SuggestedFix, inc.Confidence*100))

	sb.WriteString(fmt.Sprintf("RECENT TRACES (%d):\n", len(traces)))
	errorCount := 0
	var totalDur int64
	for _, t := range traces {
		totalDur += t.Duration
		if t.Status == "error" {
			errorCount++
		}
	}
	if len(traces) > 0 {
		sb.WriteString(fmt.Sprintf("  Error rate: %.0f%% (%d/%d)\n  Avg latency: %dms\n", float64(errorCount)/float64(len(traces))*100, errorCount, len(traces), totalDur/int64(len(traces))))
	}

	if len(anomalies) > 0 {
		sb.WriteString("\nRECENT ANOMALIES:\n")
		for _, a := range anomalies {
			sb.WriteString(fmt.Sprintf("  - %s: z-score=%.1f, observed=%.4f, severity=%s\n", a.Metric, a.ZScore, a.ObservedValue, a.Severity))
		}
	}
	return sb.String()
}

func (s *AIAnalysisService) callClaude(context string) (*IncidentAnalysis, int, error) {
	systemPrompt := `You are an expert AI systems reliability engineer specializing in LLM-based agent systems.
Analyze the incident data and return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence executive summary of what happened and impact",
  "root_cause": "Detailed technical root cause explanation (3-5 sentences)",
  "fix_steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "impacted_systems": ["system1", "system2"],
  "time_to_fix": "e.g. 30 minutes / 2 hours / 1 day",
  "priority": "immediate|today|this-week",
  "confidence": 0.0 to 1.0
}
Return ONLY the JSON object, no markdown, no explanation.`

	userMsg := fmt.Sprintf("Analyze this AI agent incident and provide root cause analysis:\n\n%s", context)

	reqBody := map[string]any{
		"model":      analysisModel,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": userMsg},
		},
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", anthropicAPI, bytes.NewReader(bodyBytes))
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, 0, fmt.Errorf("anthropic API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return nil, 0, err
	}
	if len(apiResp.Content) == 0 {
		return nil, 0, errors.New("empty response from Claude")
	}

	text := strings.TrimSpace(apiResp.Content[0].Text)
	// strip markdown code fences if present
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result IncidentAnalysis
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, 0, fmt.Errorf("failed to parse Claude response as JSON: %w\nraw: %s", err, text)
	}

	tokens := apiResp.Usage.InputTokens + apiResp.Usage.OutputTokens
	return &result, tokens, nil
}

func fromCached(c *database.AIIncidentAnalysis) *IncidentAnalysis {
	var steps, systems []string
	json.Unmarshal([]byte(c.FixSteps), &steps)          //nolint
	json.Unmarshal([]byte(c.ImpactedSystems), &systems) //nolint
	ts := c.CreatedAt.Format(time.RFC3339)
	return &IncidentAnalysis{
		Summary: c.Summary, RootCause: c.RootCause,
		FixSteps: steps, ImpactedSystems: systems,
		TimeToFix: c.TimeToFix, Priority: c.Priority,
		Confidence: c.Confidence, ModelUsed: c.ModelUsed,
		TokensUsed: c.TokensUsed, Cached: true, CachedAt: &ts,
	}
}

func mustMarshal(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
