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

	"github.com/manasbhole/orion/api/internal/database"
	"github.com/manasbhole/orion/api/internal/services"
)

type Handlers struct {
	db                   *gorm.DB
	logger               *zap.Logger
	incidentEngine       *services.IncidentEngine
	orchestrationService *services.OrchestrationService
	traceService         *services.TraceService
	hub                  *services.EventHub
	memoryService        *services.MemoryService
	modelRouter          *services.ModelRouterService
	// NEXUS services
	fingerprint *services.BehavioralFingerprintService
	anomaly     *services.AnomalyDetectionService
	causal      *services.CausalGraphService
	predictive  *services.PredictiveHealthService
	topology    *services.TopologyService
	health      *services.HealthService
	// Auth
	authService  *services.AuthService
	auditService *services.AuditService
	// SLO
	sloService *services.SLOService
	// Time-Travel Debugger
	timeTravelService *services.TimeTravelService
	// Blast Radius Simulator
	blastRadiusService *services.BlastRadiusService
	// War Room
	warRoomService *services.WarRoomService
	// NLQ
	nlqService *services.NLQService
	// Genome Drift
	genomeService *services.GenomeService
	// Chaos Engineering
	chaosService *services.ChaosService
	// Alert Correlation
	alertCorrelationService *services.AlertCorrelationService
}

func NewHandlers(
	db *gorm.DB,
	logger *zap.Logger,
	incidentEngine *services.IncidentEngine,
	orchestrationService *services.OrchestrationService,
	traceService *services.TraceService,
	hub *services.EventHub,
	authService *services.AuthService,
	anthroAPIKey string,
) *Handlers {
	health := services.NewHealthService(db, logger)
	return &Handlers{
		db:                   db,
		logger:               logger,
		incidentEngine:       incidentEngine,
		orchestrationService: orchestrationService,
		traceService:         traceService,
		hub:                  hub,
		memoryService:        services.NewMemoryService(db, logger),
		modelRouter:          services.NewModelRouterService(db, logger),
		health:               health,
		fingerprint:          services.NewBehavioralFingerprintService(db, logger),
		anomaly:              services.NewAnomalyDetectionService(db, logger, hub),
		causal:               services.NewCausalGraphService(db, logger, hub),
		predictive:           services.NewPredictiveHealthService(db, logger, hub),
		topology:             services.NewTopologyService(db, logger),
		authService:          authService,
		auditService:         services.NewAuditService(db),
		sloService:           services.NewSLOService(db, logger, hub),
		timeTravelService:    services.NewTimeTravelService(db, logger),
		blastRadiusService:   services.NewBlastRadiusService(db, logger, hub),
		warRoomService:          services.NewWarRoomService(db, logger),
		nlqService:              services.NewNLQService(db, logger, anthroAPIKey),
		genomeService:           services.NewGenomeService(db, logger),
		chaosService:            services.NewChaosService(db, logger, hub),
		alertCorrelationService: services.NewAlertCorrelationService(db, logger, hub),
	}
}

func (h *Handlers) AuditService() *services.AuditService { return h.auditService }

// ─── SSE Events Handler ──────────────────────────────────────────────────────

// StreamEvents is the GET /api/v1/events SSE endpoint.
func (h *Handlers) StreamEvents(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	// Send a heartbeat every 20 s so proxies don't close the connection.
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	// Flush the headers immediately.
	c.Writer.Flush()

	for {
		select {
		case evt, ok := <-ch:
			if !ok {
				return
			}
			c.Writer.WriteString(evt.ToSSE())
			c.Writer.Flush()
		case <-ticker.C:
			c.Writer.WriteString(": heartbeat\n\n")
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
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

	go services.NewWebhookService(h.db, h.logger).Fire("incident.created", incidentToResponse(incident))

	c.JSON(http.StatusCreated, gin.H{"incident": incidentToResponse(incident)})
}

func (h *Handlers) ResolveIncident(c *gin.Context) {
	incident, err := h.incidentEngine.ResolveIncident(c.Request.Context(), c.Param("id"))
	if err != nil {
		h.logger.Error("failed to resolve incident", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve incident"})
		return
	}
	go services.NewWebhookService(h.db, h.logger).Fire("incident.resolved", incidentToResponse(incident))
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
	TotalAgents     int64   `json:"total_agents"`
	ActiveAgents    int64   `json:"active_agents"`
	ActiveIncidents int64   `json:"active_incidents"`
	TotalTraces     int64   `json:"total_traces"`
	ErrorTraces     int64   `json:"error_traces"`
	AvgLatencyMs    float64 `json:"avg_latency_ms"`
	ErrorRate       float64 `json:"error_rate"`
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

// ─── Memory Handlers ──────────────────────────────────────────────────────────

func (h *Handlers) GetAgentMemory(c *gin.Context) {
	agentID := c.Param("id")
	mems, err := h.memoryService.GetAgentMemory(agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"memories": mems, "count": len(mems)})
}

func (h *Handlers) GetSharedMemory(c *gin.Context) {
	mems, err := h.memoryService.GetSharedMemory()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"memories": mems, "count": len(mems)})
}

type SetMemoryRequest struct {
	Key   string `json:"key"   binding:"required"`
	Value string `json:"value" binding:"required"`
	Scope string `json:"scope"` // "agent" (default) | "shared"
	RunID string `json:"run_id"`
}

func (h *Handlers) SetMemory(c *gin.Context) {
	agentID := c.Param("id")
	var req SetMemoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Scope == "" {
		req.Scope = "agent"
	}
	mem, err := h.memoryService.Set(agentID, req.Scope, req.Key, req.Value, req.RunID, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"memory": mem})
}

func (h *Handlers) DeleteMemory(c *gin.Context) {
	agentID := c.Param("id")
	key := c.Param("key")
	scope := c.DefaultQuery("scope", "agent")
	if err := h.memoryService.Delete(agentID, scope, key); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ─── Model Router Handler ─────────────────────────────────────────────────────

type RouteRequest struct {
	AgentID        string `json:"agent_id"`
	Task           string `json:"task"            binding:"required"`
	PreferProvider string `json:"prefer_provider"` // "openai" | "ai-labs" | ""
}

func (h *Handlers) RouteModel(c *gin.Context) {
	var req RouteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	decision := h.modelRouter.Route(req.AgentID, req.Task, req.PreferProvider)
	c.JSON(http.StatusOK, gin.H{"decision": decision})
}

func (h *Handlers) GetRouterStats(c *gin.Context) {
	stats := h.modelRouter.Stats()
	c.JSON(http.StatusOK, gin.H{"router_stats": stats})
}

// ─── Health Score Handlers ────────────────────────────────────────────────────

func (h *Handlers) GetAgentHealth(c *gin.Context) {
	hs := services.NewHealthService(h.db, h.logger)
	score := hs.ComputeHealth(c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"health": score})
}

func (h *Handlers) GetFleetHealth(c *gin.Context) {
	hs := services.NewHealthService(h.db, h.logger)
	scores := hs.ComputeFleetHealth()
	c.JSON(http.StatusOK, gin.H{"health": scores, "count": len(scores)})
}

// ─── Webhook Handlers ─────────────────────────────────────────────────────────

type CreateWebhookRequest struct {
	Name   string   `json:"name"   binding:"required"`
	URL    string   `json:"url"    binding:"required"`
	Events []string `json:"events" binding:"required"`
}

func (h *Handlers) ListWebhooks(c *gin.Context) {
	svc := services.NewWebhookService(h.db, h.logger)
	hooks, err := svc.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"webhooks": hooks, "count": len(hooks)})
}

func (h *Handlers) CreateWebhook(c *gin.Context) {
	var req CreateWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	svc := services.NewWebhookService(h.db, h.logger)
	hook, err := svc.Create(req.Name, req.URL, req.Events)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"webhook": hook})
}

func (h *Handlers) DeleteWebhook(c *gin.Context) {
	svc := services.NewWebhookService(h.db, h.logger)
	if err := svc.Delete(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handlers) TestWebhook(c *gin.Context) {
	svc := services.NewWebhookService(h.db, h.logger)
	status, msg, err := svc.Test(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": status, "message": msg})
}

// ─── Budget Handlers ──────────────────────────────────────────────────────────

type SetBudgetRequest struct {
	DailyLimitUSD   float64 `json:"daily_limit_usd"`
	MonthlyLimitUSD float64 `json:"monthly_limit_usd"`
	AlertPct        float64 `json:"alert_threshold_pct"`
}

func (h *Handlers) GetBudget(c *gin.Context) {
	svc := services.NewBudgetService(h.db, h.logger)
	status, err := svc.Status(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no budget set for this agent"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"budget": status})
}

func (h *Handlers) SetBudget(c *gin.Context) {
	var req SetBudgetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	svc := services.NewBudgetService(h.db, h.logger)
	budget, err := svc.Set(c.Param("id"), req.DailyLimitUSD, req.MonthlyLimitUSD, req.AlertPct)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"budget": budget})
}

func (h *Handlers) GetAllBudgets(c *gin.Context) {
	svc := services.NewBudgetService(h.db, h.logger)
	statuses := svc.AllStatuses()
	c.JSON(http.StatusOK, gin.H{"budgets": statuses, "count": len(statuses)})
}

// ─── API Key Handlers ─────────────────────────────────────────────────────────

type CreateAPIKeyRequest struct {
	Name string `json:"name" binding:"required"`
}

func (h *Handlers) ListAPIKeys(c *gin.Context) {
	svc := services.NewAPIKeyService(h.db, h.logger)
	keys, err := svc.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"api_keys": keys, "count": len(keys)})
}

func (h *Handlers) CreateAPIKey(c *gin.Context) {
	var req CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	svc := services.NewAPIKeyService(h.db, h.logger)
	key, err := svc.Create(req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"api_key": key})
}

func (h *Handlers) RevokeAPIKey(c *gin.Context) {
	svc := services.NewAPIKeyService(h.db, h.logger)
	if err := svc.Revoke(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "revoked"})
}

// ─── Deployments ─────────────────────────────────────────────────────────────

func (h *Handlers) ListDeployments(c *gin.Context) {
	var deps []database.Deployment
	h.db.Order("created_at desc").Find(&deps)
	c.JSON(http.StatusOK, deps)
}

func (h *Handlers) CreateDeployment(c *gin.Context) {
	var dep database.Deployment
	if err := c.ShouldBindJSON(&dep); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dep.ID = uuid.New().String()
	dep.CreatedAt = time.Now()
	dep.UpdatedAt = time.Now()
	if dep.Status == "" {
		dep.Status = "pending"
	}
	if dep.Config == "" {
		dep.Config = "{}"
	}
	if err := h.db.Create(&dep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, dep)
}

func (h *Handlers) GetDeployment(c *gin.Context) {
	var dep database.Deployment
	if err := h.db.First(&dep, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, dep)
}

func (h *Handlers) UpdateDeployment(c *gin.Context) {
	var dep database.Deployment
	if err := h.db.First(&dep, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var update map[string]interface{}
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	update["updated_at"] = time.Now()
	h.db.Model(&dep).Updates(update)
	c.JSON(http.StatusOK, dep)
}

func (h *Handlers) DeleteDeployment(c *gin.Context) {
	if err := h.db.Delete(&database.Deployment{}, "id = ?", c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ─── Router Logs ─────────────────────────────────────────────────────────────

func (h *Handlers) ListRouterLogs(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "100")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var logs []database.RouterLog
	h.db.Order("created_at desc").Limit(limit).Find(&logs)
	c.JSON(http.StatusOK, logs)
}

// ─── NEXUS: Behavioral Fingerprints ──────────────────────────────────────────

func (h *Handlers) GetFingerprint(c *gin.Context) {
	window := c.DefaultQuery("window", "24h")
	fp, err := h.fingerprint.GetFingerprint(c.Request.Context(), c.Param("agentID"), window)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no fingerprint found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"fingerprint": fp})
}

func (h *Handlers) GetFingerprintHistory(c *gin.Context) {
	window := c.DefaultQuery("window", "24h")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "48"))
	fps, err := h.fingerprint.GetFingerprintHistory(c.Request.Context(), c.Param("agentID"), window, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"history": fps})
}

func (h *Handlers) GetFleetFingerprints(c *gin.Context) {
	window := c.DefaultQuery("window", "24h")
	fps, err := h.fingerprint.GetFleetFingerprints(c.Request.Context(), window)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"fingerprints": fps, "count": len(fps)})
}

// ─── NEXUS: Anomaly Detection ─────────────────────────────────────────────────

func (h *Handlers) GetAnomalyFeed(c *gin.Context) {
	agentID := c.Query("agent_id")
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	evts, err := h.anomaly.GetAnomalyFeed(c.Request.Context(), agentID, status, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"anomalies": evts, "count": len(evts)})
}

func (h *Handlers) AcknowledgeAnomaly(c *gin.Context) {
	evt, err := h.anomaly.AcknowledgeAnomaly(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"anomaly": evt})
}

func (h *Handlers) TriggerAnomalyScan(c *gin.Context) {
	var body struct {
		ZScoreThreshold float64 `json:"z_score_threshold"`
	}
	c.ShouldBindJSON(&body)
	if body.ZScoreThreshold <= 0 {
		body.ZScoreThreshold = 2.5
	}
	fired, err := h.anomaly.RunDetection(c.Request.Context(), body.ZScoreThreshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"fired": len(fired), "anomalies": fired})
}

// ─── NEXUS: Causal Graph ──────────────────────────────────────────────────────

func (h *Handlers) ListCausalGraphs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	graphs, err := h.causal.ListGraphs(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"graphs": graphs})
}

func (h *Handlers) GetCausalGraph(c *gin.Context) {
	graph, err := h.causal.GetGraph(c.Request.Context(), c.Param("graphID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "graph not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"graph": graph})
}

func (h *Handlers) GetIncidentCausalGraph(c *gin.Context) {
	graph, err := h.causal.GetGraphForIncident(c.Request.Context(), c.Param("incidentID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no causal graph for this incident"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"graph": graph})
}

func (h *Handlers) RebuildCausalGraph(c *gin.Context) {
	var body struct {
		LookbackMinutes int     `json:"lookback_minutes"`
		MaxLagMs        int64   `json:"max_lag_ms"`
		MinConfidence   float64 `json:"min_confidence"`
	}
	c.ShouldBindJSON(&body)
	if body.LookbackMinutes <= 0 {
		body.LookbackMinutes = 30
	}
	if body.MaxLagMs <= 0 {
		body.MaxLagMs = 300_000
	}
	if body.MinConfidence <= 0 {
		body.MinConfidence = 0.3
	}
	lookback := time.Duration(body.LookbackMinutes) * time.Minute
	edges, err := h.causal.BuildCausalGraph(c.Request.Context(), lookback, body.MaxLagMs, body.MinConfidence)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"edges_created": len(edges)})
}

// ─── NEXUS: Predictive Health ─────────────────────────────────────────────────

func (h *Handlers) GetAgentPredictions(c *gin.Context) {
	agentID := c.Param("agentID")
	preds, err := h.predictive.GetPredictions(c.Request.Context(), agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	since := time.Now().Add(-48 * time.Hour)
	history, _ := h.predictive.GetHealthHistory(c.Request.Context(), agentID, since)
	c.JSON(http.StatusOK, gin.H{"predictions": preds, "history": history})
}

func (h *Handlers) GetAllPredictions(c *gin.Context) {
	criticalOnly := c.Query("critical_only") == "true"
	preds, err := h.predictive.GetAllPredictions(c.Request.Context(), criticalOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"predictions": preds, "count": len(preds)})
}

func (h *Handlers) GetAgentHealthHistory(c *gin.Context) {
	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "48"))
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	history, err := h.predictive.GetHealthHistory(c.Request.Context(), c.Param("agentID"), since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"history": history})
}

// ─── NEXUS: Topology ──────────────────────────────────────────────────────────

func (h *Handlers) GetTopologyGraph(c *gin.Context) {
	graph, err := h.topology.GetTopologyGraph(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"graph": graph})
}

func (h *Handlers) RebuildTopology(c *gin.Context) {
	if err := h.topology.RebuildTopology(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ─── NEXUS: Summary ───────────────────────────────────────────────────────────

func (h *Handlers) GetNEXUSSummary(c *gin.Context) {
	ctx := c.Request.Context()

	var activeAnomalies int64
	h.db.WithContext(ctx).Model(&database.AnomalyEvent{}).Where("status = 'open'").Count(&activeAnomalies)

	var criticalPredictions int64
	h.db.WithContext(ctx).Model(&database.HealthPrediction{}).Where("is_critical = true").Count(&criticalPredictions)

	type graphCount struct{ Count int64 }
	var gc struct{ Count int64 }
	h.db.WithContext(ctx).Raw("SELECT COUNT(DISTINCT graph_id) AS count FROM causal_edges").Scan(&gc)

	var fingerprintedAgents int64
	h.db.WithContext(ctx).Raw("SELECT COUNT(DISTINCT agent_id) FROM behavioral_fingerprints").Scan(&fingerprintedAgents)

	var topoNodes int64
	h.db.WithContext(ctx).Raw("SELECT COUNT(DISTINCT parent_agent_id) + COUNT(DISTINCT child_agent_id) FROM topology_edges WHERE window_start >= ?",
		time.Now().Add(-2*time.Hour)).Scan(&topoNodes)

	var topoEdges int64
	h.db.WithContext(ctx).Model(&database.TopologyEdge{}).
		Where("window_start >= ?", time.Now().Add(-2*time.Hour)).Count(&topoEdges)

	c.JSON(http.StatusOK, gin.H{
		"active_anomalies":     activeAnomalies,
		"critical_predictions": criticalPredictions,
		"causal_clusters":      gc.Count,
		"agents_fingerprinted": fingerprintedAgents,
		"topology_nodes":       topoNodes,
		"topology_edges":       topoEdges,
		"last_scan_at":         time.Now(),
	})
}
