package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/manasbhole/orion/api/internal/database"
)

// IngestPayload is the SDK event format sent by agent instrumentation libraries.
type IngestPayload struct {
	AgentID    string            `json:"agent_id" binding:"required"`
	RunID      string            `json:"run_id"`
	Name       string            `json:"name" binding:"required"`
	Status     string            `json:"status"` // ok | error
	DurationMS int64             `json:"duration_ms"`
	Attributes map[string]any    `json:"attributes"`
	Events     []map[string]any  `json:"events"`
	Error      string            `json:"error"`
}

// IngestEvent accepts a single SDK event and persists it as a Trace.
// POST /api/v1/ingest
func (h *Handlers) IngestEvent(c *gin.Context) {
	var p IngestPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if p.Status == "" {
		p.Status = "ok"
	}
	if p.RunID == "" {
		p.RunID = "run_" + uuid.NewString()[:8]
	}

	attrs := toJSONString(p.Attributes)
	events := toJSONString(p.Events)

	now := time.Now().UTC()
	end := now
	trace := database.Trace{
		ID:         "tr_" + uuid.NewString()[:16],
		AgentID:    p.AgentID,
		RunID:      p.RunID,
		TraceID:    "trace_" + uuid.NewString()[:12],
		SpanID:     "span_" + uuid.NewString()[:8],
		Name:       p.Name,
		StartTime:  now.Add(-time.Duration(p.DurationMS) * time.Millisecond),
		EndTime:    &end,
		Duration:   p.DurationMS,
		Status:     p.Status,
		Attributes: attrs,
		Events:     events,
		CreatedAt:  now,
	}

	if err := h.db.Create(&trace).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save trace"})
		return
	}

	// Run incident detection on error traces
	if p.Status == "error" {
		go h.incidentEngine.AnalyzeTrace(c.Request.Context(), trace.ID) //nolint:errcheck
	}

	c.JSON(http.StatusCreated, gin.H{
		"trace_id": trace.ID,
		"run_id":   trace.RunID,
		"status":   "ingested",
	})
}

// IngestBatch accepts up to 100 SDK events in a single request.
// POST /api/v1/ingest/batch
func (h *Handlers) IngestBatch(c *gin.Context) {
	var payloads []IngestPayload
	if err := c.ShouldBindJSON(&payloads); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(payloads) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max 100 events per batch"})
		return
	}

	now := time.Now().UTC()
	traces := make([]database.Trace, 0, len(payloads))
	for _, p := range payloads {
		if p.Status == "" {
			p.Status = "ok"
		}
		if p.RunID == "" {
			p.RunID = "run_" + uuid.NewString()[:8]
		}
		end := now
		traces = append(traces, database.Trace{
			ID:         "tr_" + uuid.NewString()[:16],
			AgentID:    p.AgentID,
			RunID:      p.RunID,
			TraceID:    "trace_" + uuid.NewString()[:12],
			SpanID:     "span_" + uuid.NewString()[:8],
			Name:       p.Name,
			StartTime:  now.Add(-time.Duration(p.DurationMS) * time.Millisecond),
			EndTime:    &end,
			Duration:   p.DurationMS,
			Status:     p.Status,
			Attributes: toJSONString(p.Attributes),
			Events:     toJSONString(p.Events),
			CreatedAt:  now,
		})
	}

	if err := h.db.CreateInBatches(&traces, 50).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save traces"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ingested": len(traces)})
}
