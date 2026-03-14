package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/agentops/agentops/api/internal/services"
)

// GET /api/v1/audit
func (h *Handlers) ListAuditEntries(c *gin.Context) {
	p := services.AuditListParams{
		UserID:   c.Query("user_id"),
		Resource: c.Query("resource"),
		Action:   c.Query("action"),
		Limit:    100,
	}
	if v, err := strconv.Atoi(c.Query("limit")); err == nil {
		p.Limit = v
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil {
		p.Offset = v
	}

	entries, total, err := h.auditService.List(p)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"entries": entries, "total": total})
}
