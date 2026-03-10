package services

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/agentops/agentops/api/internal/database"
)

// ModelTier describes a model option with pricing.
type ModelTier struct {
	Model          string  `json:"model"`
	Provider       string  `json:"provider"`
	CostPer1kIn    float64 `json:"cost_per_1k_input"`
	CostPer1kOut   float64 `json:"cost_per_1k_output"`
	ContextWindow  int     `json:"context_window"`
	Capability     string  `json:"capability"` // "fast" | "balanced" | "powerful"
}

// RouteDecision is returned by the router for each task.
type RouteDecision struct {
	Task           string    `json:"task"`
	Complexity     string    `json:"complexity"`   // simple | moderate | complex
	Model          string    `json:"model"`
	Provider       string    `json:"provider"`
	EstCostUSD     float64   `json:"est_cost_usd"`
	FullCostUSD    float64   `json:"full_cost_usd"` // cost if always using GPT-4o
	SavingsUSD     float64   `json:"savings_usd"`
	SavingsPct     float64   `json:"savings_pct"`
	Rationale      string    `json:"rationale"`
	AlternativeModel string  `json:"alternative_model,omitempty"`
}

// RouterStats aggregates total routing savings.
type RouterStats struct {
	TotalDecisions  int64   `json:"total_decisions"`
	TotalCostUSD    float64 `json:"total_cost_usd"`
	TotalSavedUSD   float64 `json:"total_saved_usd"`
	SavingsPct      float64 `json:"savings_pct"`
}

var tiers = []ModelTier{
	// Fast / cheap — simple tasks
	{Model: "gpt-4o-mini",                     Provider: "openai",    CostPer1kIn: 0.00015, CostPer1kOut: 0.00060, ContextWindow: 128000, Capability: "fast"},
	{Model: "claude-haiku-4-5-20251001",        Provider: "anthropic", CostPer1kIn: 0.00025, CostPer1kOut: 0.00125, ContextWindow: 200000, Capability: "fast"},
	// Balanced — moderate tasks
	{Model: "claude-sonnet-4-6",                Provider: "anthropic", CostPer1kIn: 0.003,   CostPer1kOut: 0.015,   ContextWindow: 200000, Capability: "balanced"},
	{Model: "gpt-4o",                           Provider: "openai",    CostPer1kIn: 0.005,   CostPer1kOut: 0.015,   ContextWindow: 128000, Capability: "balanced"},
	// Powerful — complex tasks
	{Model: "claude-opus-4-6",                  Provider: "anthropic", CostPer1kIn: 0.015,   CostPer1kOut: 0.075,   ContextWindow: 200000, Capability: "powerful"},
	{Model: "gpt-4-turbo",                      Provider: "openai",    CostPer1kIn: 0.010,   CostPer1kOut: 0.030,   ContextWindow: 128000, Capability: "powerful"},
}

// complexitySignals maps keyword patterns to complexity levels.
var complexitySignals = map[string][]string{
	"simple": {
		"summarize", "classify", "extract", "format", "translate",
		"yes or no", "single word", "short answer", "bullet point",
		"hello", "greet", "simple", "quick", "small",
	},
	"complex": {
		"reason", "analyze", "architect", "design", "debug", "refactor",
		"multi-step", "chain of thought", "code review", "security audit",
		"compare and contrast", "evaluate", "research", "synthesize",
		"long document", "full report", "comprehensive",
	},
}

// ModelRouterService routes tasks to the optimal model.
type ModelRouterService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewModelRouterService(db *gorm.DB, logger *zap.Logger) *ModelRouterService {
	return &ModelRouterService{db: db, logger: logger}
}

// Route analyses a task description and returns the optimal model + savings.
func (s *ModelRouterService) Route(agentID, task string, preferProvider string) RouteDecision {
	complexity := s.classifyComplexity(task)
	chosen := s.pickModel(complexity, preferProvider)

	// Baseline: always using gpt-4o for everything
	baseline := findModel("gpt-4o", "openai")
	estTokens := estimateTokens(task)
	estCost := estimateCost(chosen, estTokens)
	fullCost := estimateCost(baseline, estTokens)
	savings := fullCost - estCost
	if savings < 0 {
		savings = 0
	}
	pct := 0.0
	if fullCost > 0 {
		pct = (savings / fullCost) * 100
	}

	decision := RouteDecision{
		Task:        task,
		Complexity:  complexity,
		Model:       chosen.Model,
		Provider:    chosen.Provider,
		EstCostUSD:  estCost,
		FullCostUSD: fullCost,
		SavingsUSD:  savings,
		SavingsPct:  pct,
		Rationale:   s.rationale(complexity, chosen),
	}

	// Suggest a powerful alternative for complex tasks
	if complexity != "complex" {
		alt := s.pickModel("complex", preferProvider)
		decision.AlternativeModel = alt.Model
	}

	// Persist for analytics
	s.db.Create(&database.RouterLog{
		ID:          uuid.New().String(),
		AgentID:     agentID,
		Task:        truncateStr(task, 500),
		Complexity:  complexity,
		ModelChosen: chosen.Model,
		CostEstUSD:  estCost,
		CreatedAt:   time.Now().UTC(),
	})

	return decision
}

// Stats returns aggregate routing savings across all decisions.
func (s *ModelRouterService) Stats() RouterStats {
	var logs []database.RouterLog
	s.db.Find(&logs)

	var stats RouterStats
	stats.TotalDecisions = int64(len(logs))

	// Baseline per-decision cost using gpt-4o
	baseline := findModel("gpt-4o", "openai")
	for _, l := range logs {
		tokens := estimateTokens(l.Task)
		stats.TotalCostUSD += l.CostEstUSD
		stats.TotalSavedUSD += estimateCost(baseline, tokens) - l.CostEstUSD
	}
	if stats.TotalSavedUSD < 0 {
		stats.TotalSavedUSD = 0
	}
	if stats.TotalCostUSD+stats.TotalSavedUSD > 0 {
		stats.SavingsPct = (stats.TotalSavedUSD / (stats.TotalCostUSD + stats.TotalSavedUSD)) * 100
	}
	return stats
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (s *ModelRouterService) classifyComplexity(task string) string {
	lower := strings.ToLower(task)
	complexScore, simpleScore := 0, 0
	for _, kw := range complexitySignals["complex"] {
		if strings.Contains(lower, kw) {
			complexScore++
		}
	}
	for _, kw := range complexitySignals["simple"] {
		if strings.Contains(lower, kw) {
			simpleScore++
		}
	}
	// Length heuristic: long tasks tend to be complex
	if len(task) > 800 {
		complexScore += 2
	} else if len(task) < 120 {
		simpleScore++
	}
	if complexScore > simpleScore {
		return "complex"
	}
	if simpleScore > 0 {
		return "simple"
	}
	return "moderate"
}

func (s *ModelRouterService) pickModel(complexity, preferProvider string) ModelTier {
	capMap := map[string]string{
		"simple":   "fast",
		"moderate": "balanced",
		"complex":  "powerful",
	}
	cap := capMap[complexity]
	for _, t := range tiers {
		if t.Capability == cap && (preferProvider == "" || t.Provider == preferProvider) {
			return t
		}
	}
	// Fallback: any tier with matching capability
	for _, t := range tiers {
		if t.Capability == cap {
			return t
		}
	}
	return tiers[0]
}

func (s *ModelRouterService) rationale(complexity string, chosen ModelTier) string {
	switch complexity {
	case "simple":
		return "Task is straightforward — routed to fast tier to minimise latency and cost."
	case "complex":
		return "Task requires deep reasoning — routed to powerful tier for highest accuracy."
	default:
		return "Task has moderate complexity — balanced tier provides optimal cost/quality tradeoff."
	}
}

func findModel(model, provider string) ModelTier {
	for _, t := range tiers {
		if t.Model == model && t.Provider == provider {
			return t
		}
	}
	return tiers[3] // default gpt-4o
}

func estimateTokens(task string) int {
	// ~4 chars per token; assume 3× output
	in := len(task) / 4
	if in < 50 {
		in = 50
	}
	return in + in*3
}

func estimateCost(t ModelTier, tokens int) float64 {
	inTokens := float64(tokens) / 4
	outTokens := float64(tokens) * 3 / 4
	return (inTokens/1000)*t.CostPer1kIn + (outTokens/1000)*t.CostPer1kOut
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}