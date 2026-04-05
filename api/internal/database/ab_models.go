package database

import "time"

// ABTest compares two prompt variants with live traffic splitting.
type ABTest struct {
	ID          string     `gorm:"primaryKey"          json:"id"`
	Name        string     `gorm:"not null"            json:"name"`
	Description string     `gorm:"type:text"           json:"description"`
	PromptAID   string     `gorm:"index;not null"      json:"prompt_a_id"`
	PromptBID   string     `gorm:"index;not null"      json:"prompt_b_id"`
	TrafficSplit float64   `gorm:"default:0.5"        json:"traffic_split"` // 0–1, fraction sent to A
	Status      string     `gorm:"default:'running'"   json:"status"`        // running | concluded
	WinnerID    string     `json:"winner_id"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `gorm:"index"               json:"created_at"`
	ConcludedAt *time.Time `json:"concluded_at,omitempty"`
}

// ABTestResult records one LLM call outcome for a specific test variant.
type ABTestResult struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	TestID     string    `gorm:"index;not null" json:"test_id"`
	Variant    string    `json:"variant"`      // "a" | "b"
	Success    bool      `json:"success"`
	LatencyMS  int64     `json:"latency_ms"`
	TokensUsed int       `json:"tokens_used"`
	CostUSD    float64   `json:"cost_usd"`
	Feedback   int       `json:"feedback"`     // -1 bad | 0 neutral | 1 good
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}
