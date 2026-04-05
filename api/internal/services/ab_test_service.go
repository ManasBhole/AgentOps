package services

import (
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/manasbhole/orion/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ABTestService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewABTestService(db *gorm.DB, logger *zap.Logger) *ABTestService {
	return &ABTestService{db: db, logger: logger}
}

// VariantStats aggregates results for one variant.
type VariantStats struct {
	Variant     string  `json:"variant"`
	Runs        int     `json:"runs"`
	SuccessRate float64 `json:"success_rate"`
	AvgLatency  float64 `json:"avg_latency_ms"`
	AvgTokens   float64 `json:"avg_tokens"`
	AvgCost     float64 `json:"avg_cost_usd"`
	AvgFeedback float64 `json:"avg_feedback"`
}

// ABTestDetail combines the test record with computed stats.
type ABTestDetail struct {
	database.ABTest
	PromptAName string       `json:"prompt_a_name"`
	PromptBName string       `json:"prompt_b_name"`
	StatsA      VariantStats `json:"stats_a"`
	StatsB      VariantStats `json:"stats_b"`
	// Two-proportion Z-test significance
	ZScore      float64 `json:"z_score"`
	Significant bool    `json:"significant"` // |z| > 1.96 → p < 0.05
}

func (s *ABTestService) Create(name, description, promptAID, promptBID, createdBy string, split float64) (*database.ABTest, error) {
	t := database.ABTest{
		ID:           "abt_" + uuid.NewString()[:16],
		Name:         name,
		Description:  description,
		PromptAID:    promptAID,
		PromptBID:    promptBID,
		TrafficSplit: split,
		Status:       "running",
		CreatedBy:    createdBy,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.db.Create(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *ABTestService) List() ([]ABTestDetail, error) {
	var tests []database.ABTest
	if err := s.db.Order("created_at DESC").Find(&tests).Error; err != nil {
		return nil, err
	}
	out := make([]ABTestDetail, 0, len(tests))
	for _, t := range tests {
		d, err := s.enrich(t)
		if err != nil {
			continue
		}
		out = append(out, *d)
	}
	return out, nil
}

func (s *ABTestService) Get(id string) (*ABTestDetail, error) {
	var t database.ABTest
	if err := s.db.First(&t, "id = ?", id).Error; err != nil {
		return nil, fmt.Errorf("test not found: %w", err)
	}
	return s.enrich(t)
}

func (s *ABTestService) RecordResult(testID, variant string, success bool, latencyMS int64, tokens int, costUSD float64, feedback int) error {
	r := database.ABTestResult{
		ID:         "abr_" + uuid.NewString()[:16],
		TestID:     testID,
		Variant:    variant,
		Success:    success,
		LatencyMS:  latencyMS,
		TokensUsed: tokens,
		CostUSD:    costUSD,
		Feedback:   feedback,
		CreatedAt:  time.Now().UTC(),
	}
	return s.db.Create(&r).Error
}

func (s *ABTestService) Conclude(id, winnerID string) (*database.ABTest, error) {
	now := time.Now().UTC()
	if err := s.db.Model(&database.ABTest{}).Where("id = ?", id).Updates(map[string]any{
		"status": "concluded", "winner_id": winnerID, "concluded_at": now,
	}).Error; err != nil {
		return nil, err
	}
	var t database.ABTest
	s.db.First(&t, "id = ?", id)
	return &t, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (s *ABTestService) enrich(t database.ABTest) (*ABTestDetail, error) {
	var pA, pB database.PromptTemplate
	s.db.Select("id, name").First(&pA, "id = ?", t.PromptAID)
	s.db.Select("id, name").First(&pB, "id = ?", t.PromptBID)

	statsA := s.aggregate(t.ID, "a")
	statsB := s.aggregate(t.ID, "b")

	z := abZScore(statsA, statsB)

	return &ABTestDetail{
		ABTest:      t,
		PromptAName: pA.Name,
		PromptBName: pB.Name,
		StatsA:      statsA,
		StatsB:      statsB,
		ZScore:      z,
		Significant: math.Abs(z) > 1.96,
	}, nil
}

func (s *ABTestService) aggregate(testID, variant string) VariantStats {
	var results []database.ABTestResult
	s.db.Where("test_id = ? AND variant = ?", testID, variant).Find(&results)

	st := VariantStats{Variant: variant, Runs: len(results)}
	if len(results) == 0 {
		return st
	}

	var successes int
	var sumLat, sumTok, sumCost, sumFeed float64
	for _, r := range results {
		if r.Success {
			successes++
		}
		sumLat += float64(r.LatencyMS)
		sumTok += float64(r.TokensUsed)
		sumCost += r.CostUSD
		sumFeed += float64(r.Feedback)
	}
	n := float64(len(results))
	st.SuccessRate = float64(successes) / n
	st.AvgLatency = sumLat / n
	st.AvgTokens = sumTok / n
	st.AvgCost = sumCost / n
	st.AvgFeedback = sumFeed / n
	return st
}

// abZScore computes the two-proportion Z-test between A and B success rates.
func abZScore(a, b VariantStats) float64 {
	if a.Runs == 0 || b.Runs == 0 {
		return 0
	}
	nA, nB := float64(a.Runs), float64(b.Runs)
	pA, pB := a.SuccessRate, b.SuccessRate
	pPool := (pA*nA + pB*nB) / (nA + nB)
	se := math.Sqrt(pPool * (1 - pPool) * (1/nA + 1/nB))
	if se == 0 {
		return 0
	}
	return (pA - pB) / se
}
