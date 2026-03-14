package database

import (
	"time"

	"gorm.io/gorm"
)

// Agent represents an agent deployment
type Agent struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Version   string    `json:"version"`
	Status    string    `json:"status"` // active, paused, error
	Config    string    `gorm:"type:jsonb" json:"config"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Trace represents an agent execution trace
type Trace struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	AgentID    string     `json:"agent_id"`
	RunID      string     `gorm:"index" json:"run_id"`
	TraceID    string     `gorm:"index" json:"trace_id"`
	SpanID     string     `json:"span_id"`
	ParentID   string     `json:"parent_id"`
	Name       string     `json:"name"`
	StartTime  time.Time  `json:"start_time"`
	EndTime    *time.Time `json:"end_time"`
	Duration   int64      `json:"duration_ms"`
	Status     string     `json:"status"` // ok, error
	Attributes string     `gorm:"type:jsonb" json:"attributes"`
	Events     string     `gorm:"type:jsonb" json:"events"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Incident represents an incident detected from traces
type Incident struct {
	ID               string     `gorm:"primaryKey" json:"id"`
	Title            string     `json:"title"`
	Severity         string     `json:"severity"` // critical, high, medium, low
	Status           string     `json:"status"`   // open, investigating, resolved
	AgentID          string     `gorm:"index" json:"agent_id"`
	TraceID          string     `gorm:"index" json:"trace_id"`
	RootCause        string     `gorm:"type:text" json:"root_cause"`
	SuggestedFix     string     `gorm:"type:text" json:"suggested_fix"`
	Confidence       float64    `json:"confidence"`
	CorrelatedTraces string     `gorm:"type:jsonb" json:"correlated_traces"`
	InfraMetrics     string     `gorm:"type:jsonb" json:"infra_metrics"`
	ResolvedAt       *time.Time `json:"resolved_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// Deployment represents an agent deployment in K8s
type Deployment struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	AgentID   string    `gorm:"index" json:"agent_id"`
	Namespace string    `json:"namespace"`
	Replicas  int       `json:"replicas"`
	Status    string    `json:"status"`
	Config    string    `gorm:"type:jsonb" json:"config"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AgentMemory stores persistent learnings across agent runs.
// Scope "agent" = private to one agent; scope "shared" = readable by all.
type AgentMemory struct {
	ID        string     `gorm:"primaryKey" json:"id"`
	AgentID   string     `gorm:"index" json:"agent_id"` // empty string = shared
	Scope     string     `gorm:"index" json:"scope"`    // "agent" | "shared"
	Key       string     `gorm:"index" json:"key"`
	Value     string     `gorm:"type:text" json:"value"`
	RunID     string     `json:"run_id"`        // run that wrote this memory
	TTL       *time.Time `json:"ttl,omitempty"` // nil = permanent
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// RouterLog records every model-routing decision for analytics.
type RouterLog struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	AgentID     string    `gorm:"index" json:"agent_id"`
	Task        string    `gorm:"type:text" json:"task"`
	Complexity  string    `json:"complexity"` // simple | moderate | complex
	ModelChosen string    `json:"model_chosen"`
	CostEstUSD  float64   `json:"cost_est_usd"`
	CreatedAt   time.Time `json:"created_at"`
}

// Webhook delivers event payloads to external URLs (Slack, PagerDuty, custom).
type Webhook struct {
	ID        string     `gorm:"primaryKey" json:"id"`
	Name      string     `json:"name"`
	URL       string     `gorm:"type:text" json:"url"`
	Events    string     `gorm:"type:jsonb" json:"events"` // ["incident.created","incident.resolved","trace.error"]
	Secret    string     `json:"-"`                        // HMAC-SHA256 signing secret, never returned
	Active    bool       `gorm:"default:true" json:"active"`
	LastFired *time.Time `json:"last_fired,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// AgentBudget defines spend limits per agent.
type AgentBudget struct {
	AgentID           string    `gorm:"primaryKey" json:"agent_id"`
	DailyLimitUSD     float64   `json:"daily_limit_usd"`
	MonthlyLimitUSD   float64   `json:"monthly_limit_usd"`
	AlertThresholdPct float64   `json:"alert_threshold_pct"` // e.g. 80 = alert at 80% of limit
	Active            bool      `gorm:"default:true" json:"active"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// APIKey authenticates SDK / external callers.
type APIKey struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	Name       string     `json:"name"`
	KeyHash    string     `gorm:"uniqueIndex" json:"-"` // SHA-256 of the raw key
	KeyPrefix  string     `json:"key_prefix"`           // first 8 chars shown in UI e.g. "ao_k_1a2b"
	Active     bool       `gorm:"default:true" json:"active"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ── NEXUS Models ──────────────────────────────────────────────────────────────

// BehavioralFingerprint stores statistical DNA for one agent over a time window.
type BehavioralFingerprint struct {
	ID               string    `gorm:"primaryKey" json:"id"`
	AgentID          string    `gorm:"index" json:"agent_id"`
	Window           string    `json:"window"` // "1h" | "6h" | "24h" | "7d"
	WindowStart      time.Time `gorm:"index" json:"window_start"`
	WindowEnd        time.Time `json:"window_end"`
	SampleCount      int64     `json:"sample_count"`
	P50LatencyMs     float64   `json:"p50_latency_ms"`
	P95LatencyMs     float64   `json:"p95_latency_ms"`
	P99LatencyMs     float64   `json:"p99_latency_ms"`
	AvgLatencyMs     float64   `json:"avg_latency_ms"`
	MaxLatencyMs     float64   `json:"max_latency_ms"`
	ErrorRate        float64   `json:"error_rate"`
	ErrorCount       int64     `json:"error_count"`
	AvgTokensPerReq  float64   `json:"avg_tokens_per_req"`
	P95TokensPerReq  float64   `json:"p95_tokens_per_req"`
	AvgCostPerReqUSD float64   `json:"avg_cost_per_req_usd"`
	TotalCostUSD     float64   `json:"total_cost_usd"`
	HealthScore      int       `json:"health_score"`
	ComputedAt       time.Time `gorm:"index" json:"computed_at"`
}

// AnomalyEvent fires when a metric deviates > 2.5σ from the 7-day baseline.
type AnomalyEvent struct {
	ID            string     `gorm:"primaryKey" json:"id"`
	AgentID       string     `gorm:"index" json:"agent_id"`
	Metric        string     `json:"metric"`
	ZScore        float64    `json:"z_score"`
	BaselineMean  float64    `json:"baseline_mean"`
	BaselineStdev float64    `json:"baseline_stddev"`
	ObservedValue float64    `json:"observed_value"`
	DeviationPct  float64    `json:"deviation_pct"`
	Severity      string     `json:"severity"` // "warning" | "critical"
	Status        string     `json:"status"`   // "open" | "acknowledged" | "resolved"
	WindowStart   time.Time  `json:"window_start"`
	WindowEnd     time.Time  `json:"window_end"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
	CreatedAt     time.Time  `gorm:"index" json:"created_at"`
}

// CausalEdge links two incidents in a cause→effect relationship.
type CausalEdge struct {
	ID                string    `gorm:"primaryKey" json:"id"`
	CauseID           string    `gorm:"index" json:"cause_id"`
	EffectID          string    `gorm:"index" json:"effect_id"`
	Confidence        float64   `json:"confidence"`
	LagMs             int64     `json:"lag_ms"`
	CorrelationMethod string    `json:"correlation_method"`
	SharedAgentID     string    `json:"shared_agent_id,omitempty"`
	SharedTraceID     string    `json:"shared_trace_id,omitempty"`
	SharedRunID       string    `json:"shared_run_id,omitempty"`
	GraphID           string    `gorm:"index" json:"graph_id"`
	CreatedAt         time.Time `json:"created_at"`
}

// HealthScoreHistory is the time-series consumed by the linear regression engine.
type HealthScoreHistory struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	AgentID       string    `gorm:"index" json:"agent_id"`
	Score         int       `json:"score"`
	ErrorRate     float64   `json:"error_rate"`
	AvgLatencyMs  float64   `json:"avg_latency_ms"`
	OpenIncidents int       `json:"open_incidents"`
	RecordedAt    time.Time `gorm:"index" json:"recorded_at"`
}

// HealthPrediction stores OLS regression output per agent per horizon.
type HealthPrediction struct {
	ID             string    `gorm:"primaryKey" json:"id"`
	AgentID        string    `gorm:"index" json:"agent_id"`
	Horizon        string    `json:"horizon"` // "+1h" | "+4h" | "+24h"
	PredictedScore float64   `json:"predicted_score"`
	Slope          float64   `json:"slope"`
	Intercept      float64   `json:"intercept"`
	RSquared       float64   `json:"r_squared"`
	TrainingPoints int       `json:"training_points"`
	IsCritical     bool      `json:"is_critical"`
	PredictedAt    time.Time `gorm:"index" json:"predicted_at"`
}

// TopologyEdge stores computed parent→child agent call relationships.
type TopologyEdge struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	ParentAgentID string    `gorm:"index" json:"parent_agent_id"`
	ChildAgentID  string    `gorm:"index" json:"child_agent_id"`
	EdgeCount     int64     `json:"edge_count"`
	LastSeenAt    time.Time `json:"last_seen_at"`
	WindowStart   time.Time `gorm:"index" json:"window_start"`
}

// User represents a human operator of the AgentOps platform.
// Roles: owner | admin | viewer | agent-runner
type User struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	Name         string    `json:"name"`
	Role         string    `gorm:"not null;default:'viewer'" json:"role"`
	PasswordHash string    `gorm:"not null" json:"-"`
	AvatarURL    string    `json:"avatar_url"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Session tracks active JWT refresh tokens per user.
type Session struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	UserID       string    `gorm:"index;not null" json:"user_id"`
	RefreshToken string    `gorm:"uniqueIndex;not null" json:"-"`
	UserAgent    string    `json:"user_agent"`
	IPAddress    string    `json:"ip_address"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// AuditEntry records every meaningful user or system action for compliance and observability.
type AuditEntry struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	UserID     string    `gorm:"index" json:"user_id"`
	UserEmail  string    `json:"user_email"`
	UserRole   string    `json:"user_role"`
	Action     string    `gorm:"index" json:"action"`   // e.g. "login", "agent.create", "trace.ingest"
	Resource   string    `json:"resource"`               // e.g. "agent", "trace", "incident"
	ResourceID string    `json:"resource_id"`
	Method     string    `json:"method"`                 // HTTP method
	Path       string    `json:"path"`                   // request path
	StatusCode int       `json:"status_code"`
	IPAddress  string    `json:"ip_address"`
	UserAgent  string    `json:"user_agent"`
	Detail     string    `gorm:"type:jsonb" json:"detail"` // extra JSON payload
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}

// ── Collaborative War Room ────────────────────────────────────────────────────

// WarRoom is one live incident response session tied to an Incident.
type WarRoom struct {
	ID           string     `gorm:"primaryKey" json:"id"`
	IncidentID   string     `gorm:"uniqueIndex;not null" json:"incident_id"`
	Title        string     `json:"title"`
	Status       string     `json:"status"`      // "active" | "resolved"
	Commander    string     `json:"commander"`   // user_id of incident commander
	Participants string     `gorm:"type:jsonb" json:"participants"` // []ParticipantInfo JSON
	CreatedBy    string     `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
}

// WarRoomMessage is a chat/annotation message in a war room.
type WarRoomMessage struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	RoomID     string    `gorm:"index;not null" json:"room_id"`
	UserID     string    `json:"user_id"`
	UserEmail  string    `json:"user_email"`
	UserRole   string    `json:"user_role"`
	Kind       string    `json:"kind"`    // "chat" | "annotation" | "system"
	Body       string    `gorm:"type:text" json:"body"`
	TraceID    string    `json:"trace_id,omitempty"`  // optional linked trace
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}

// WarRoomTask is a checklist item in a war room.
type WarRoomTask struct {
	ID          string     `gorm:"primaryKey" json:"id"`
	RoomID      string     `gorm:"index;not null" json:"room_id"`
	Title       string     `json:"title"`
	AssignedTo  string     `json:"assigned_to"`   // user_id
	AssigneeName string    `json:"assignee_name"`
	Done        bool       `json:"done"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	DoneAt      *time.Time `json:"done_at,omitempty"`
}

// BlastRadiusSimulation records one what-if simulation run.
type BlastRadiusSimulation struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	SourceAgentID string   `gorm:"index;not null" json:"source_agent_id"`
	ChangeType   string    `json:"change_type"` // "deploy" | "config" | "scale_down" | "rollback"
	ChangeDesc   string    `gorm:"type:text" json:"change_desc"`
	Iterations   int       `json:"iterations"`
	Results      string    `gorm:"type:jsonb" json:"results"` // []BlastRadiusResult JSON
	TotalAffected int      `json:"total_affected"`
	MaxDepth     int       `json:"max_depth"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `gorm:"index" json:"created_at"`
}

// SLODefinition defines a Service Level Objective for one agent.
type SLODefinition struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	AgentID     string    `gorm:"index;not null" json:"agent_id"`
	Name        string    `json:"name"`
	SLIType     string    `json:"sli_type"`     // "availability" | "latency" | "error_rate"
	TargetValue float64   `json:"target_value"` // e.g. 0.99 for 99% availability
	WindowDays  int       `json:"window_days"`  // rolling window, e.g. 30
	ThresholdMs int64     `json:"threshold_ms"` // for latency SLIs: max acceptable ms
	Enabled     bool      `gorm:"default:true" json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
}

// TraceSnapshot captures the full serialized state of an agent at a specific span.
type TraceSnapshot struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	TraceID    string    `gorm:"index;not null" json:"trace_id"`
	SpanID     string    `gorm:"index;not null" json:"span_id"`
	AgentID    string    `gorm:"index" json:"agent_id"`
	RunID      string    `gorm:"index" json:"run_id"`
	SeqNum     int       `json:"seq_num"`               // ordering within trace
	SpanName   string    `json:"span_name"`
	State      string    `gorm:"type:jsonb" json:"state"` // full agent state JSON
	TokensUsed int64     `json:"tokens_used"`
	CostUSD    float64   `json:"cost_usd"`
	DurationMs int64     `json:"duration_ms"`
	Status     string    `json:"status"`                  // ok | error | running
	RecordedAt time.Time `gorm:"index" json:"recorded_at"`
}

// TimelineFork records a user-initiated branch from a specific snapshot.
type TimelineFork struct {
	ID              string    `gorm:"primaryKey" json:"id"`
	OriginalTraceID string    `gorm:"index" json:"original_trace_id"`
	ForkSnapshotID  string    `json:"fork_snapshot_id"` // which snapshot we branched from
	ForkSeqNum      int       `json:"fork_seq_num"`
	Label           string    `json:"label"`
	Notes           string    `gorm:"type:text" json:"notes"`
	CreatedBy       string    `json:"created_by"` // user_id
	CreatedAt       time.Time `json:"created_at"`
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
		// Auth
		&User{},
		&Session{},
		&AuditEntry{},
		// NEXUS
		&BehavioralFingerprint{},
		&AnomalyEvent{},
		&CausalEdge{},
		&HealthScoreHistory{},
		&HealthPrediction{},
		&TopologyEdge{},
		// SLO
		// War Room
		&WarRoom{},
		&WarRoomMessage{},
		&WarRoomTask{},
		// Blast Radius
		&BlastRadiusSimulation{},
		&SLODefinition{},
		// Time-Travel Debugger
		&TraceSnapshot{},
		&TimelineFork{},
	)
}
