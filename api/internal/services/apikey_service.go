package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

type APIKeyService struct {
	db     *gorm.DB
	logger *zap.Logger
}

// CreatedKey includes the raw key returned once on creation.
type CreatedKey struct {
	database.APIKey
	RawKey string `json:"key"` // only returned at creation, never stored
}

func NewAPIKeyService(db *gorm.DB, logger *zap.Logger) *APIKeyService {
	return &APIKeyService{db: db, logger: logger}
}

// Create generates a new API key, stores its hash, returns the raw key once.
func (s *APIKeyService) Create(name string) (*CreatedKey, error) {
	raw, err := generateRawKey()
	if err != nil {
		return nil, err
	}
	hash := hashKey(raw)
	prefix := raw[:12] // "ao_" + 9 chars shown in UI

	key := database.APIKey{
		ID:        uuid.New().String(),
		Name:      name,
		KeyHash:   hash,
		KeyPrefix: prefix,
		Active:    true,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.db.Create(&key).Error; err != nil {
		return nil, err
	}
	return &CreatedKey{APIKey: key, RawKey: raw}, nil
}

// List returns all API keys (hash never included).
func (s *APIKeyService) List() ([]database.APIKey, error) {
	var keys []database.APIKey
	err := s.db.Order("created_at DESC").Find(&keys).Error
	return keys, err
}

// Revoke deactivates an API key.
func (s *APIKeyService) Revoke(id string) error {
	return s.db.Model(&database.APIKey{}).Where("id = ?", id).
		Update("active", false).Error
}

// Validate checks an incoming key, updates last_used, returns true if valid.
func (s *APIKeyService) Validate(raw string) bool {
	if raw == "" {
		return false
	}
	hash := hashKey(raw)
	var key database.APIKey
	if err := s.db.Where("key_hash = ? AND active = ?", hash, true).First(&key).Error; err != nil {
		return false
	}
	now := time.Now().UTC()
	s.db.Model(&key).Update("last_used_at", now)
	return true
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func generateRawKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate key: %w", err)
	}
	return "ao_" + hex.EncodeToString(b), nil
}

func hashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
