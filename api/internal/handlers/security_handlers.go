package handlers

import (
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/agentops/agentops/api/internal/database"
)

// ── Threat patterns ──────────────────────────────────────────────────────────

type threatPattern struct {
	Name      string
	EventType string
	Severity  string
	Regex     *regexp.Regexp
	Fix       string
}

var threatPatterns = []threatPattern{
	{
		Name:      "Ignore previous instructions",
		EventType: "prompt_injection", Severity: "critical",
		Regex: regexp.MustCompile(`(?i)(ignore|disregard|forget|override)\s+(previous|prior|above|all)\s+(instructions?|prompts?|context|rules?)`),
		Fix:   "Block request and alert operator. Validate input before passing to agent.",
	},
	{
		Name:      "System prompt exfiltration",
		EventType: "prompt_injection", Severity: "critical",
		Regex: regexp.MustCompile(`(?i)(repeat|print|show|reveal|output|tell me|what (is|are|was))\s+(your\s+)?(system\s+prompt|instructions|context|configuration|rules)`),
		Fix:   "Reject request. Ensure system prompt is not exposed to users.",
	},
	{
		Name:      "Role-play jailbreak",
		EventType: "jailbreak", Severity: "high",
		Regex: regexp.MustCompile(`(?i)(pretend|act|behave|you are now|imagine you are|roleplay as|play the role)\s+(you are|as|like)?\s*(an?\s+)?(evil|malicious|unrestricted|uncensored|DAN|jailbreak)`),
		Fix:   "Block request. Add guardrails to prevent persona hijacking.",
	},
	{
		Name:      "DAN / jailbreak prompt",
		EventType: "jailbreak", Severity: "high",
		Regex: regexp.MustCompile(`(?i)(DAN|do anything now|jailbreak|no restrictions|without limitations|bypass (safety|filter|restriction))`),
		Fix:   "Block request. Review agent system prompt for jailbreak resistance.",
	},
	{
		Name:      "PII — Social Security Number",
		EventType: "pii_detected", Severity: "high",
		Regex: regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`),
		Fix:   "Redact SSN before logging. Review data pipeline for PII handling.",
	},
	{
		Name:      "PII — Credit Card",
		EventType: "pii_detected", Severity: "high",
		Regex: regexp.MustCompile(`\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b`),
		Fix:   "Redact card number. Ensure PCI-DSS compliance in data storage.",
	},
	{
		Name:      "PII — Email Address",
		EventType: "pii_detected", Severity: "medium",
		Regex: regexp.MustCompile(`\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b`),
		Fix:   "Consider masking emails in logs. Review data retention policy.",
	},
	{
		Name:      "PII — Phone Number",
		EventType: "pii_detected", Severity: "medium",
		Regex: regexp.MustCompile(`\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b`),
		Fix:   "Mask phone numbers in agent I/O and logs.",
	},
	{
		Name:      "Code injection attempt",
		EventType: "policy_violation", Severity: "medium",
		Regex: regexp.MustCompile(`(?i)(exec\s*\(|eval\s*\(|system\s*\(|__import__|subprocess|os\.system|shell_exec)`),
		Fix:   "Sanitize code inputs. Do not pass untrusted content to code interpreters.",
	},
	{
		Name:      "Harmful content request",
		EventType: "policy_violation", Severity: "critical",
		Regex: regexp.MustCompile(`(?i)(how to (make|build|create|synthesize)\s+(bomb|weapon|malware|virus|poison|drug))`),
		Fix:   "Block request. Log and alert security team immediately.",
	},
}

func redact(input string) string {
	for _, p := range threatPatterns {
		input = p.Regex.ReplaceAllString(input, "[REDACTED]")
	}
	if len(input) > 200 {
		return input[:200] + "…"
	}
	return input
}

// POST /api/v1/security/scan
func (h *Handlers) SecurityScan(c *gin.Context) {
	var req struct {
		AgentID   string `json:"agent_id"`
		TraceID   string `json:"trace_id"`
		Input     string `json:"input" binding:"required"`
		Direction string `json:"direction"` // "input" | "output"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Direction == "" {
		req.Direction = "input"
	}

	var events []database.SecurityEvent
	for _, p := range threatPatterns {
		if p.Regex.MatchString(req.Input) {
			ev := database.SecurityEvent{
				ID:             "sec_" + uuid.New().String()[:8],
				AgentID:        req.AgentID,
				TraceID:        req.TraceID,
				EventType:      p.EventType,
				Severity:       p.Severity,
				Direction:      req.Direction,
				PatternMatched: p.Name,
				InputPreview:   redact(req.Input),
				Remediation:    p.Fix,
				CreatedAt:      time.Now().UTC(),
			}
			h.db.Create(&ev)
			events = append(events, ev)
		}
	}

	safe := len(events) == 0
	c.JSON(http.StatusOK, gin.H{
		"safe":   safe,
		"events": events,
		"total":  len(events),
	})
}

// GET /api/v1/security/events
func (h *Handlers) ListSecurityEvents(c *gin.Context) {
	agentID := c.Query("agent_id")
	eventType := c.Query("type")
	severity := c.Query("severity")
	resolved := c.Query("resolved")
	limit := 100

	q := h.db.Order("created_at DESC").Limit(limit)
	if agentID != "" {
		q = q.Where("agent_id = ?", agentID)
	}
	if eventType != "" {
		q = q.Where("event_type = ?", eventType)
	}
	if severity != "" {
		q = q.Where("severity = ?", severity)
	}
	if resolved == "true" {
		q = q.Where("resolved = true")
	} else if resolved == "false" {
		q = q.Where("resolved = false")
	}

	var events []database.SecurityEvent
	q.Find(&events)
	if events == nil {
		events = []database.SecurityEvent{}
	}

	// Stats
	var totalOpen, critical, high int64
	h.db.Model(&database.SecurityEvent{}).Where("resolved = false").Count(&totalOpen)
	h.db.Model(&database.SecurityEvent{}).Where("resolved = false AND severity = 'critical'").Count(&critical)
	h.db.Model(&database.SecurityEvent{}).Where("resolved = false AND severity = 'high'").Count(&high)

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  len(events),
		"stats":  gin.H{"open": totalOpen, "critical": critical, "high": high},
	})
}

// POST /api/v1/security/events/:id/resolve
func (h *Handlers) ResolveSecurityEvent(c *gin.Context) {
	now := time.Now().UTC()
	email := c.GetString("user_email")
	if err := h.db.Model(&database.SecurityEvent{}).Where("id = ?", c.Param("id")).Updates(map[string]any{
		"resolved": true, "resolved_by": email, "resolved_at": now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"resolved": c.Param("id")})
}

// GET /api/v1/security/stats
func (h *Handlers) GetSecurityStats(c *gin.Context) {
	type typeCount struct {
		EventType string `json:"event_type"`
		Count     int64  `json:"count"`
	}
	var bySeverity []typeCount
	h.db.Model(&database.SecurityEvent{}).Select("severity as event_type, count(*) as count").
		Group("severity").Scan(&bySeverity)

	var byType []typeCount
	h.db.Model(&database.SecurityEvent{}).Select("event_type, count(*) as count").
		Group("event_type").Scan(&byType)

	var recent []database.SecurityEvent
	h.db.Order("created_at DESC").Limit(5).Find(&recent)

	var totalOpen, totalResolved int64
	h.db.Model(&database.SecurityEvent{}).Where("resolved = false").Count(&totalOpen)
	h.db.Model(&database.SecurityEvent{}).Where("resolved = true").Count(&totalResolved)

	c.JSON(http.StatusOK, gin.H{
		"by_severity": bySeverity,
		"by_type":     byType,
		"recent":      recent,
		"open":        totalOpen,
		"resolved":    totalResolved,
	})
}
