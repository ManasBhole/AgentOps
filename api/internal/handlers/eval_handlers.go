package handlers

import (
	"encoding/json"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	"github.com/agentops/agentops/api/internal/database"
)

// mustJSON marshals v to a JSON string, returning "[]" on error.
func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// ── Suites ──────────────────────────────────────────────────────────────────

func (h *Handlers) ListEvalSuites(c *gin.Context) {
	var suites []database.EvalSuite
	h.db.Order("created_at DESC").Find(&suites)
	if suites == nil {
		suites = []database.EvalSuite{}
	}

	// Attach case count per suite
	type suiteWithCount struct {
		database.EvalSuite
		CaseCount int64      `json:"case_count"`
		LastRunAt *time.Time `json:"last_run_at"`
		LastScore float64    `json:"last_score"`
	}
	result := make([]suiteWithCount, len(suites))
	for i, s := range suites {
		var count int64
		h.db.Model(&database.EvalCase{}).Where("suite_id = ?", s.ID).Count(&count)
		var lastRun database.EvalRun
		h.db.Where("suite_id = ?", s.ID).Order("started_at DESC").First(&lastRun)
		result[i] = suiteWithCount{EvalSuite: s, CaseCount: count}
		if lastRun.ID != "" {
			result[i].LastRunAt = &lastRun.StartedAt
			result[i].LastScore = lastRun.AvgScore
		}
	}
	c.JSON(http.StatusOK, gin.H{"suites": result, "total": len(suites)})
}

func (h *Handlers) GetEvalSuite(c *gin.Context) {
	var s database.EvalSuite
	if err := h.db.First(&s, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var cases []database.EvalCase
	h.db.Where("suite_id = ?", s.ID).Find(&cases)
	if cases == nil {
		cases = []database.EvalCase{}
	}
	c.JSON(http.StatusOK, gin.H{"suite": s, "cases": cases})
}

func (h *Handlers) CreateEvalSuite(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		AgentID     string `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s := database.EvalSuite{
		ID:          "evs_" + uuid.New().String()[:8],
		Name:        req.Name,
		Description: req.Description,
		AgentID:     req.AgentID,
		CreatedBy:   c.GetString("user_email"),
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	h.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&s)
	c.JSON(http.StatusCreated, s)
}

func (h *Handlers) DeleteEvalSuite(c *gin.Context) {
	h.db.Where("suite_id = ?", c.Param("id")).Delete(&database.EvalCase{})
	h.db.Delete(&database.EvalSuite{}, "id = ?", c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
}

// ── Cases ────────────────────────────────────────────────────────────────────

func (h *Handlers) AddEvalCase(c *gin.Context) {
	var req struct {
		Input          string   `json:"input" binding:"required"`
		ExpectedOutput string   `json:"expected_output"`
		Tags           []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ec := database.EvalCase{
		ID:             "evc_" + uuid.New().String()[:8],
		SuiteID:        c.Param("id"),
		Input:          req.Input,
		ExpectedOutput: req.ExpectedOutput,
		Tags:           mustJSON(req.Tags),
		CreatedAt:      time.Now().UTC(),
	}
	h.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&ec)
	c.JSON(http.StatusCreated, ec)
}

func (h *Handlers) DeleteEvalCase(c *gin.Context) {
	h.db.Delete(&database.EvalCase{}, "id = ?", c.Param("caseID"))
	c.JSON(http.StatusOK, gin.H{"deleted": c.Param("caseID")})
}

// ── Runs ─────────────────────────────────────────────────────────────────────

func (h *Handlers) ListEvalRuns(c *gin.Context) {
	var runs []database.EvalRun
	h.db.Where("suite_id = ?", c.Param("id")).Order("started_at DESC").Limit(20).Find(&runs)
	if runs == nil {
		runs = []database.EvalRun{}
	}
	c.JSON(http.StatusOK, gin.H{"runs": runs})
}

func (h *Handlers) RunEvalSuite(c *gin.Context) {
	suiteID := c.Param("id")
	var suite database.EvalSuite
	if err := h.db.First(&suite, "id = ?", suiteID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "suite not found"})
		return
	}
	var cases []database.EvalCase
	h.db.Where("suite_id = ?", suiteID).Find(&cases)
	if len(cases) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "suite has no test cases"})
		return
	}

	run := database.EvalRun{
		ID:         "evr_" + uuid.New().String()[:8],
		SuiteID:    suiteID,
		Status:     "running",
		TotalCases: len(cases),
		CreatedBy:  c.GetString("user_email"),
		StartedAt:  time.Now().UTC(),
	}
	h.db.Create(&run)

	// Run eval asynchronously
	go func() {
		rng := rand.New(rand.NewSource(time.Now().UnixNano()))
		passed := 0
		totalScore := 0.0
		totalCost := 0.0
		totalLatency := int64(0)

		for _, ec := range cases {
			latencyMs := int64(200 + rng.Intn(2000))
			costUSD := float64(500+rng.Intn(2000)) * 0.000003

			// Simulate scoring: lexical similarity between expected and a mock output
			mockOutput := simulateOutput(ec.Input, ec.ExpectedOutput)
			score := lexicalScore(ec.ExpectedOutput, mockOutput)
			wasPassed := score >= 0.7

			result := database.EvalResult{
				ID:           "evres_" + uuid.New().String()[:8],
				RunID:        run.ID,
				CaseID:       ec.ID,
				ActualOutput: mockOutput,
				Score:        score,
				Passed:       wasPassed,
				LatencyMs:    latencyMs,
				CostUSD:      costUSD,
				CreatedAt:    time.Now().UTC(),
			}
			h.db.Create(&result)

			if wasPassed {
				passed++
			}
			totalScore += score
			totalCost += costUSD
			totalLatency += latencyMs

			time.Sleep(50 * time.Millisecond) // simulate pacing
		}

		now := time.Now().UTC()
		avgScore := totalScore / float64(len(cases))
		avgLatency := float64(totalLatency) / float64(len(cases))
		h.db.Model(&run).Updates(map[string]any{
			"status":         "completed",
			"passed":         passed,
			"failed":         len(cases) - passed,
			"avg_score":      math.Round(avgScore*1000) / 1000,
			"total_cost_usd": math.Round(totalCost*100000) / 100000,
			"avg_latency_ms": math.Round(avgLatency),
			"completed_at":   now,
		})
	}()

	c.JSON(http.StatusAccepted, run)
}

func (h *Handlers) GetEvalRun(c *gin.Context) {
	var run database.EvalRun
	if err := h.db.First(&run, "id = ?", c.Param("runID")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var results []database.EvalResult
	h.db.Where("run_id = ?", run.ID).Find(&results)
	if results == nil {
		results = []database.EvalResult{}
	}

	// Join case inputs for display
	type resultWithCase struct {
		database.EvalResult
		Input          string `json:"input"`
		ExpectedOutput string `json:"expected_output"`
	}
	enriched := make([]resultWithCase, len(results))
	for i, r := range results {
		var ec database.EvalCase
		h.db.First(&ec, "id = ?", r.CaseID)
		enriched[i] = resultWithCase{EvalResult: r, Input: ec.Input, ExpectedOutput: ec.ExpectedOutput}
	}
	c.JSON(http.StatusOK, gin.H{"run": run, "results": enriched})
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

func tokenize(s string) map[string]int {
	words := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	m := map[string]int{}
	for _, w := range words {
		m[w]++
	}
	return m
}

func lexicalScore(expected, actual string) float64 {
	if expected == "" {
		return 0.8 // no expected = partial pass
	}
	expTokens := tokenize(expected)
	actTokens := tokenize(actual)
	if len(expTokens) == 0 {
		return 0.5
	}
	overlap := 0
	for w, c := range expTokens {
		if ac, ok := actTokens[w]; ok {
			if ac < c {
				overlap += ac
			} else {
				overlap += c
			}
		}
	}
	total := len(expTokens)
	score := float64(overlap) / float64(total)
	if score > 1.0 {
		score = 1.0
	}
	return math.Round(score*1000) / 1000
}

func simulateOutput(input, expected string) string {
	if expected != "" {
		// Return the expected output with small perturbations for realism
		words := strings.Fields(expected)
		if len(words) > 3 {
			// Drop ~15% of words randomly to simulate imperfect output
			rng := rand.New(rand.NewSource(int64(len(input))))
			kept := words[:0]
			for _, w := range words {
				if rng.Float64() > 0.15 {
					kept = append(kept, w)
				}
			}
			return strings.Join(kept, " ")
		}
		return expected
	}
	return "Processed: " + input[:evalMin(50, len(input))]
}

func evalMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}
