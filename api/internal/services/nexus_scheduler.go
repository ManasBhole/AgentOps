package services

import (
	"context"
	"time"

	"go.uber.org/zap"
)

// NEXUSScheduler runs all background intelligence jobs on fixed tickers.
type NEXUSScheduler struct {
	fp         *BehavioralFingerprintService
	anomaly    *AnomalyDetectionService
	causal     *CausalGraphService
	predictive *PredictiveHealthService
	topology   *TopologyService
	health     *HealthService
	logger     *zap.Logger
}

func NewNEXUSScheduler(
	fp *BehavioralFingerprintService,
	anomaly *AnomalyDetectionService,
	causal *CausalGraphService,
	predictive *PredictiveHealthService,
	topology *TopologyService,
	health *HealthService,
	logger *zap.Logger,
) *NEXUSScheduler {
	return &NEXUSScheduler{
		fp:         fp,
		anomaly:    anomaly,
		causal:     causal,
		predictive: predictive,
		topology:   topology,
		health:     health,
		logger:     logger,
	}
}

// Start launches all background goroutines. Call once from main().
//
// Schedule:
//
//	Every 30s  → Topology rebuild
//	Every 5m   → Fingerprint computation + health snapshots
//	Every 15m  → Anomaly detection scan
//	Every 10m  → Causal graph build
//	Every 15m  → Predictive health regression
func (s *NEXUSScheduler) Start(ctx context.Context) {
	go s.runTopology(ctx)
	go s.runFingerprints(ctx)
	go s.runAnomalyDetection(ctx)
	go s.runCausalGraph(ctx)
	go s.runPredictions(ctx)
}

func (s *NEXUSScheduler) runTopology(ctx context.Context) {
	// Run immediately on start, then every 30s
	s.doTopology(ctx)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.doTopology(ctx)
		}
	}
}

func (s *NEXUSScheduler) runFingerprints(ctx context.Context) {
	time.Sleep(5 * time.Second) // slight stagger
	s.doFingerprints(ctx)
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.doFingerprints(ctx)
		}
	}
}

func (s *NEXUSScheduler) runAnomalyDetection(ctx context.Context) {
	time.Sleep(10 * time.Second)
	s.doAnomalyDetection(ctx)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.doAnomalyDetection(ctx)
		}
	}
}

func (s *NEXUSScheduler) runCausalGraph(ctx context.Context) {
	time.Sleep(15 * time.Second)
	s.doCausalGraph(ctx)
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.doCausalGraph(ctx)
		}
	}
}

func (s *NEXUSScheduler) runPredictions(ctx context.Context) {
	time.Sleep(20 * time.Second)
	s.doPredictions(ctx)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.doPredictions(ctx)
		}
	}
}

// ── job implementations ───────────────────────────────────────────────────────

func (s *NEXUSScheduler) doTopology(ctx context.Context) {
	if err := s.topology.RebuildTopology(ctx); err != nil {
		s.logger.Warn("NEXUS topology rebuild failed", zap.Error(err))
	}
}

func (s *NEXUSScheduler) doFingerprints(ctx context.Context) {
	if err := s.fp.ComputeAllFingerprints(ctx, s.health); err != nil {
		s.logger.Warn("NEXUS fingerprint compute failed", zap.Error(err))
	}
	if err := s.predictive.RecordAllSnapshots(ctx, s.health); err != nil {
		s.logger.Warn("NEXUS health snapshot record failed", zap.Error(err))
	}
}

func (s *NEXUSScheduler) doAnomalyDetection(ctx context.Context) {
	fired, err := s.anomaly.RunDetection(ctx, 2.5)
	if err != nil {
		s.logger.Warn("NEXUS anomaly scan failed", zap.Error(err))
		return
	}
	if len(fired) > 0 {
		s.logger.Info("NEXUS anomalies detected", zap.Int("count", len(fired)))
	}
}

func (s *NEXUSScheduler) doCausalGraph(ctx context.Context) {
	edges, err := s.causal.BuildCausalGraph(ctx, 30*time.Minute, 300_000, 0.3)
	if err != nil {
		s.logger.Warn("NEXUS causal graph build failed", zap.Error(err))
		return
	}
	if len(edges) > 0 {
		s.logger.Info("NEXUS causal edges computed", zap.Int("count", len(edges)))
	}
}

func (s *NEXUSScheduler) doPredictions(ctx context.Context) {
	if err := s.predictive.RunPredictions(ctx); err != nil {
		s.logger.Warn("NEXUS predictions failed", zap.Error(err))
	}
}
