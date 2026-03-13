package database

import (
	"time"

	"gorm.io/gorm"
)

// Agent represents an agent deployment
type Agent struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Version     string    `json:"version"`
	Status      string    `json:"status"` // active, paused, error
	Config      string    `gorm:"type:jsonb" json:"config"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Trace represents an agent execution trace
type Trace struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	AgentID     string    `json:"agent_id"`
	RunID       string    `gorm:"index" json:"run_id"`
	TraceID     string    `gorm:"index" json:"trace_id"`
	SpanID      string    `json:"span_id"`
	ParentID    string    `json:"parent_id"`
	Name        string    `json:"name"`
	StartTime   time.Time `json:"start_time"`
	EndTime     *time.Time `json:"end_time"`
	Duration    int64     `json:"duration_ms"`
	Status      string    `json:"status"` // ok, error
	Attributes  string    `gorm:"type:jsonb" json:"attributes"`
	Events      string    `gorm:"type:jsonb" json:"events"`
	CreatedAt   time.Time `json:"created_at"`
}

// Incident represents an incident detected from traces
type Incident struct {
	ID              string    `gorm:"primaryKey" json:"id"`
	Title           string    `json:"title"`
	Severity        string    `json:"severity"` // critical, high, medium, low
	Status          string    `json:"status"`    // open, investigating, resolved
	AgentID         string    `gorm:"index" json:"agent_id"`
	TraceID         string    `gorm:"index" json:"trace_id"`
	RootCause       string    `gorm:"type:text" json:"root_cause"`
	SuggestedFix    string    `gorm:"type:text" json:"suggested_fix"`
	Confidence      float64   `json:"confidence"`
	CorrelatedTraces string   `gorm:"type:jsonb" json:"correlated_traces"`
	InfraMetrics    string    `gorm:"type:jsonb" json:"infra_metrics"`
	ResolvedAt      *time.Time `json:"resolved_at"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Deployment represents an agent deployment in K8s
type Deployment struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	AgentID     string    `gorm:"index" json:"agent_id"`
	Namespace   string    `json:"namespace"`
	Replicas    int       `json:"replicas"`
	Status      string    `json:"status"`
	Config      string    `gorm:"type:jsonb" json:"config"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AgentMemory stores persistent learnings across agent runs.
// Scope "agent" = private to one agent; scope "shared" = readable by all.
type AgentMemory struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	AgentID   string    `gorm:"index" json:"agent_id"` // empty string = shared
	Scope     string    `gorm:"index" json:"scope"`    // "agent" | "shared"
	Key       string    `gorm:"index" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	RunID     string    `json:"run_id"`     // run that wrote this memory
	TTL       *time.Time `json:"ttl,omitempty"` // nil = permanent
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RouterLog records every model-routing decision for analytics.
type RouterLog struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	AgentID     string    `gorm:"index" json:"agent_id"`
	Task        string    `gorm:"type:text" json:"task"`
	Complexity  string    `json:"complexity"`   // simple | moderate | complex
	ModelChosen string    `json:"model_chosen"`
	CostEstUSD  float64   `json:"cost_est_usd"`
	CreatedAt   time.Time `json:"created_at"`
}

// Webhook delivers event payloads to external URLs (Slack, PagerDuty, custom).
type Webhook struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	URL       string    `gorm:"type:text" json:"url"`
	Events    string    `gorm:"type:jsonb" json:"events"` // ["incident.created","incident.resolved","trace.error"]
	Secret    string    `json:"-"`                        // HMAC-SHA256 signing secret, never returned
	Active    bool      `gorm:"default:true" json:"active"`
	LastFired *time.Time `json:"last_fired,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AgentBudget defines spend limits per agent.
type AgentBudget struct {
	AgentID          string    `gorm:"primaryKey" json:"agent_id"`
	DailyLimitUSD    float64   `json:"daily_limit_usd"`
	MonthlyLimitUSD  float64   `json:"monthly_limit_usd"`
	AlertThresholdPct float64  `json:"alert_threshold_pct"` // e.g. 80 = alert at 80% of limit
	Active           bool      `gorm:"default:true" json:"active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// APIKey authenticates SDK / external callers.
type APIKey struct {
	ID          string     `gorm:"primaryKey" json:"id"`
	Name        string     `json:"name"`
	KeyHash     string     `gorm:"uniqueIndex" json:"-"` // SHA-256 of the raw key
	KeyPrefix   string     `json:"key_prefix"`           // first 8 chars shown in UI e.g. "ao_k_1a2b"
	Active      bool       `gorm:"default:true" json:"active"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Migrate runs database migrations
func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&Agent{},
		&Trace{},
		&Incident{},
		&Deployment{},
		&AgentMemory{},
		&RouterLog{},
		&Webhook{},
		&AgentBudget{},
		&APIKey{},
	)
}
