package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/agentops/agentops/api/internal/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type AlertCorrelationService struct {
	db     *gorm.DB
	logger *zap.Logger
	hub    *EventHub
}

func NewAlertCorrelationService(db *gorm.DB, logger *zap.Logger, hub *EventHub) *AlertCorrelationService {
	return &AlertCorrelationService{db: db, logger: logger, hub: hub}
}

type CorrelationCluster struct {
	database.AlertCluster
	Incidents []database.Incident     `json:"incidents"`
	Anomalies []database.AnomalyEvent `json:"anomalies"`
}

// Correlate scans recent incidents + anomalies and groups them into clusters.
func (s *AlertCorrelationService) Correlate() ([]CorrelationCluster, error) {
	// Fetch open incidents (last 24h)
	var incidents []database.Incident
	s.db.Where("status != 'resolved' AND created_at >= ?", time.Now().Add(-24*time.Hour)).
		Order("created_at DESC").Find(&incidents)

	// Fetch open anomalies (last 24h)
	var anomalies []database.AnomalyEvent
	s.db.Where("status = 'open' AND created_at >= ?", time.Now().Add(-24*time.Hour)).
		Order("created_at DESC").Find(&anomalies)

	clusters := s.clusterByAgent(incidents, anomalies)
	clusters = append(clusters, s.clusterBySeverity(incidents, anomalies)...)
	clusters = append(clusters, s.clusterByTime(incidents, anomalies)...)

	// Deduplicate clusters that are subsets of each other
	clusters = deduplicateClusters(clusters)

	// Persist new clusters
	for i := range clusters {
		existing := database.AlertCluster{}
		if s.db.Where("label = ? AND status = 'active'", clusters[i].Label).First(&existing).Error == nil {
			// Update existing
			s.db.Model(&existing).Updates(map[string]any{
				"last_seen":    time.Now().UTC(),
				"count":        clusters[i].Count,
				"incident_ids": clusters[i].IncidentIDs,
				"anomaly_ids":  clusters[i].AnomalyIDs,
			})
			clusters[i].AlertCluster = existing
		} else {
			clusters[i].AlertCluster.ID = fmt.Sprintf("ac_%d_%d", time.Now().UnixNano(), i)
			clusters[i].AlertCluster.CreatedAt = time.Now().UTC()
			s.db.Create(&clusters[i].AlertCluster)
		}
	}

	return clusters, nil
}

func (s *AlertCorrelationService) ListClusters() ([]database.AlertCluster, error) {
	var clusters []database.AlertCluster
	return clusters, s.db.Where("status = 'active'").
		Order("last_seen DESC").Limit(50).Find(&clusters).Error
}

func (s *AlertCorrelationService) SuppressCluster(id string) error {
	return s.db.Model(&database.AlertCluster{}).
		Where("id = ?", id).Update("status", "suppressed").Error
}

// ── clustering strategies ─────────────────────────────────────────────────────

func (s *AlertCorrelationService) clusterByAgent(incidents []database.Incident, anomalies []database.AnomalyEvent) []CorrelationCluster {
	type group struct {
		incidents []database.Incident
		anomalies []database.AnomalyEvent
	}
	byAgent := make(map[string]*group)

	for _, inc := range incidents {
		if byAgent[inc.AgentID] == nil {
			byAgent[inc.AgentID] = &group{}
		}
		byAgent[inc.AgentID].incidents = append(byAgent[inc.AgentID].incidents, inc)
	}
	for _, an := range anomalies {
		if byAgent[an.AgentID] == nil {
			byAgent[an.AgentID] = &group{}
		}
		byAgent[an.AgentID].anomalies = append(byAgent[an.AgentID].anomalies, an)
	}

	var clusters []CorrelationCluster
	for agentID, g := range byAgent {
		total := len(g.incidents) + len(g.anomalies)
		if total < 2 {
			continue
		}
		confidence := float64(total) / float64(total+2) // simple heuristic
		sev := dominantSeverityInc(g.incidents)

		incIDs := make([]string, 0, len(g.incidents))
		for _, i := range g.incidents {
			incIDs = append(incIDs, i.ID)
		}
		anIDs := make([]string, 0, len(g.anomalies))
		for _, a := range g.anomalies {
			anIDs = append(anIDs, a.ID)
		}

		c := CorrelationCluster{
			AlertCluster: database.AlertCluster{
				Label:       fmt.Sprintf("Agent %s storm", agentID),
				Pattern:     fmt.Sprintf("Multiple alerts originating from agent %s within 24h", agentID),
				IncidentIDs: toJSON(incIDs),
				AnomalyIDs:  toJSON(anIDs),
				AgentIDs:    toJSON([]string{agentID}),
				Confidence:  confidence,
				Severity:    sev,
				Count:       total,
				FirstSeen:   time.Now().Add(-24 * time.Hour),
				LastSeen:    time.Now().UTC(),
				Status:      "active",
			},
			Incidents: g.incidents,
			Anomalies: g.anomalies,
		}
		clusters = append(clusters, c)
	}
	return clusters
}

func (s *AlertCorrelationService) clusterBySeverity(incidents []database.Incident, anomalies []database.AnomalyEvent) []CorrelationCluster {
	criticalInc := filterIncBySev(incidents, "critical")
	criticalAn := filterAnBySev(anomalies, "critical")
	total := len(criticalInc) + len(criticalAn)
	if total < 3 {
		return nil
	}

	incIDs := make([]string, 0, len(criticalInc))
	for _, i := range criticalInc {
		incIDs = append(incIDs, i.ID)
	}
	anIDs := make([]string, 0, len(criticalAn))
	for _, a := range criticalAn {
		anIDs = append(anIDs, a.ID)
	}
	agentSet := make(map[string]bool)
	for _, i := range criticalInc {
		agentSet[i.AgentID] = true
	}
	for _, a := range criticalAn {
		agentSet[a.AgentID] = true
	}
	agents := make([]string, 0, len(agentSet))
	for id := range agentSet {
		agents = append(agents, id)
	}

	return []CorrelationCluster{{
		AlertCluster: database.AlertCluster{
			Label:       "Critical alert wave",
			Pattern:     fmt.Sprintf("%d critical alerts across %d agents — possible cascading failure", total, len(agents)),
			IncidentIDs: toJSON(incIDs),
			AnomalyIDs:  toJSON(anIDs),
			AgentIDs:    toJSON(agents),
			Confidence:  0.85,
			Severity:    "critical",
			Count:       total,
			FirstSeen:   time.Now().Add(-1 * time.Hour),
			LastSeen:    time.Now().UTC(),
			Status:      "active",
		},
		Incidents: criticalInc,
		Anomalies: criticalAn,
	}}
}

func (s *AlertCorrelationService) clusterByTime(incidents []database.Incident, anomalies []database.AnomalyEvent) []CorrelationCluster {
	// Cluster events within 15-minute windows
	window := 15 * time.Minute
	type bucket struct {
		incidents []database.Incident
		anomalies []database.AnomalyEvent
		start     time.Time
	}
	buckets := make(map[int64]*bucket)

	for _, inc := range incidents {
		k := inc.CreatedAt.Truncate(window).Unix()
		if buckets[k] == nil {
			buckets[k] = &bucket{start: inc.CreatedAt.Truncate(window)}
		}
		buckets[k].incidents = append(buckets[k].incidents, inc)
	}
	for _, an := range anomalies {
		k := an.CreatedAt.Truncate(window).Unix()
		if buckets[k] == nil {
			buckets[k] = &bucket{start: an.CreatedAt.Truncate(window)}
		}
		buckets[k].anomalies = append(buckets[k].anomalies, an)
	}

	var clusters []CorrelationCluster
	for _, b := range buckets {
		total := len(b.incidents) + len(b.anomalies)
		if total < 3 {
			continue
		}
		incIDs := make([]string, 0, len(b.incidents))
		for _, i := range b.incidents {
			incIDs = append(incIDs, i.ID)
		}
		anIDs := make([]string, 0, len(b.anomalies))
		for _, a := range b.anomalies {
			anIDs = append(anIDs, a.ID)
		}
		clusters = append(clusters, CorrelationCluster{
			AlertCluster: database.AlertCluster{
				Label:       fmt.Sprintf("Alert burst at %s", b.start.Format("15:04")),
				Pattern:     fmt.Sprintf("%d events within a 15-minute window starting %s", total, b.start.Format("15:04 Jan 2")),
				IncidentIDs: toJSON(incIDs),
				AnomalyIDs:  toJSON(anIDs),
				Confidence:  0.7,
				Severity:    "high",
				Count:       total,
				FirstSeen:   b.start,
				LastSeen:    b.start.Add(window),
				Status:      "active",
			},
			Incidents: b.incidents,
			Anomalies: b.anomalies,
		})
	}
	return clusters
}

// ── helpers ───────────────────────────────────────────────────────────────────

func dominantSeverityInc(incidents []database.Incident) string {
	for _, sev := range []string{"critical", "high", "medium", "low"} {
		for _, i := range incidents {
			if i.Severity == sev {
				return sev
			}
		}
	}
	return "medium"
}

func filterIncBySev(incidents []database.Incident, sev string) []database.Incident {
	var out []database.Incident
	for _, i := range incidents {
		if i.Severity == sev {
			out = append(out, i)
		}
	}
	return out
}

func filterAnBySev(anomalies []database.AnomalyEvent, sev string) []database.AnomalyEvent {
	var out []database.AnomalyEvent
	for _, a := range anomalies {
		if a.Severity == sev {
			out = append(out, a)
		}
	}
	return out
}

func toJSON(ids []string) string {
	if len(ids) == 0 {
		return "[]"
	}
	return `["` + strings.Join(ids, `","`) + `"]`
}

func deduplicateClusters(clusters []CorrelationCluster) []CorrelationCluster {
	seen := make(map[string]bool)
	var out []CorrelationCluster
	for _, c := range clusters {
		if !seen[c.Label] {
			seen[c.Label] = true
			out = append(out, c)
		}
	}
	return out
}
