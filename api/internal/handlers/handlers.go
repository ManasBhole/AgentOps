package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/agentops/agentops/api/internal/database"
	"github.com/agentops/agentops/api/internal/services"
)

type Handlers struct {
	db                   *gorm.DB
	logger               *zap.Logger
	incidentEngine       *services.IncidentEngine
	orchestrationService *services.OrchestrationService
	traceService         *services.TraceService
}

func NewHandlers(
	db *gorm.DB,
	logger *zap.Logger,
	incidentEngine *services.IncidentEngine,
	orchestrationService *services.OrchestrationService,
	traceService *services.TraceService,
) *Handlers {
	return &Handlers{
		db:                   db,
		logger:               logger,
		incidentEngine:       incidentEngine,
		orchestrationService: orchestrationService,
		traceService:         traceService,
	}
}

// toJSONString marshals a value to a JSON string, returning empty string on error.
func toJSONString(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// ─── Trace DTOs ──────────────────────────────────────────────────────────────

type TraceResponse struct {
	ID         string     `json:"id"`
	AgentID    string     `json:"agent_id"`
	RunID      string     `json:"run_id"`
	TraceID    string     `json:"trace_id"`
	Name       string     `json:"name"`
	Status     string     `json:"status"`
	DurationMs int64      `json:"duration_ms"`
	StartTime  time.Time  `json:"start_time"`
	EndTime    *time.Time `json:"end_time,omitempty"`
}

type CreateTraceRequest struct {
	AgentID    string                   `json:"agent_id" binding:"required"`
	RunID      string                   `json:"run_id" binding:"required"`
	TraceID    string                   `json:"trace_id" binding:"required"`
	Name       string                   `json:"name" binding:"required"`
	Status     string                   `json:"status" binding:"required"`
	DurationMs int64                    `json:"duration_ms"`
	StartTime  *time.Time               `json:"start_time,omitempty"`
	EndTime    *time.Time               `json:"end_time,omitempty"`
	Attributes map[string]interface{}   `json:"attributes,omitempty"`
	Events     []map[string]interface{} `json:"events,omitempty"`
}

func traceToResponse(t *database.Trace) TraceResponse {
	return TraceResponse{
		ID:         t.ID,
		AgentID:    t.AgentID,
		RunID:      t.RunID,
		TraceID:    t.TraceID,
		Name:       t.Name,
		Status:     t.Status,
		DurationMs: t.Duration,
		StartTime:  t.StartTime,
		EndTime:    t.EndTime,
	}
}

// ─── Trace Handlers ──────────────────────────────────────────────────────────

func (h *Handlers) GetTraces(c *gin.Context) {
	agentID := c.Query("agent_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 {
		limit = 50
	}

	traces, err := h.traceService.ListTraces(c.Request.Context(), agentID, limit)
	if err != nil {
		h.logger.Error("failed to list traces", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list traces"})
		return
	}

	response := make([]TraceResponse, len(traces))
	for i := range traces {
		response[i] = traceToResponse(&traces[i])
	}
	c.JSON(http.StatusOK, gin.H{"traces": response})
}

func (h *Handlers) GetTrace(c *gin.Context) {
	trace, err := h.traceService.GetTrace(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"trace": traceToResponse(trace)})
}

func (h *Handlers) CreateTrace(c *gin.Context) {
	var req CreateTraceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	startTime := time.Now().UTC()
	if req.StartTime != nil {
		startTime = *req.StartTime
	}

	trace := &database.Trace{
		ID:        req.TraceID,
		AgentID:   req.AgentID,
		RunID:     req.RunID,
		TraceID:   req.TraceID,
		Name:      req.Name,
		Status:    req.Status,
		Duration:  req.DurationMs,
		StartTime: startTime,
		EndTime:   req.EndTime,
	}
	if req.Attributes != nil {
		trace.Attributes = toJSONString(req.Attributes)
	}
	if req.Events != nil {
		trace.Events = toJSONString(req.Events)
	}

	if err := h.traceService.StoreTrace(c.Request.Context(), trace); err != nil {
		h.logger.Error("failed to store trace", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store trace"})
		return
	}

	// Auto-trigger incident analysis for error traces
	if trace.Status == "error" {
		traceID := trace.TraceID
		go func() {
			if err := h.incidentEngine.AnalyzeTrace(context.Background(), traceID); err != nil {
				h.logger.Error("incident analysis failed", zap.Error(err), zap.String("trace_id", traceID))
			}
		}()
	}

	c.JSON(http.StatusCreated, gin.H{"id": trace.TraceID})
}

// ─── Incident DTOs ───────────────────────────────────────────────────────────

type IncidentResponse struct {
	ID           string     `json:"id"`
	Title        string     `json:"title"`
	Severity     string     `json:"severity"`
	Status       string     `json:"status"`
	AgentID      string     `json:"agent_id"`
	TraceID      string     `json:"trace_id"`
	RootCause    string     `json:"root_cause"`
	SuggestedFix string     `json:"suggested_fix"`
	Confidence   float64    `json:"confidence"`
	CreatedAt    time.Time  `json:"created_at"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
}

type CreateIncidentRequest struct {
	Title        string  `json:"title" binding:"required"`
	Severity     string  `json:"severity" binding:"required"`
	AgentID      string  `json:"agent_id" binding:"required"`
	TraceID      string  `json:"trace_id"`
	RootCause    string  `json:"root_cause"`
	SuggestedFix string  `json:"suggested_fix"`
	Confidence   float64 `json:"confidence"`
}

func incidentToResponse(i *database.Incident) IncidentResponse {
	return IncidentResponse{
		ID:           i.ID,
		Title:        i.Title,
		Severity:     i.Severity,
		Status:       i.Status,
		AgentID:      i.AgentID,
		TraceID:      i.TraceID,
		RootCause:    i.RootCause,
		SuggestedFix: i.SuggestedFix,
		Confidence:   i.Confidence,
		CreatedAt:    i.CreatedAt,
		ResolvedAt:   i.ResolvedAt,
	}
}

// ─── Incident Handlers ───────────────────────────────────────────────────────

func (h *Handlers) GetIncidents(c *gin.Context) {
	agentID := c.Query("agent_id")
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 {
		limit = 50
	}

	incidents, err := h.incidentEngine.ListIncidents(c.Request.Context(), agentID, status, limit)
	if err != nil {
		h.logger.Error("failed to list incidents", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list incidents"})
		return
	}

	response := make([]IncidentResponse, len(incidents))
	for i := range incidents {
		response[i] = incidentToResponse(&incidents[i])
	}
	c.JSON(http.StatusOK, gin.H{"incidents": response})
}

func (h *Handlers) GetIncident(c *gin.Context) {
	incident, err := h.incidentEngine.GetIncident(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "incident not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"incident": incidentToResponse(incident)})
}

func (h *Handlers) CreateIncident(c *gin.Context) {
	var req CreateIncidentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().UTC()
	incident := &database.Incident{
		ID:           "inc_" + uuid.New().String()[:8],
		Title:        req.Title,
		Severity:     req.Severity,
		Status:       "open",
		AgentID:      req.AgentID,
		TraceID:      req.TraceID,
		RootCause:    req.RootCause,
		SuggestedFix: req.SuggestedFix,
		Confidence:   req.Confidence,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := h.db.Create(incident).Error; err != nil {
		h.logger.Error("failed to create incident", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create incident"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"incident": incidentToResponse(incident)})
}

func (h *Handlers) ResolveIncident(c *gin.Context) {
	incident, err := h.incidentEngine.ResolveIncident(c.Request.Context(), c.Param("id"))
	if err != nil {
		h.logger.Error("failed to resolve incident", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve incident"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"incident": incidentToResponse(incident)})
}

// ─── Agent DTOs ──────────────────────────────────────────────────────────────

type AgentResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Version   string    `json:"version"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateAgentRequest struct {
	Name    string                 `json:"name" binding:"required"`
	Type    string                 `json:"type" binding:"required"`
	Version string                 `json:"version"`
	Config  map[string]interface{} `json:"config,omitempty"`
}

type UpdateAgentRequest struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Status  string `json:"status"`
}

func agentToResponse(a *database.Agent) AgentResponse {
	return AgentResponse{
		ID:        a.ID,
		Name:      a.Name,
		Type:      a.Type,
		Version:   a.Version,
		Status:    a.Status,
		CreatedAt: a.CreatedAt,
		UpdatedAt: a.UpdatedAt,
	}
}

// ─── Agent Handlers ──────────────────────────────────────────────────────────

func (h *Handlers) GetAgents(c *gin.Context) {
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit <= 0 {
		limit = 100
	}

	query := h.db.WithContext(c.Request.Context()).Order("created_at DESC").Limit(limit)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var agents []database.Agent
	if err := query.Find(&agents).Error; err != nil {
		h.logger.Error("failed to list agents", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list agents"})
		return
	}

	response := make([]AgentResponse, len(agents))
	for i := range agents {
		response[i] = agentToResponse(&agents[i])
	}
	c.JSON(http.StatusOK, gin.H{"agents": response})
}

func (h *Handlers) GetAgent(c *gin.Context) {
	var agent database.Agent
	if err := h.db.WithContext(c.Request.Context()).Where("id = ?", c.Param("id")).First(&agent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"agent": agentToResponse(&agent)})
}

func (h *Handlers) CreateAgent(c *gin.Context) {
	var req CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	version := req.Version
	if version == "" {
		version = "1.0.0"
	}

	now := time.Now().UTC()
	agent := &database.Agent{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Type:      req.Type,
		Version:   version,
		Status:    "active",
		Config:    toJSONString(req.Config),
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := h.db.Create(agent).Error; err != nil {
		h.logger.Error("failed to create agent", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agent"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"agent": agentToResponse(agent)})
}

func (h *Handlers) UpdateAgent(c *gin.Context) {
	var agent database.Agent
	if err := h.db.WithContext(c.Request.Context()).Where("id = ?", c.Param("id")).First(&agent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}

	var req UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		agent.Name = req.Name
	}
	if req.Version != "" {
		agent.Version = req.Version
	}
	if req.Status != "" {
		agent.Status = req.Status
	}
	agent.UpdatedAt = time.Now().UTC()

	if err := h.db.Save(&agent).Error; err != nil {
		h.logger.Error("failed to update agent", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update agent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"agent": agentToResponse(&agent)})
}

func (h *Handlers) DeleteAgent(c *gin.Context) {
	result := h.db.WithContext(c.Request.Context()).Where("id = ?", c.Param("id")).Delete(&database.Agent{})
	if result.Error != nil {
		h.logger.Error("failed to delete agent", zap.Error(result.Error))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete agent"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ─── Stats Handler ───────────────────────────────────────────────────────────

type StatsResponse struct {
	TotalAgents      int64   `json:"total_agents"`
	ActiveAgents     int64   `json:"active_agents"`
	ActiveIncidents  int64   `json:"active_incidents"`
	TotalTraces      int64   `json:"total_traces"`
	ErrorTraces      int64   `json:"error_traces"`
	AvgLatencyMs     float64 `json:"avg_latency_ms"`
	ErrorRate        float64 `json:"error_rate"`
}

func (h *Handlers) GetStats(c *gin.Context) {
	ctx := c.Request.Context()
	var stats StatsResponse

	h.db.WithContext(ctx).Model(&database.Agent{}).Count(&stats.TotalAgents)
	h.db.WithContext(ctx).Model(&database.Agent{}).Where("status = ?", "active").Count(&stats.ActiveAgents)
	h.db.WithContext(ctx).Model(&database.Incident{}).Where("status != ?", "resolved").Count(&stats.ActiveIncidents)
	h.db.WithContext(ctx).Model(&database.Trace{}).Count(&stats.TotalTraces)
	h.db.WithContext(ctx).Model(&database.Trace{}).Where("status = ?", "error").Count(&stats.ErrorTraces)

	var avgDuration *float64
	h.db.WithContext(ctx).Model(&database.Trace{}).Select("AVG(duration_ms)").Scan(&avgDuration)
	if avgDuration != nil {
		stats.AvgLatencyMs = *avgDuration
	}

	if stats.TotalTraces > 0 {
		stats.ErrorRate = float64(stats.ErrorTraces) / float64(stats.TotalTraces) * 100
	}

	c.JSON(http.StatusOK, stats)
}

// ─── Orchestration Handlers ──────────────────────────────────────────────────

func (h *Handlers) GetDeployments(c *gin.Context) {
	agentID := c.Query("agent_id")
	query := h.db.WithContext(c.Request.Context()).Order("created_at DESC")
	if agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	var deployments []database.Deployment
	if err := query.Find(&deployments).Error; err != nil {
		h.logger.Error("failed to list deployments", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list deployments"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deployments": deployments})
}

type DeployAgentRequest struct {
	AgentID   string                 `json:"agent_id" binding:"required"`
	Namespace string                 `json:"namespace"`
	Replicas  int                    `json:"replicas"`
	Config    map[string]interface{} `json:"config,omitempty"`
}

func (h *Handlers) DeployAgent(c *gin.Context) {
	var req DeployAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deployment, err := h.orchestrationService.DeployAgent(c.Request.Context(), req.AgentID, req.Config)
	if err != nil {
		h.logger.Error("failed to deploy agent", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"deployment": deployment})
}

type ScaleAgentRequest struct {
	DeploymentID string `json:"deployment_id" binding:"required"`
	Replicas     int    `json:"replicas" binding:"required,min=0,max=50"`
}

func (h *Handlers) ScaleAgent(c *gin.Context) {
	var req ScaleAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.orchestrationService.ScaleAgent(c.Request.Context(), req.DeploymentID, req.Replicas); err != nil {
		h.logger.Error("failed to scale agent", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "scaled", "replicas": req.Replicas})
}

type CircuitBreakerRequest struct {
	AgentID  string                 `json:"agent_id" binding:"required"`
	Settings map[string]interface{} `json:"settings" binding:"required"`
}

func (h *Handlers) SetCircuitBreaker(c *gin.Context) {
	var req CircuitBreakerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.orchestrationService.SetCircuitBreaker(c.Request.Context(), req.AgentID, req.Settings); err != nil {
		h.logger.Error("failed to configure circuit breaker", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "configured"})
}
