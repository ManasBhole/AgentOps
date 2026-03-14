package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/agentops/agentops/api/internal/services"
)

// GET /api/v1/alerts/clusters
func (h *Handlers) GetAlertClusters(c *gin.Context) {
	clusters, err := h.alertCorrelationService.ListClusters()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, clusters)
}

// POST /api/v1/alerts/correlate
func (h *Handlers) CorrelateAlerts(c *gin.Context) {
	clusters, err := h.alertCorrelationService.Correlate()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(clusters) > 0 {
		go services.NewWebhookService(h.db, h.logger).Fire("alert.clusters_detected", map[string]interface{}{
			"count":    len(clusters),
			"clusters": clusters,
		})
	}
	c.JSON(http.StatusOK, gin.H{"clusters": clusters, "count": len(clusters)})
}

// POST /api/v1/alerts/clusters/:id/suppress
func (h *Handlers) SuppressAlertCluster(c *gin.Context) {
	if err := h.alertCorrelationService.SuppressCluster(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"suppressed": true})
}
