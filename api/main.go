package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/agentops/agentops/api/internal/config"
	"github.com/agentops/agentops/api/internal/database"
	"github.com/agentops/agentops/api/internal/handlers"
	"github.com/agentops/agentops/api/internal/middleware"
	"github.com/agentops/agentops/api/internal/services"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}

	// Run migrations
	if err := database.Migrate(db); err != nil {
		logger.Fatal("Failed to run migrations", zap.Error(err))
	}

	// Initialize auth service and seed default owner if empty
	authSvc := services.NewAuthService(db, logger, cfg.JWTSecret)
	authSvc.EnsureDefaultOwner()

	// Initialize services
	hub := services.NewEventHub()
	incidentEngine := services.NewIncidentEngine(db, logger, hub)
	orchestrationService := services.NewOrchestrationService(db, logger, cfg)
	traceService := services.NewTraceService(db, logger)

	// Initialize handlers
	h := handlers.NewHandlers(
		db,
		logger,
		incidentEngine,
		orchestrationService,
		traceService,
		hub,
		authSvc,
		cfg.AnthropicAPIKey,
	)

	// Start NEXUS background scheduler
	nexusCtx, nexusCancel := context.WithCancel(context.Background())
	defer nexusCancel()
	nexus := services.NewNEXUSScheduler(
		services.NewBehavioralFingerprintService(db, logger),
		services.NewAnomalyDetectionService(db, logger, hub),
		services.NewCausalGraphService(db, logger, hub),
		services.NewPredictiveHealthService(db, logger, hub),
		services.NewTopologyService(db, logger),
		services.NewHealthService(db, logger),
		logger,
	)
	nexus.Start(nexusCtx)

	// Setup router
	router := setupRouter(h, logger, cfg, authSvc)

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	logger.Info("Server started", zap.String("port", cfg.Port))

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}

func setupRouter(h *handlers.Handlers, logger *zap.Logger, cfg *config.Config, authSvc *services.AuthService) *gin.Engine {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.CORS(cfg.CORSOrigins))

	// Health check — public
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "agentops-api",
		})
	})

	// ── Auth routes — public ─────────────────────────────────────────────────
	auth := router.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.POST("/logout", h.Logout)
		auth.POST("/refresh", h.RefreshToken)

		// Protected auth routes
		authProtected := auth.Group("")
		authProtected.Use(middleware.RequireAuth(authSvc))
		{
			authProtected.GET("/me", h.Me)
			authProtected.PATCH("/me", h.UpdateMe)
			authProtected.GET("/check-access", h.CheckAccess)
			authProtected.GET("/users", middleware.RequireRole("users", "read"), h.ListUsers)
			authProtected.POST("/users", middleware.RequireRole("users", "read"), h.RegisterUser)
		}
	}

	// ── API routes — all protected by JWT + auto audit logging ──────────────
	v1 := router.Group("/api/v1")
	v1.Use(middleware.RequireAuth(authSvc))
	v1.Use(middleware.AuditLogger(h.AuditService()))
	{
		// Traces
		v1.GET("/traces", h.GetTraces)
		v1.GET("/traces/:id", h.GetTrace)
		v1.POST("/traces", middleware.RequireRole("traces", "write"), h.CreateTrace)

		// Incidents
		v1.GET("/incidents", h.GetIncidents)
		v1.GET("/incidents/:id", h.GetIncident)
		v1.POST("/incidents", middleware.RequireRole("incidents", "write"), h.CreateIncident)
		v1.POST("/incidents/:id/resolve", middleware.RequireRole("incidents", "resolve"), h.ResolveIncident)

		// Agents
		v1.GET("/agents", h.GetAgents)
		v1.GET("/agents/:id", h.GetAgent)
		v1.POST("/agents", middleware.RequireRole("agents", "write"), h.CreateAgent)
		v1.PUT("/agents/:id", middleware.RequireRole("agents", "write"), h.UpdateAgent)
		v1.DELETE("/agents/:id", middleware.RequireRole("agents", "delete"), h.DeleteAgent)

		// Orchestration
		v1.GET("/orchestration/deployments", h.GetDeployments)
		v1.POST("/orchestration/deploy", middleware.RequireRole("deployments", "write"), h.DeployAgent)
		v1.POST("/orchestration/scale", middleware.RequireRole("deployments", "write"), h.ScaleAgent)
		v1.POST("/orchestration/circuit-breaker", middleware.RequireRole("deployments", "write"), h.SetCircuitBreaker)

		// Stats & SSE
		v1.GET("/stats", h.GetStats)
		v1.GET("/events", h.StreamEvents)

		// Agent Memory
		v1.GET("/agents/:id/memory", h.GetAgentMemory)
		v1.POST("/agents/:id/memory", middleware.RequireRole("agents", "write"), h.SetMemory)
		v1.DELETE("/agents/:id/memory/:key", middleware.RequireRole("agents", "write"), h.DeleteMemory)
		v1.GET("/memory/shared", h.GetSharedMemory)

		// Model Router
		v1.POST("/router/route", middleware.RequireRole("traces", "write"), h.RouteModel)
		v1.GET("/router/stats", h.GetRouterStats)

		// Agent Health
		v1.GET("/agents/:id/health", h.GetAgentHealth)
		v1.GET("/health/fleet", h.GetFleetHealth)

		// Webhooks
		v1.GET("/webhooks", h.ListWebhooks)
		v1.POST("/webhooks", middleware.RequireRole("agents", "write"), h.CreateWebhook)
		v1.DELETE("/webhooks/:id", middleware.RequireRole("agents", "write"), h.DeleteWebhook)
		v1.POST("/webhooks/:id/test", middleware.RequireRole("agents", "write"), h.TestWebhook)

		// Cost Budgets
		v1.GET("/agents/:id/budget", h.GetBudget)
		v1.POST("/agents/:id/budget", middleware.RequireRole("agents", "write"), h.SetBudget)
		v1.GET("/budgets", h.GetAllBudgets)

		// API Keys
		v1.GET("/api-keys", middleware.RequireRole("agents", "read"), h.ListAPIKeys)
		v1.POST("/api-keys", middleware.RequireRole("agents", "write"), h.CreateAPIKey)
		v1.DELETE("/api-keys/:id", middleware.RequireRole("agents", "write"), h.RevokeAPIKey)

		// Deployments
		v1.GET("/deployments", h.ListDeployments)
		v1.POST("/deployments", middleware.RequireRole("deployments", "write"), h.CreateDeployment)
		v1.GET("/deployments/:id", h.GetDeployment)
		v1.PATCH("/deployments/:id", middleware.RequireRole("deployments", "write"), h.UpdateDeployment)
		v1.DELETE("/deployments/:id", middleware.RequireRole("deployments", "delete"), h.DeleteDeployment)

		// Intelligence
		v1.GET("/intelligence/router/logs", h.ListRouterLogs)

		// NEXUS: Behavioral Fingerprints
		v1.GET("/nexus/fingerprints", h.GetFleetFingerprints)
		v1.GET("/nexus/fingerprints/:agentID", h.GetFingerprint)
		v1.GET("/nexus/fingerprints/:agentID/history", h.GetFingerprintHistory)

		// NEXUS: Anomaly Detection
		v1.GET("/nexus/anomalies", h.GetAnomalyFeed)
		v1.POST("/nexus/anomalies/:id/acknowledge", middleware.RequireRole("nexus", "write"), h.AcknowledgeAnomaly)
		v1.POST("/nexus/anomalies/scan", middleware.RequireRole("nexus", "write"), h.TriggerAnomalyScan)

		// NEXUS: Causal Graph
		v1.GET("/nexus/causal/graphs", h.ListCausalGraphs)
		v1.GET("/nexus/causal/graphs/:graphID", h.GetCausalGraph)
		v1.GET("/nexus/causal/incidents/:incidentID/graph", h.GetIncidentCausalGraph)
		v1.POST("/nexus/causal/rebuild", middleware.RequireRole("nexus", "write"), h.RebuildCausalGraph)

		// NEXUS: Predictive Health
		v1.GET("/nexus/predictions", h.GetAllPredictions)
		v1.GET("/nexus/predictions/:agentID", h.GetAgentPredictions)
		v1.GET("/nexus/predictions/:agentID/history", h.GetAgentHealthHistory)

		// NEXUS: Topology
		v1.GET("/nexus/topology", h.GetTopologyGraph)
		v1.POST("/nexus/topology/rebuild", middleware.RequireRole("nexus", "write"), h.RebuildTopology)

		// NEXUS: Summary
		v1.GET("/nexus/summary", h.GetNEXUSSummary)

		// Audit log
		v1.GET("/audit", middleware.RequireRole("audit", "read"), h.ListAuditEntries)

		// SLO / Error Budget Engine
		v1.GET("/slo", h.ListSLOs)
		v1.GET("/slo/status", h.GetSLOStatuses)
		v1.POST("/slo", middleware.RequireRole("agents", "write"), h.CreateSLO)
		v1.DELETE("/slo/:id", middleware.RequireRole("agents", "write"), h.DeleteSLO)
		v1.GET("/slo/:id/history", h.GetSLOHistory)

		// Collaborative War Room
		v1.POST("/warroom/:incidentID", h.OpenWarRoom)
		v1.GET("/warroom/:incidentID/ws", h.WarRoomWS)
		v1.POST("/warroom/:incidentID/messages", h.PostWarRoomMessage)
		v1.POST("/warroom/:incidentID/tasks", h.CreateWarRoomTask)
		v1.PATCH("/warroom/:incidentID/tasks/:taskID/toggle", h.ToggleWarRoomTask)

		// Blast Radius Simulator
		v1.POST("/blast-radius/simulate", h.RunBlastRadius)
		v1.GET("/blast-radius/simulations", h.ListBlastRadiusSimulations)
		v1.GET("/blast-radius/simulations/:id", h.GetBlastRadiusSimulation)

		// Time-Travel Debugger
		v1.GET("/timetravel/timelines", h.ListTimelines)
		v1.GET("/timetravel/timelines/:traceID", h.GetTimeline)
		v1.GET("/timetravel/compare", h.CompareTimelines)
		v1.POST("/timetravel/fork", h.CreateTimelineFork)

		// Search
		v1.GET("/search", h.Search)

		// NLQ
		v1.POST("/nlq/query", h.NLQQuery)
		v1.GET("/nlq/history", h.NLQHistory)

		// Genome Drift
		v1.GET("/genome/fleet", h.GetFleetGenomeDrift)
		v1.GET("/genome/:agentID", h.GetAgentGenome)
		v1.POST("/genome/:agentID/compute", middleware.RequireRole("nexus", "write"), h.ComputeAgentGenome)

		// Chaos Engineering
		v1.GET("/chaos/experiments", h.ListChaosExperiments)
		v1.POST("/chaos/experiments", middleware.RequireRole("agents", "write"), h.CreateChaosExperiment)
		v1.GET("/chaos/experiments/:id", h.GetChaosExperiment)

		// Flame Graph
		v1.GET("/flame", h.ListFlameTraces)
		v1.GET("/flame/:traceID", h.GetFlameGraph)

		// Cost Allocation
		v1.GET("/cost/breakdown", h.GetCostBreakdown)
		v1.GET("/cost/daily", h.GetDailyCost)

		// Alert Correlation
		v1.GET("/alerts/clusters", h.GetAlertClusters)
		v1.POST("/alerts/correlate", middleware.RequireRole("nexus", "write"), h.CorrelateAlerts)
		v1.POST("/alerts/clusters/:id/suppress", middleware.RequireRole("nexus", "write"), h.SuppressAlertCluster)
	}

	return router
}
