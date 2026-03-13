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
	)

	// Setup router
	router := setupRouter(h, logger, cfg)

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

func setupRouter(h *handlers.Handlers, logger *zap.Logger, cfg *config.Config) *gin.Engine {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.CORS(cfg.CORSOrigins))

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "agentops-api",
		})
	})

	// API routes
	v1 := router.Group("/api/v1")
	{
		v1.GET("/traces", h.GetTraces)
		v1.GET("/traces/:id", h.GetTrace)
		v1.POST("/traces", h.CreateTrace)

		v1.GET("/incidents", h.GetIncidents)
		v1.GET("/incidents/:id", h.GetIncident)
		v1.POST("/incidents", h.CreateIncident)
		v1.POST("/incidents/:id/resolve", h.ResolveIncident)

		v1.GET("/agents", h.GetAgents)
		v1.GET("/agents/:id", h.GetAgent)
		v1.POST("/agents", h.CreateAgent)
		v1.PUT("/agents/:id", h.UpdateAgent)
		v1.DELETE("/agents/:id", h.DeleteAgent)

		v1.GET("/orchestration/deployments", h.GetDeployments)
		v1.POST("/orchestration/deploy", h.DeployAgent)
		v1.POST("/orchestration/scale", h.ScaleAgent)
		v1.POST("/orchestration/circuit-breaker", h.SetCircuitBreaker)

		v1.GET("/stats", h.GetStats)
		v1.GET("/events", h.StreamEvents)

		// Agent Memory — persistent cross-run learning
		v1.GET("/agents/:id/memory", h.GetAgentMemory)
		v1.POST("/agents/:id/memory", h.SetMemory)
		v1.DELETE("/agents/:id/memory/:key", h.DeleteMemory)
		v1.GET("/memory/shared", h.GetSharedMemory)

		// Model Router — intelligent cost-optimised model selection
		v1.POST("/router/route", h.RouteModel)
		v1.GET("/router/stats", h.GetRouterStats)

		// Agent Health Score
		v1.GET("/agents/:id/health", h.GetAgentHealth)
		v1.GET("/health/fleet", h.GetFleetHealth)

		// Webhooks
		v1.GET("/webhooks", h.ListWebhooks)
		v1.POST("/webhooks", h.CreateWebhook)
		v1.DELETE("/webhooks/:id", h.DeleteWebhook)
		v1.POST("/webhooks/:id/test", h.TestWebhook)

		// Cost Budgets
		v1.GET("/agents/:id/budget", h.GetBudget)
		v1.POST("/agents/:id/budget", h.SetBudget)
		v1.GET("/budgets", h.GetAllBudgets)

		// API Keys
		v1.GET("/api-keys", h.ListAPIKeys)
		v1.POST("/api-keys", h.CreateAPIKey)
		v1.DELETE("/api-keys/:id", h.RevokeAPIKey)

		// Deployments (direct CRUD — separate from orchestration)
		v1.GET("/deployments", h.ListDeployments)
		v1.POST("/deployments", h.CreateDeployment)
		v1.GET("/deployments/:id", h.GetDeployment)
		v1.PATCH("/deployments/:id", h.UpdateDeployment)
		v1.DELETE("/deployments/:id", h.DeleteDeployment)

		// Intelligence — router logs for Analytics page
		v1.GET("/intelligence/router/logs", h.ListRouterLogs)
	}

	return router
}
