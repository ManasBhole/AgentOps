import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

export type WindowLabel = '1h' | '6h' | '24h' | '7d'

export interface BehavioralFingerprint {
  id: string
  agent_id: string
  window: WindowLabel
  window_start: string
  window_end: string
  sample_count: number
  p50_latency_ms: number
  p95_latency_ms: number
  p99_latency_ms: number
  avg_latency_ms: number
  max_latency_ms: number
  error_rate: number
  error_count: number
  avg_tokens_per_req: number
  p95_tokens_per_req: number
  avg_cost_per_req_usd: number
  total_cost_usd: number
  health_score: number
  computed_at: string
}

export interface AnomalyEvent {
  id: string
  agent_id: string
  metric: string
  z_score: number
  baseline_mean: number
  baseline_stddev: number
  observed_value: number
  deviation_pct: number
  severity: 'warning' | 'critical'
  status: 'open' | 'acknowledged' | 'resolved'
  window_start: string
  window_end: string
  resolved_at?: string
  created_at: string
}

export interface CausalNode {
  incident_id: string
  title: string
  severity: string
  agent_id: string
  created_at: string
  is_cause: boolean
}

export interface CausalEdge {
  id: string
  cause_id: string
  effect_id: string
  confidence: number
  lag_ms: number
  correlation_method: string
  graph_id: string
}

export interface CausalGraph {
  graph_id: string
  nodes: CausalNode[]
  edges: CausalEdge[]
}

export interface GraphSummary {
  graph_id: string
  node_count: number
  edge_count: number
  max_severity: string
  first_seen: string
  last_seen: string
}

export interface HealthPrediction {
  id: string
  agent_id: string
  horizon: '+1h' | '+4h' | '+24h'
  predicted_score: number
  slope: number
  intercept: number
  r_squared: number
  training_points: number
  is_critical: boolean
  predicted_at: string
}

export interface HealthScoreHistory {
  id: string
  agent_id: string
  score: number
  error_rate: number
  avg_latency_ms: number
  open_incidents: number
  recorded_at: string
}

export interface TopologyNode {
  agent_id: string
  name: string
  status: string
  health_score: number
  request_volume: number
  error_rate: number
}

export interface TopologyEdgeData {
  source: string
  target: string
  edge_count: number
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdgeData[]
  updated_at: string
}

export interface NexusSummary {
  active_anomalies: number
  critical_predictions: number
  causal_clusters: number
  agents_fingerprinted: number
  topology_nodes: number
  topology_edges: number
  last_scan_at: string
}

// ── Summary ──────────────────────────────────────────────────────────────────

export function useNexusSummary() {
  return useQuery<NexusSummary>({
    queryKey: ['nexus-summary'],
    queryFn: async () => { const { data } = await api.get('/nexus/summary'); return data },
    refetchInterval: 30_000,
  })
}

// ── Fingerprints ─────────────────────────────────────────────────────────────

export function useFleetFingerprints(window: WindowLabel = '24h') {
  return useQuery<{ fingerprints: BehavioralFingerprint[]; count: number }>({
    queryKey: ['nexus-fingerprints', window],
    queryFn: async () => { const { data } = await api.get(`/nexus/fingerprints?window=${window}`); return data },
    refetchInterval: 60_000,
  })
}

export function useFingerprintHistory(agentId: string, window: WindowLabel = '24h', limit = 48) {
  return useQuery<{ history: BehavioralFingerprint[] }>({
    queryKey: ['nexus-fp-history', agentId, window, limit],
    queryFn: async () => {
      const { data } = await api.get(`/nexus/fingerprints/${agentId}/history?window=${window}&limit=${limit}`)
      return data
    },
    enabled: !!agentId,
    refetchInterval: 60_000,
  })
}

// ── Anomalies ────────────────────────────────────────────────────────────────

export function useAnomalyFeed(agentId?: string, status?: string, limit = 100) {
  return useQuery<{ anomalies: AnomalyEvent[]; count: number }>({
    queryKey: ['nexus-anomalies', agentId, status, limit],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (agentId) params.set('agent_id', agentId)
      if (status) params.set('status', status)
      params.set('limit', String(limit))
      const { data } = await api.get(`/nexus/anomalies?${params}`)
      return data
    },
    refetchInterval: 15_000,
  })
}

export function useAcknowledgeAnomaly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/nexus/anomalies/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nexus-anomalies'] }),
  })
}

export function useTriggerAnomalyScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (threshold?: number) =>
      api.post('/nexus/anomalies/scan', { z_score_threshold: threshold ?? 2.5 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nexus-anomalies'] }),
  })
}

// ── Causal Graph ─────────────────────────────────────────────────────────────

export function useGraphList() {
  return useQuery<{ graphs: GraphSummary[] }>({
    queryKey: ['nexus-graph-list'],
    queryFn: async () => { const { data } = await api.get('/nexus/causal/graphs'); return data },
    refetchInterval: 30_000,
  })
}

export function useCausalGraph(graphId: string) {
  return useQuery<{ graph: CausalGraph }>({
    queryKey: ['nexus-causal-graph', graphId],
    queryFn: async () => { const { data } = await api.get(`/nexus/causal/graphs/${graphId}`); return data },
    enabled: !!graphId,
  })
}

// ── Predictions ──────────────────────────────────────────────────────────────

export function useFleetPredictions(criticalOnly = false) {
  return useQuery<{ predictions: HealthPrediction[]; count: number }>({
    queryKey: ['nexus-predictions', criticalOnly],
    queryFn: async () => {
      const { data } = await api.get(`/nexus/predictions?critical_only=${criticalOnly}`)
      return data
    },
    refetchInterval: 60_000,
  })
}

export function useAgentPredictions(agentId: string) {
  return useQuery<{ predictions: HealthPrediction[]; history: HealthScoreHistory[] }>({
    queryKey: ['nexus-agent-predictions', agentId],
    queryFn: async () => { const { data } = await api.get(`/nexus/predictions/${agentId}`); return data },
    enabled: !!agentId,
    refetchInterval: 60_000,
  })
}

// ── Topology ─────────────────────────────────────────────────────────────────

export function useTopologyGraph() {
  return useQuery<{ graph: TopologyGraph }>({
    queryKey: ['nexus-topology'],
    queryFn: async () => { const { data } = await api.get('/nexus/topology'); return data },
    refetchInterval: 30_000,
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function healthBg(score: number): string {
  if (score >= 80) return 'bg-emerald-950 border-emerald-900'
  if (score >= 50) return 'bg-yellow-950 border-yellow-900'
  return 'bg-red-950 border-red-900'
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400'
    case 'high': return 'text-orange-400'
    case 'medium': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
}

export function metricLabel(metric: string): string {
  const MAP: Record<string, string> = {
    p99_latency_ms: 'P99 Latency',
    p95_latency_ms: 'P95 Latency',
    error_rate: 'Error Rate',
    avg_cost_per_req_usd: 'Avg Cost/Req',
    avg_tokens_per_req: 'Avg Tokens/Req',
    avg_latency_ms: 'Avg Latency',
  }
  return MAP[metric] ?? metric
}
