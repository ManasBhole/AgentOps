package database

import "time"

// RedTeamVector is a named adversarial attack definition.
type RedTeamVector struct {
	ID          string `gorm:"primaryKey"  json:"id"`
	Name        string `gorm:"not null"    json:"name"`
	Category    string `gorm:"index"       json:"category"`    // prompt_injection|jailbreak|pii_extraction|indirect_injection|role_confusion|cost_attack
	Severity    string `json:"severity"`                        // critical|high|medium|low
	Payload     string `gorm:"type:text"   json:"payload"`      // attack prompt template
	Description string `gorm:"type:text"   json:"description"`
	Remediation string `gorm:"type:text"   json:"remediation"`
}

// RedTeamScan is one full adversarial sweep of an agent.
type RedTeamScan struct {
	ID          string     `gorm:"primaryKey"  json:"id"`
	AgentID     string     `gorm:"index"       json:"agent_id"`
	Status      string     `json:"status"`                       // running|completed|failed
	VectorsRun  int        `json:"vectors_run"`
	Findings    int        `json:"findings"`
	Score       float64    `json:"score"`                        // 0–100
	CreatedAt   time.Time  `gorm:"index"       json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// RedTeamFinding records one attack attempt and its outcome.
type RedTeamFinding struct {
	ID          string    `gorm:"primaryKey"  json:"id"`
	ScanID      string    `gorm:"index"       json:"scan_id"`
	AgentID     string    `gorm:"index"       json:"agent_id"`
	VectorID    string    `json:"vector_id"`
	VectorName  string    `json:"vector_name"`
	Category    string    `json:"category"`
	Severity    string    `json:"severity"`
	Payload     string    `gorm:"type:text"   json:"payload"`
	Response    string    `gorm:"type:text"   json:"response"`   // Claude's simulated agent response
	Successful  bool      `json:"successful"`                    // did attack get through?
	Confidence  float64   `json:"confidence"`
	Remediation string    `gorm:"type:text"   json:"remediation"`
	CreatedAt   time.Time `gorm:"index"       json:"created_at"`
}
