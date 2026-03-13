package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/agentops/agentops/api/internal/database"
)

type WebhookService struct {
	db     *gorm.DB
	logger *zap.Logger
	client *http.Client
}

func NewWebhookService(db *gorm.DB, logger *zap.Logger) *WebhookService {
	return &WebhookService{
		db:     db,
		logger: logger,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Create stores a new webhook.
func (s *WebhookService) Create(name, url string, events []string) (*database.Webhook, error) {
	eventsJSON, _ := json.Marshal(events)
	secret := generateSecret()
	wh := database.Webhook{
		ID:        uuid.New().String(),
		Name:      name,
		URL:       url,
		Events:    string(eventsJSON),
		Secret:    secret,
		Active:    true,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	if err := s.db.Create(&wh).Error; err != nil {
		return nil, err
	}
	// Return secret only on creation
	wh.Secret = secret
	return &wh, nil
}

// List returns all webhooks (secret field stripped).
func (s *WebhookService) List() ([]database.Webhook, error) {
	var hooks []database.Webhook
	err := s.db.Order("created_at DESC").Find(&hooks).Error
	return hooks, err
}

// Delete removes a webhook.
func (s *WebhookService) Delete(id string) error {
	return s.db.Delete(&database.Webhook{}, "id = ?", id).Error
}

// Toggle enables/disables a webhook.
func (s *WebhookService) Toggle(id string, active bool) error {
	return s.db.Model(&database.Webhook{}).Where("id = ?", id).
		Update("active", active).Error
}

// Fire delivers an event payload to all matching active webhooks (async).
func (s *WebhookService) Fire(eventType string, payload interface{}) {
	var hooks []database.Webhook
	s.db.Where("active = ?", true).Find(&hooks)

	body, err := json.Marshal(map[string]interface{}{
		"event":     eventType,
		"timestamp": time.Now().UTC(),
		"payload":   payload,
	})
	if err != nil {
		return
	}

	for _, hook := range hooks {
		// Check if this hook listens to this event type
		var events []string
		if err := json.Unmarshal([]byte(hook.Events), &events); err != nil {
			continue
		}
		if !containsEvent(events, eventType) {
			continue
		}
		go s.deliver(hook, body)
	}
}

// Test sends a test ping to a specific webhook and returns the status.
func (s *WebhookService) Test(id string) (int, string, error) {
	var hook database.Webhook
	if err := s.db.First(&hook, "id = ?", id).Error; err != nil {
		return 0, "", err
	}
	body, _ := json.Marshal(map[string]interface{}{
		"event":     "webhook.test",
		"timestamp": time.Now().UTC(),
		"payload":   map[string]string{"message": "Test ping from AgentOps"},
	})
	status, msg := s.doRequest(hook, body)
	return status, msg, nil
}

// ── Internal ─────────────────────────────────────────────────────────────────

func (s *WebhookService) deliver(hook database.Webhook, body []byte) {
	status, _ := s.doRequest(hook, body)
	now := time.Now().UTC()
	s.db.Model(&database.Webhook{}).Where("id = ?", hook.ID).
		Updates(map[string]interface{}{"last_fired": now})
	if status >= 400 {
		s.logger.Warn("webhook delivery failed",
			zap.String("webhook_id", hook.ID),
			zap.String("url", hook.URL),
			zap.Int("status", status),
		)
	}
}

func (s *WebhookService) doRequest(hook database.Webhook, body []byte) (int, string) {
	req, err := http.NewRequest(http.MethodPost, hook.URL, bytes.NewReader(body))
	if err != nil {
		return 0, err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "AgentOps-Webhook/1.0")
	req.Header.Set("X-AgentOps-Event", "webhook")
	// HMAC signature so receiver can verify authenticity
	if hook.Secret != "" {
		sig := computeHMAC(body, hook.Secret)
		req.Header.Set("X-AgentOps-Signature", "sha256="+sig)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	return resp.StatusCode, fmt.Sprintf("%d %s", resp.StatusCode, resp.Status)
}

func computeHMAC(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func generateSecret() string {
	b := make([]byte, 20)
	for i := range b {
		b[i] = byte(uuid.New().ID() % 256)
	}
	return hex.EncodeToString(b)
}

func containsEvent(events []string, target string) bool {
	for _, e := range events {
		if e == target || e == "*" {
			return true
		}
	}
	return false
}
