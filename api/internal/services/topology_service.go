package services

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/agentops/agentops/api/internal/database"
)

// TopologyGraph is the response DTO for the force-directed graph renderer.
type TopologyGraph struct {
	Nodes     []TopologyNode `json:"nodes"`
	Edges     []TopologyEdge `json:"edges"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type TopologyNode struct {
	AgentID       string  `json:"agent_id"`
	Name          string  `json:"name"`
	Status        string  `json:"status"`
	HealthScore   int     `json:"health_score"`
	RequestVolume int64   `json:"request_volume"`
	ErrorRate     float64 `json:"error_rate"`
}

type TopologyEdge struct {
	Source    string `json:"source"`
	Target    string `json:"target"`
	EdgeCount int64  `json:"edge_count"`
}

type TopologyService struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewTopologyService(db *gorm.DB, logger *zap.Logger) *TopologyService {
	return &TopologyService{db: db, logger: logger}
}

// RebuildTopology derives agent→agent call relationships from trace parent_id chains.
// Runs every 30 seconds via the scheduler.
func (s *TopologyService) RebuildTopology(ctx context.Context) error {
	now := time.Now().UTC()
	windowStart := now.Add(-1 * time.Hour)

	type edgeRow struct {
		ParentAgentID string `gorm:"column:parent_agent_id"`
		ChildAgentID  string `gorm:"column:child_agent_id"`
		EdgeCount     int64  `gorm:"column:edge_count"`
	}

	var rows []edgeRow
	err := s.db.WithContext(ctx).Raw(`
		SELECT
			p.agent_id AS parent_agent_id,
			c.agent_id AS child_agent_id,
			COUNT(*) AS edge_count
		FROM traces c
		JOIN traces p ON p.trace_id = c.parent_id
		WHERE c.start_time >= ?
		  AND c.parent_id != ''
		  AND p.agent_id != c.agent_id
		GROUP BY p.agent_id, c.agent_id
	`, windowStart).Scan(&rows).Error

	if err != nil {
		s.logger.Warn("topology rebuild failed (raw query)", zap.Error(err))
		// Fallback: build from trace agent_id co-occurrence in same run_id
		return s.fallbackRebuild(ctx, windowStart, now)
	}

	for _, row := range rows {
		id := fmt.Sprintf("te_%s_%s_%d",
			safeSlice(row.ParentAgentID, 8),
			safeSlice(row.ChildAgentID, 8),
			windowStart.Unix(),
		)
		edge := database.TopologyEdge{
			ID:            id,
			ParentAgentID: row.ParentAgentID,
			ChildAgentID:  row.ChildAgentID,
			EdgeCount:     row.EdgeCount,
			LastSeenAt:    now,
			WindowStart:   windowStart,
		}
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{"edge_count", "last_seen_at"}),
		}).Create(&edge)
	}
	return nil
}

// fallbackRebuild builds topology by co-occurrence in the same run_id when
// parent_id-based joins fail (e.g., spans emitted by different SDK versions).
func (s *TopologyService) fallbackRebuild(ctx context.Context, windowStart, now time.Time) error {
	type runAgent struct {
		RunID   string `gorm:"column:run_id"`
		AgentID string `gorm:"column:agent_id"`
	}
	var pairs []runAgent
	s.db.WithContext(ctx).Raw(`
		SELECT DISTINCT run_id, agent_id
		FROM traces
		WHERE start_time >= ? AND run_id != ''
	`, windowStart).Scan(&pairs)

	// Group by run_id
	runMap := map[string][]string{}
	for _, p := range pairs {
		runMap[p.RunID] = append(runMap[p.RunID], p.AgentID)
	}

	for runID, agents := range runMap {
		if len(agents) < 2 {
			continue
		}
		_ = runID
		// Create edges for every ordered pair in the run
		for i := 0; i < len(agents); i++ {
			for j := i + 1; j < len(agents); j++ {
				id := fmt.Sprintf("te_%s_%s_%d",
					safeSlice(agents[i], 8),
					safeSlice(agents[j], 8),
					windowStart.Unix(),
				)
				edge := database.TopologyEdge{
					ID:            id,
					ParentAgentID: agents[i],
					ChildAgentID:  agents[j],
					EdgeCount:     1,
					LastSeenAt:    now,
					WindowStart:   windowStart,
				}
				s.db.WithContext(ctx).Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "id"}},
					DoUpdates: clause.AssignmentColumns([]string{"edge_count", "last_seen_at"}),
				}).Create(&edge)
			}
		}
	}
	return nil
}

// GetTopologyGraph returns the current live topology with enriched node metadata.
func (s *TopologyService) GetTopologyGraph(ctx context.Context) (*TopologyGraph, error) {
	now := time.Now().UTC()
	windowStart := now.Add(-1 * time.Hour)

	// Fetch recent topology edges
	var dbEdges []database.TopologyEdge
	s.db.WithContext(ctx).
		Where("window_start >= ?", windowStart.Add(-5*time.Minute)).
		Order("edge_count DESC").
		Find(&dbEdges)

	// Collect unique agent IDs
	agentIDSet := map[string]bool{}
	for _, e := range dbEdges {
		agentIDSet[e.ParentAgentID] = true
		agentIDSet[e.ChildAgentID] = true
	}

	// Also include all active agents as isolated nodes if not in edges
	var allAgents []database.Agent
	s.db.WithContext(ctx).Where("status = ?", "active").Find(&allAgents)
	for _, a := range allAgents {
		agentIDSet[a.ID] = true
	}

	// Build agent lookup
	agentMap := map[string]database.Agent{}
	for _, a := range allAgents {
		agentMap[a.ID] = a
	}

	// Compute request volume per agent (last 1h)
	type volRow struct {
		AgentID string `gorm:"column:agent_id"`
		Count   int64  `gorm:"column:count"`
		Errors  int64  `gorm:"column:errors"`
	}
	var vols []volRow
	s.db.WithContext(ctx).Raw(`
		SELECT agent_id,
			COUNT(*) AS count,
			SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
		FROM traces
		WHERE start_time >= ?
		GROUP BY agent_id
	`, windowStart).Scan(&vols)

	volMap := map[string]volRow{}
	for _, v := range vols {
		volMap[v.AgentID] = v
	}

	// Get latest health scores
	var healthRows []database.HealthScoreHistory
	s.db.WithContext(ctx).Raw(`
		SELECT DISTINCT ON (agent_id) *
		FROM health_score_histories
		ORDER BY agent_id, recorded_at DESC
	`).Scan(&healthRows)
	healthMap := map[string]int{}
	for _, h := range healthRows {
		healthMap[h.AgentID] = h.Score
	}

	// Build nodes
	nodes := make([]TopologyNode, 0, len(agentIDSet))
	for agentID := range agentIDSet {
		agent, hasAgent := agentMap[agentID]
		name := agentID[:min8(agentID)]
		status := "unknown"
		if hasAgent {
			name = agent.Name
			status = agent.Status
		}
		vol := volMap[agentID]
		errorRate := 0.0
		if vol.Count > 0 {
			errorRate = float64(vol.Errors) / float64(vol.Count)
		}
		nodes = append(nodes, TopologyNode{
			AgentID:       agentID,
			Name:          name,
			Status:        status,
			HealthScore:   healthMap[agentID],
			RequestVolume: vol.Count,
			ErrorRate:     errorRate,
		})
	}

	// Build edges
	edges := make([]TopologyEdge, len(dbEdges))
	for i, e := range dbEdges {
		edges[i] = TopologyEdge{
			Source:    e.ParentAgentID,
			Target:    e.ChildAgentID,
			EdgeCount: e.EdgeCount,
		}
	}

	return &TopologyGraph{
		Nodes:     nodes,
		Edges:     edges,
		UpdatedAt: now,
	}, nil
}

func safeSlice(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
