package services

import (
	"context"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/manasbhole/orion/api/internal/database"
)

type TraceService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewTraceService(db *gorm.DB, logger *zap.Logger) *TraceService {
	return &TraceService{
		db:     db,
		logger: logger,
	}
}

// StoreTrace stores a trace from OpenTelemetry
func (ts *TraceService) StoreTrace(ctx context.Context, trace *database.Trace) error {
	return ts.db.Create(trace).Error
}

// ListTraces retrieves recent traces, optionally filtered by agent ID
func (ts *TraceService) ListTraces(ctx context.Context, agentID string, limit int) ([]database.Trace, error) {
	if limit <= 0 {
		limit = 50
	}

	var traces []database.Trace

	query := ts.db.WithContext(ctx).Order("start_time DESC").Limit(limit)
	if agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	if err := query.Find(&traces).Error; err != nil {
		return nil, err
	}

	return traces, nil
}

// GetTrace retrieves a trace by ID
func (ts *TraceService) GetTrace(ctx context.Context, traceID string) (*database.Trace, error) {
	var trace database.Trace
	if err := ts.db.Where("trace_id = ?", traceID).First(&trace).Error; err != nil {
		return nil, err
	}
	return &trace, nil
}

// GetTracesByAgent retrieves traces for an agent
func (ts *TraceService) GetTracesByAgent(ctx context.Context, agentID string, limit int) ([]database.Trace, error) {
	var traces []database.Trace
	if err := ts.db.Where("agent_id = ?", agentID).
		Order("start_time DESC").
		Limit(limit).
		Find(&traces).Error; err != nil {
		return nil, err
	}
	return traces, nil
}
