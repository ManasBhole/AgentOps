package services

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"time"

	"github.com/manasbhole/orion/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// BlastRadiusService runs Monte Carlo blast radius simulations across the
// agent topology graph. For a given source agent + proposed change, it BFS
// the topology, samples propagation probabilities, and ranks downstream agents
// by expected impact severity.
type BlastRadiusService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewBlastRadiusService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *BlastRadiusService {
	return &BlastRadiusService{db: db, logger: logger, hub: hub}
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BlastRadiusResult struct {
	AgentID           string  `json:"agent_id"`
	AgentName         string  `json:"agent_name"`
	Depth             int     `json:"depth"`           // hops from source
	ImpactProbability float64 `json:"impact_prob"`     // 0–1, Monte Carlo estimate
	ExpectedErrDelta  float64 `json:"err_rate_delta"`  // expected Δ error rate
	ExpectedLatDelta  float64 `json:"lat_delta_ms"`    // expected Δ p95 latency ms
	CurrentErrRate    float64 `json:"current_err_rate"`
	CurrentP95LatMs   float64 `json:"current_p95_lat_ms"`
	CurrentHealth     int     `json:"current_health"`
	CallFrequency     int64   `json:"call_frequency"` // observed topology edge count
	Severity          string  `json:"severity"`        // "critical" | "high" | "medium" | "low"
}

type SimulationOutput struct {
	SimulationID  string              `json:"simulation_id"`
	SourceAgentID string              `json:"source_agent_id"`
	ChangeType    string              `json:"change_type"`
	ChangeDesc    string              `json:"change_desc"`
	Iterations    int                 `json:"iterations"`
	Results       []BlastRadiusResult `json:"results"`
	TotalAffected int                 `json:"total_affected"`
	MaxDepth      int                 `json:"max_depth"`
	CreatedAt     time.Time           `json:"created_at"`
}

// ── Simulation ────────────────────────────────────────────────────────────────

// Run executes a Monte Carlo blast radius simulation.
// changeType: "deploy" | "config" | "scale_down" | "rollback"
// iterations: number of Monte Carlo samples (default 1000)
func (s *BlastRadiusService) Run(
	sourceAgentID, changeType, changeDesc, userID string,
	iterations int,
) (*SimulationOutput, error) {
	if iterations <= 0 {
		iterations = 1000
	}

	// 1. Build adjacency list from topology edges (parent→children)
	adj, names, err := s.buildAdjacency()
	if err != nil {
		return nil, fmt.Errorf("topology: %w", err)
	}

	// 2. Load latest behavioral fingerprints for all agents
	fingerprints, err := s.loadFingerprints()
	if err != nil {
		return nil, fmt.Errorf("fingerprints: %w", err)
	}

	// 3. BFS from source to find all reachable agents + their depth
	reachable := s.bfs(sourceAgentID, adj)

	if len(reachable) == 0 {
		// Source has no known downstream — return empty but valid result
		out := &SimulationOutput{
			SimulationID:  fmt.Sprintf("sim_%d", time.Now().UnixNano()),
			SourceAgentID: sourceAgentID,
			ChangeType:    changeType,
			ChangeDesc:    changeDesc,
			Iterations:    iterations,
			Results:       []BlastRadiusResult{},
			TotalAffected: 0,
			MaxDepth:      0,
			CreatedAt:     time.Now().UTC(),
		}
		s.persist(out, userID)
		return out, nil
	}

	// 4. Change-type amplifier: how much more error a given change type injects
	// at the source. Downstream agents then sample this amplification.
	errorAmplifier := changeAmplifier(changeType)

	// 5. Monte Carlo: for each downstream agent, sample N times
	results := make([]BlastRadiusResult, 0, len(reachable))
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for agentID, depth := range reachable {
		fp := fingerprints[agentID]

		// Base propagation probability from topology: P(propagate) ∝ call frequency
		// Normalised: more calls = higher chance of being affected
		var maxCallFreq int64 = 1
		for _, e := range adj {
			for _, child := range e {
				if child.freq > maxCallFreq {
					maxCallFreq = child.freq
				}
			}
		}

		// Find the edge from any ancestor that leads to this agent
		edgeFreq := s.edgeFreqTo(agentID, adj)
		baseProp := math.Min(0.95, float64(edgeFreq)/float64(maxCallFreq+1))
		// Deeper nodes have attenuated propagation
		depthAttenuation := math.Pow(0.75, float64(depth-1))
		propagationP := baseProp * depthAttenuation

		// Monte Carlo
		var hitCount int
		var totalErrDelta, totalLatDelta float64

		for i := 0; i < iterations; i++ {
			if rng.Float64() > propagationP {
				continue // change doesn't propagate to this agent in this run
			}
			hitCount++

			// Error injection: source injects errorAmplifier * (1 + agent_err_rate)
			// Attenuated by depth
			injectedErr := errorAmplifier * depthAttenuation * (1.0 + fp.ErrorRate)
			// Add stochastic noise ~10%
			injectedErr *= (0.9 + rng.Float64()*0.2)
			totalErrDelta += injectedErr

			// Latency injection: assume error + retry adds 200-500ms, scaled by health
			healthFactor := 1.0
			if fp.CurrentHealth > 0 {
				healthFactor = math.Max(0.5, 1.0-float64(fp.CurrentHealth)/200.0)
			}
			latInjected := (200 + rng.Float64()*300) * errorAmplifier * depthAttenuation * healthFactor
			totalLatDelta += latInjected
		}

		impactProb := float64(hitCount) / float64(iterations)
		var avgErrDelta, avgLatDelta float64
		if hitCount > 0 {
			avgErrDelta = totalErrDelta / float64(hitCount)
			avgLatDelta = totalLatDelta / float64(hitCount)
		}

		// Cap err delta so it doesn't exceed 1.0
		avgErrDelta = math.Min(1.0, avgErrDelta)

		severity := severityLevel(impactProb, avgErrDelta)

		results = append(results, BlastRadiusResult{
			AgentID:           agentID,
			AgentName:         names[agentID],
			Depth:             depth,
			ImpactProbability: math.Round(impactProb*1000) / 1000,
			ExpectedErrDelta:  math.Round(avgErrDelta*10000) / 10000,
			ExpectedLatDelta:  math.Round(avgLatDelta*10) / 10,
			CurrentErrRate:    fp.ErrorRate,
			CurrentP95LatMs:   fp.P95LatencyMs,
			CurrentHealth:     fp.CurrentHealth,
			CallFrequency:     edgeFreq,
			Severity:          severity,
		})
	}

	// Sort by impact probability DESC, then severity
	sort.Slice(results, func(i, j int) bool {
		if results[i].ImpactProbability != results[j].ImpactProbability {
			return results[i].ImpactProbability > results[j].ImpactProbability
		}
		return results[i].ExpectedErrDelta > results[j].ExpectedErrDelta
	})

	maxDepth := 0
	for _, r := range results {
		if r.Depth > maxDepth {
			maxDepth = r.Depth
		}
	}

	out := &SimulationOutput{
		SimulationID:  fmt.Sprintf("sim_%d", time.Now().UnixNano()),
		SourceAgentID: sourceAgentID,
		ChangeType:    changeType,
		ChangeDesc:    changeDesc,
		Iterations:    iterations,
		Results:       results,
		TotalAffected: len(results),
		MaxDepth:      maxDepth,
		CreatedAt:     time.Now().UTC(),
	}

	s.persist(out, userID)

	// SSE broadcast if critical agents affected
	criticalCount := 0
	for _, r := range results {
		if r.Severity == "critical" {
			criticalCount++
		}
	}
	if criticalCount > 0 {
		s.hub.Publish(Event{
			Type:    "blast.critical",
			AgentID: sourceAgentID,
			Data: map[string]any{
				"simulation_id":  out.SimulationID,
				"critical_count": criticalCount,
				"change_type":    changeType,
			},
		})
	}

	return out, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type adjEntry struct {
	agentID string
	freq    int64
}

func (s *BlastRadiusService) buildAdjacency() (map[string][]adjEntry, map[string]string, error) {
	var edges []database.TopologyEdge
	if err := s.db.Find(&edges).Error; err != nil {
		return nil, nil, err
	}

	// Also load agent names
	var agents []database.Agent
	s.db.Select("id, name").Find(&agents)
	names := make(map[string]string, len(agents))
	for _, a := range agents {
		names[a.ID] = a.Name
	}

	adj := make(map[string][]adjEntry)
	for i := range edges {
		e := edges[i]
		adj[e.ParentAgentID] = append(adj[e.ParentAgentID], adjEntry{
			agentID: e.ChildAgentID,
			freq:    e.EdgeCount,
		})
	}
	return adj, names, nil
}

type fpSummary struct {
	ErrorRate     float64
	P95LatencyMs  float64
	CurrentHealth int
}

func (s *BlastRadiusService) loadFingerprints() (map[string]fpSummary, error) {
	var fps []database.BehavioralFingerprint
	// Latest 24h fingerprint per agent
	err := s.db.Raw(`
		SELECT DISTINCT ON (agent_id) *
		FROM behavioral_fingerprints
		WHERE window = '24h'
		ORDER BY agent_id, computed_at DESC
	`).Scan(&fps).Error
	if err != nil {
		// Fallback: just get latest per agent
		s.db.Where("window = '24h'").Order("computed_at DESC").Limit(500).Find(&fps)
	}

	out := make(map[string]fpSummary, len(fps))
	for _, fp := range fps {
		out[fp.AgentID] = fpSummary{
			ErrorRate:     fp.ErrorRate,
			P95LatencyMs:  fp.P95LatencyMs,
			CurrentHealth: fp.HealthScore,
		}
	}
	return out, nil
}

// bfs returns all downstream agents (reachable from source) with their BFS depth.
func (s *BlastRadiusService) bfs(source string, adj map[string][]adjEntry) map[string]int {
	visited := map[string]int{source: 0}
	queue := []string{source}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, child := range adj[cur] {
			if _, seen := visited[child.agentID]; !seen {
				visited[child.agentID] = visited[cur] + 1
				queue = append(queue, child.agentID)
			}
		}
	}
	delete(visited, source) // exclude source itself
	return visited
}

// edgeFreqTo finds the maximum call frequency of any edge pointing TO agentID.
func (s *BlastRadiusService) edgeFreqTo(agentID string, adj map[string][]adjEntry) int64 {
	var maxFreq int64 = 1
	for _, children := range adj {
		for _, c := range children {
			if c.agentID == agentID && c.freq > maxFreq {
				maxFreq = c.freq
			}
		}
	}
	return maxFreq
}

// changeAmplifier returns the base error injection rate for a change type.
func changeAmplifier(changeType string) float64 {
	switch changeType {
	case "deploy":
		return 0.25 // new deploy: moderate risk
	case "config":
		return 0.15 // config change: lower risk
	case "scale_down":
		return 0.40 // scale down: high risk (capacity reduction)
	case "rollback":
		return 0.10 // rollback: lower risk (reverting to known state)
	default:
		return 0.20
	}
}

func severityLevel(prob, errDelta float64) string {
	score := prob*0.6 + errDelta*0.4
	if score >= 0.5 {
		return "critical"
	} else if score >= 0.3 {
		return "high"
	} else if score >= 0.1 {
		return "medium"
	}
	return "low"
}

func (s *BlastRadiusService) persist(out *SimulationOutput, userID string) {
	b, _ := json.Marshal(out.Results)
	sim := database.BlastRadiusSimulation{
		ID:            out.SimulationID,
		SourceAgentID: out.SourceAgentID,
		ChangeType:    out.ChangeType,
		ChangeDesc:    out.ChangeDesc,
		Iterations:    out.Iterations,
		Results:       string(b),
		TotalAffected: out.TotalAffected,
		MaxDepth:      out.MaxDepth,
		CreatedBy:     userID,
		CreatedAt:     out.CreatedAt,
	}
	s.db.Create(&sim)
}

// List returns past simulations for an agent.
func (s *BlastRadiusService) List(agentID string, limit int) ([]database.BlastRadiusSimulation, error) {
	if limit <= 0 {
		limit = 20
	}
	var sims []database.BlastRadiusSimulation
	q := s.db.Order("created_at DESC").Limit(limit)
	if agentID != "" {
		q = q.Where("source_agent_id = ?", agentID)
	}
	return sims, q.Find(&sims).Error
}

// Get returns a single simulation with parsed results.
func (s *BlastRadiusService) Get(id string) (*SimulationOutput, error) {
	var sim database.BlastRadiusSimulation
	if err := s.db.First(&sim, "id = ?", id).Error; err != nil {
		return nil, err
	}
	var results []BlastRadiusResult
	json.Unmarshal([]byte(sim.Results), &results)
	return &SimulationOutput{
		SimulationID:  sim.ID,
		SourceAgentID: sim.SourceAgentID,
		ChangeType:    sim.ChangeType,
		ChangeDesc:    sim.ChangeDesc,
		Iterations:    sim.Iterations,
		Results:       results,
		TotalAffected: sim.TotalAffected,
		MaxDepth:      sim.MaxDepth,
		CreatedAt:     sim.CreatedAt,
	}, nil
}
