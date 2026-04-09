package database

import "time"

// AIIncidentAnalysis stores Claude's RCA result — cached per incident.
type AIIncidentAnalysis struct {
	ID              string    `gorm:"primaryKey"   json:"id"`
	IncidentID      string    `gorm:"uniqueIndex"  json:"incident_id"`
	Summary         string    `gorm:"type:text"    json:"summary"`
	RootCause       string    `gorm:"type:text"    json:"root_cause"`
	FixSteps        string    `gorm:"type:text"    json:"fix_steps"`        // JSON []string
	ImpactedSystems string    `gorm:"type:text"    json:"impacted_systems"` // JSON []string
	TimeToFix       string    `json:"time_to_fix"`
	Priority        string    `json:"priority"` // immediate | today | this-week
	Confidence      float64   `json:"confidence"`
	ModelUsed       string    `json:"model_used"`
	TokensUsed      int       `json:"tokens_used"`
	CreatedAt       time.Time `json:"created_at"`
}
