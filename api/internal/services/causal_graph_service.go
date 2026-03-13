package services

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/agentops/agentops/api/internal/database"
)

// CausalGraph is the response DTO for the UI's DAG renderer.
type CausalGraph struct {
	GraphID string              `json:"graph_id"`
	Nodes   []CausalNode        `json:"nodes"`
	Edges   []database.CausalEdge `json:"edges"`
}

// CausalNode annotates an incident for graph rendering.
type CausalNode struct {
	IncidentID string    `json:"incident_id"`
	Title      string    `json:"title"`
	Severity   string    `json:"severity"`
	AgentID    string    `json:"agent_id"`
	CreatedAt  time.Time `json:"created_at"`
	IsCause    bool      `json:"is_cause"`
}

// GraphSummary is a cluster header card shown in the sidebar list.
type GraphSummary struct {
	GraphID     string    `json:"graph_id"`
	NodeCount   int       `json:"node_count"`
	EdgeCount   int       `json:"edge_count"`
	MaxSeverity string    `json:"max_severity"`
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
}

type CausalGraphService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewCausalGraphService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *CausalGraphService {
	return &CausalGraphService{db: db, logger: logger, hub: hub}
}

// BuildCausalGraph scans recent incidents and computes causality edges.
func (s *CausalGraphService) BuildCausalGraph(
	ctx context.Context,
	lookback time.Duration,
	maxLagMs int64,
	minConfidence float64,
) ([]database.CausalEdge, error) {
	now := time.Now().UTC()
	since := now.Add(-lookback)

	var incidents []database.Incident
	if err := s.db.WithContext(ctx).
		Where("created_at > ?", since).
		Order("created_at ASC").
		Find(&incidents).Error; err != nil {
		return nil, err
	}
	if len(incidents) < 2 {
		return nil, nil
	}

	halfLifeMs := float64(60_000) // 1 minute half-life for temporal decay

	var newEdges []database.CausalEdge

	for i := 0; i < len(incidents); i++ {
		for j := i + 1; j < len(incidents); j++ {
			cause := incidents[i]
			effect := incidents[j]

			lagMs := effect.CreatedAt.Sub(cause.CreatedAt).Milliseconds()
			if lagMs < 0 || lagMs > maxLagMs {
				continue
			}

			// Temporal score — exponential decay
			temporalScore := math.Exp(-float64(lagMs) / halfLifeMs)

			// Lineage score
			lineageScore := 0.0
			sharedAgent := ""
			sharedTrace := ""
			sharedRun := ""

			if cause.AgentID == effect.AgentID && cause.AgentID != "" {
				lineageScore += 0.4
				sharedAgent = cause.AgentID
			}
			if cause.TraceID != "" && cause.TraceID == effect.TraceID {
				lineageScore += 0.5
				sharedTrace = cause.TraceID
			} else if cause.TraceID != "" && effect.TraceID != "" {
				// Check trace lineage via parent_id chain (up to 5 hops)
				if s.traceDescendsFrom(ctx, effect.TraceID, cause.TraceID, 5) {
					lineageScore += 0.5
					sharedTrace = cause.TraceID
				}
			}

			// Check shared run_id via traces table
			if sharedRun == "" {
				var causeRun, effectRun string
				s.db.WithContext(ctx).Model(&database.Trace{}).
					Select("run_id").Where("trace_id = ?", cause.TraceID).Scan(&causeRun)
				s.db.WithContext(ctx).Model(&database.Trace{}).
					Select("run_id").Where("trace_id = ?", effect.TraceID).Scan(&effectRun)
				if causeRun != "" && causeRun == effectRun {
					lineageScore += 0.1
					sharedRun = causeRun
				}
			}

			confidence := 0.6*temporalScore + 0.4*lineageScore
			if confidence < minConfidence {
				continue
			}

			method := "temporal"
			if lineageScore > 0.3 && temporalScore > 0.3 {
				method = "combined"
			} else if lineageScore > 0.3 {
				method = "lineage"
			}

			edge := database.CausalEdge{
				ID:                "edge_" + uuid.New().String(),
				CauseID:           cause.ID,
				EffectID:          effect.ID,
				Confidence:        confidence,
				LagMs:             lagMs,
				CorrelationMethod: method,
				SharedAgentID:     sharedAgent,
				SharedTraceID:     sharedTrace,
				SharedRunID:       sharedRun,
				GraphID:           "", // assigned below via connected-components
				CreatedAt:         now,
			}
			newEdges = append(newEdges, edge)
		}
	}

	if len(newEdges) == 0 {
		return nil, nil
	}

	// Assign graph_ids via union-find connected components
	assignGraphIDs(newEdges)

	// Upsert all edges
	for _, edge := range newEdges {
		e := edge
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "cause_id"}, {Name: "effect_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"confidence", "lag_ms", "correlation_method",
				"shared_agent_id", "shared_trace_id", "shared_run_id", "graph_id",
			}),
		}).Create(&e)
	}

	// Fire SSE if any new cluster formed
	if len(newEdges) > 0 {
		s.hub.Publish(Event{
			Type:      "causal.graph.updated",
			ID:        newEdges[0].GraphID,
			Title:     fmt.Sprintf("Causal cluster updated: %d edges", len(newEdges)),
			Timestamp: now,
		})
	}

	return newEdges, nil
}

// GetGraph returns the full causal graph for a graph_id.
func (s *CausalGraphService) GetGraph(ctx context.Context, graphID string) (*CausalGraph, error) {
	var edges []database.CausalEdge
	if err := s.db.WithContext(ctx).Where("graph_id = ?", graphID).Find(&edges).Error; err != nil {
		return nil, err
	}
	return s.buildGraphDTO(ctx, graphID, edges)
}

// GetGraphForIncident returns the sub-graph containing a specific incident.
func (s *CausalGraphService) GetGraphForIncident(ctx context.Context, incidentID string) (*CausalGraph, error) {
	var edge database.CausalEdge
	if err := s.db.WithContext(ctx).
		Where("cause_id = ? OR effect_id = ?", incidentID, incidentID).
		First(&edge).Error; err != nil {
		return nil, err
	}
	return s.GetGraph(ctx, edge.GraphID)
}

// ListGraphs returns summaries of recent causal clusters.
func (s *CausalGraphService) ListGraphs(ctx context.Context, limit int) ([]GraphSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	type row struct {
		GraphID   string    `gorm:"column:graph_id"`
		NodeCount int       `gorm:"column:node_count"`
		EdgeCount int       `gorm:"column:edge_count"`
		FirstSeen time.Time `gorm:"column:first_seen"`
		LastSeen  time.Time `gorm:"column:last_seen"`
	}
	var rows []row
	err := s.db.WithContext(ctx).Raw(`
		SELECT graph_id,
			COUNT(DISTINCT cause_id) + COUNT(DISTINCT effect_id) AS node_count,
			COUNT(*) AS edge_count,
			MIN(created_at) AS first_seen,
			MAX(created_at) AS last_seen
		FROM causal_edges
		GROUP BY graph_id
		ORDER BY last_seen DESC
		LIMIT ?
	`, limit).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	summaries := make([]GraphSummary, len(rows))
	for i, r := range rows {
		summaries[i] = GraphSummary{
			GraphID:     r.GraphID,
			NodeCount:   r.NodeCount,
			EdgeCount:   r.EdgeCount,
			MaxSeverity: s.maxSeverityForGraph(ctx, r.GraphID),
			FirstSeen:   r.FirstSeen,
			LastSeen:    r.LastSeen,
		}
	}
	return summaries, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (s *CausalGraphService) buildGraphDTO(ctx context.Context, graphID string, edges []database.CausalEdge) (*CausalGraph, error) {
	// Collect unique incident IDs
	idSet := map[string]bool{}
	causeIDs := map[string]bool{}
	for _, e := range edges {
		idSet[e.CauseID] = true
		idSet[e.EffectID] = true
		causeIDs[e.CauseID] = true
	}

	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}

	var incidents []database.Incident
	s.db.WithContext(ctx).Where("id IN ?", ids).Find(&incidents)

	nodes := make([]CausalNode, len(incidents))
	for i, inc := range incidents {
		nodes[i] = CausalNode{
			IncidentID: inc.ID,
			Title:      inc.Title,
			Severity:   inc.Severity,
			AgentID:    inc.AgentID,
			CreatedAt:  inc.CreatedAt,
			IsCause:    causeIDs[inc.ID],
		}
	}

	return &CausalGraph{GraphID: graphID, Nodes: nodes, Edges: edges}, nil
}

func (s *CausalGraphService) traceDescendsFrom(ctx context.Context, childTraceID, ancestorTraceID string, maxHops int) bool {
	current := childTraceID
	for hop := 0; hop < maxHops; hop++ {
		var parentID string
		if err := s.db.WithContext(ctx).Model(&database.Trace{}).
			Select("parent_id").
			Where("trace_id = ?", current).
			Scan(&parentID).Error; err != nil || parentID == "" {
			return false
		}
		if parentID == ancestorTraceID {
			return true
		}
		current = parentID
	}
	return false
}

func (s *CausalGraphService) maxSeverityForGraph(ctx context.Context, graphID string) string {
	var edges []database.CausalEdge
	s.db.WithContext(ctx).Where("graph_id = ?", graphID).Find(&edges)
	ids := map[string]bool{}
	for _, e := range edges {
		ids[e.CauseID] = true
		ids[e.EffectID] = true
	}
	if len(ids) == 0 {
		return "low"
	}
	allIDs := make([]string, 0, len(ids))
	for id := range ids {
		allIDs = append(allIDs, id)
	}
	var incidents []database.Incident
	s.db.WithContext(ctx).Where("id IN ?", allIDs).Find(&incidents)

	order := map[string]int{"critical": 4, "high": 3, "medium": 2, "low": 1}
	max := "low"
	for _, inc := range incidents {
		if order[inc.Severity] > order[max] {
			max = inc.Severity
		}
	}
	return max
}

// assignGraphIDs groups edges into connected components using union-find.
func assignGraphIDs(edges []database.CausalEdge) {
	parent := map[string]string{}
	var find func(x string) string
	find = func(x string) string {
		if parent[x] == "" {
			parent[x] = x
		}
		if parent[x] != x {
			parent[x] = find(parent[x])
		}
		return parent[x]
	}
	union := func(a, b string) {
		ra, rb := find(a), find(b)
		if ra != rb {
			parent[ra] = rb
		}
	}

	for _, e := range edges {
		union(e.CauseID, e.EffectID)
	}

	// Collect canonical root IDs and map to stable graph IDs
	rootToGraph := map[string]string{}
	for _, e := range edges {
		root := find(e.CauseID)
		if _, ok := rootToGraph[root]; !ok {
			rootToGraph[root] = "graph_" + uuid.New().String()[:8]
		}
	}

	for i := range edges {
		root := find(edges[i].CauseID)
		edges[i].GraphID = rootToGraph[root]
	}

	// Ensure deterministic graph_id ordering
	sort.Slice(edges, func(i, j int) bool {
		return edges[i].GraphID < edges[j].GraphID
	})
}
