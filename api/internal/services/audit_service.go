package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/manasbhole/orion/api/internal/database"
	"gorm.io/gorm"
)

// AuditService writes and queries the audit_entries table.
type AuditService struct {
	db *gorm.DB
}

func NewAuditService(db *gorm.DB) *AuditService {
	return &AuditService{db: db}
}

// LogParams is passed by callers (handler middleware or explicit calls).
type LogParams struct {
	UserID     string
	UserEmail  string
	UserRole   string
	Action     string
	Resource   string
	ResourceID string
	Method     string
	Path       string
	StatusCode int
	IPAddress  string
	UserAgent  string
	Detail     map[string]any
}

// Log writes one audit entry. Errors are silently dropped — audit must
// never break a request.
func (s *AuditService) Log(p LogParams) {
	detail := "{}"
	if p.Detail != nil {
		if b, err := json.Marshal(p.Detail); err == nil {
			detail = string(b)
		}
	}
	entry := database.AuditEntry{
		ID:         fmt.Sprintf("aud_%d", time.Now().UnixNano()),
		UserID:     p.UserID,
		UserEmail:  p.UserEmail,
		UserRole:   p.UserRole,
		Action:     p.Action,
		Resource:   p.Resource,
		ResourceID: p.ResourceID,
		Method:     p.Method,
		Path:       p.Path,
		StatusCode: p.StatusCode,
		IPAddress:  p.IPAddress,
		UserAgent:  p.UserAgent,
		Detail:     detail,
		CreatedAt:  time.Now().UTC(),
	}
	s.db.Create(&entry) // fire-and-forget
}

// ListParams filters for the GET /audit endpoint.
type AuditListParams struct {
	UserID   string
	Resource string
	Action   string
	Limit    int
	Offset   int
}

func (s *AuditService) List(p AuditListParams) ([]database.AuditEntry, int64, error) {
	q := s.db.Model(&database.AuditEntry{})
	if p.UserID != "" {
		q = q.Where("user_id = ?", p.UserID)
	}
	if p.Resource != "" {
		q = q.Where("resource = ?", p.Resource)
	}
	if p.Action != "" {
		q = q.Where("action LIKE ?", "%"+p.Action+"%")
	}

	var total int64
	q.Count(&total)

	limit := p.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	var entries []database.AuditEntry
	err := q.Order("created_at DESC").Limit(limit).Offset(p.Offset).Find(&entries).Error
	return entries, total, err
}

// ActionFromRequest derives a human-readable action from HTTP method + path.
// e.g. POST /api/v1/agents → "agent.create"
func ActionFromRequest(method, path string) (action, resource string) {
	// strip /api/v1/ prefix
	path = strings.TrimPrefix(path, "/api/v1")
	path = strings.TrimPrefix(path, "/api")

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		return method + " " + path, "api"
	}

	resource = parts[0]
	switch method {
	case "GET":
		if len(parts) > 1 {
			action = resource + ".read"
		} else {
			action = resource + ".list"
		}
	case "POST":
		// check sub-actions like /agents/{id}/memory
		if len(parts) >= 3 {
			action = resource + "." + parts[2]
		} else {
			action = resource + ".create"
		}
	case "PATCH", "PUT":
		action = resource + ".update"
	case "DELETE":
		action = resource + ".delete"
	default:
		action = method + "." + resource
	}
	return action, resource
}
