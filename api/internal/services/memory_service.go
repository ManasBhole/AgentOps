package services

import (
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/manasbhole/orion/api/internal/database"
)

// MemoryService manages persistent agent memory (private + shared).
type MemoryService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewMemoryService(db *gorm.DB, logger *zap.Logger) *MemoryService {
	return &MemoryService{db: db, logger: logger}
}

// Set upserts a memory entry for an agent (scope="agent") or globally (scope="shared").
func (s *MemoryService) Set(agentID, scope, key, value, runID string, ttl *time.Time) (*database.AgentMemory, error) {
	mem := database.AgentMemory{
		ID:        uuid.New().String(),
		AgentID:   agentID,
		Scope:     scope,
		Key:       key,
		Value:     value,
		RunID:     runID,
		TTL:       ttl,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	// Upsert: if (agent_id, scope, key) already exists, update value + run_id + updated_at
	result := s.db.Where(database.AgentMemory{AgentID: agentID, Scope: scope, Key: key}).
		Assign(database.AgentMemory{Value: value, RunID: runID, TTL: ttl, UpdatedAt: time.Now().UTC()}).
		FirstOrCreate(&mem)

	return &mem, result.Error
}

// GetAgentMemory returns all non-expired memories for a specific agent.
func (s *MemoryService) GetAgentMemory(agentID string) ([]database.AgentMemory, error) {
	var mems []database.AgentMemory
	err := s.db.Where("agent_id = ? AND scope = ? AND (ttl IS NULL OR ttl > ?)", agentID, "agent", time.Now()).
		Order("updated_at DESC").
		Find(&mems).Error
	return mems, err
}

// GetSharedMemory returns all non-expired shared memories (readable by all agents).
func (s *MemoryService) GetSharedMemory() ([]database.AgentMemory, error) {
	var mems []database.AgentMemory
	err := s.db.Where("scope = ? AND (ttl IS NULL OR ttl > ?)", "shared", time.Now()).
		Order("updated_at DESC").
		Find(&mems).Error
	return mems, err
}

// GetKey returns a single memory entry by key.
func (s *MemoryService) GetKey(agentID, scope, key string) (*database.AgentMemory, error) {
	var mem database.AgentMemory
	err := s.db.Where("agent_id = ? AND scope = ? AND key = ? AND (ttl IS NULL OR ttl > ?)",
		agentID, scope, key, time.Now()).First(&mem).Error
	if err != nil {
		return nil, err
	}
	return &mem, nil
}

// Delete removes a specific memory key.
func (s *MemoryService) Delete(agentID, scope, key string) error {
	return s.db.Where("agent_id = ? AND scope = ? AND key = ?", agentID, scope, key).
		Delete(&database.AgentMemory{}).Error
}

// PurgeExpired removes all TTL-expired memories (run periodically).
func (s *MemoryService) PurgeExpired() (int64, error) {
	result := s.db.Where("ttl IS NOT NULL AND ttl < ?", time.Now()).
		Delete(&database.AgentMemory{})
	return result.RowsAffected, result.Error
}

// BulkSetFromRun stores a map of key→value memories from a completed run.
func (s *MemoryService) BulkSetFromRun(agentID, runID, scope string, memories map[string]string) error {
	now := time.Now().UTC()
	for key, value := range memories {
		mem := database.AgentMemory{
			AgentID:   agentID,
			Scope:     scope,
			Key:       key,
			Value:     value,
			RunID:     runID,
			UpdatedAt: now,
		}
		if err := s.db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "agent_id"}, {Name: "scope"}, {Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"value", "run_id", "updated_at"}),
		}).Create(&mem).Error; err != nil {
			s.logger.Warn("failed to write memory", zap.String("key", key), zap.Error(err))
		}
	}
	return nil
}
