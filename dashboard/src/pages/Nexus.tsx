import { useState, useRef, useEffect } from 'react'
import {
  Cpu, AlertTriangle, GitMerge, TrendingDown, Network,
  RefreshCw, Loader2, CheckCircle2, Eye,
  Activity, Zap, Fingerprint, Scan,
} from 'lucide-react'
import {
  useNexusSummary, useFleetFingerprints, useFingerprintHistory,
  useAnomalyFeed, useAcknowledgeAnomaly, useTriggerAnomalyScan,
  useGraphList, useCausalGraph,
  useFleetPredictions, useAgentPredictions,
  useTopologyGraph,
  healthColor, healthBg, severityColor, metricLabel,
  type WindowLabel, type TopologyNode, type TopologyEdgeData,
} from '../hooks/useNexus'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = 'fingerprints' | 'anomalies' | 'causal' | 'predictions' | 'topology'

interface Agent { id: string; name: string; type: string; status: string }

// ── Summary strip ────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${color}`}><Icon className="h-4 w-4 text-white" /></div>
      <div>
        <div className="text-xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
        {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── Fingerprints tab ─────────────────────────────────────────────────────────
function FingerprintsTab({ agents }: { agents: Agent[] }) {
  const [window, setWindow] = useState<WindowLabel>('24h')
  const [selectedAgent, setSelectedAgent] = useState('')
  const { data, isFetching } = useFleetFingerprints(window)
  const { data: histData } = useFingerprintHistory(selectedAgent, window, 24)
  const fps = data?.fingerprints ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['1h', '6h', '24h', '7d'] as WindowLabel[]).map(w => (
            <button key={w} onClick={() => setWindow(w)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${window === w ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {w}
            </button>
          ))}
        </div>
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
      </div>

      {fps.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Fingerprint className="h-8 w-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No fingerprints yet — the scheduler runs every 5 minutes.</p>
          <p className="text-xs text-gray-600 mt-1">Data will appear after agents process traces.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {fps.map(fp => {
            const agentName = agents.find(a => a.id === fp.agent_id)?.name ?? fp.agent_id.slice(0, 12) + '…'
            const isSelected = selectedAgent === fp.agent_id
            return (
              <div key={fp.id}
                onClick={() => setSelectedAgent(isSelected ? '' : fp.agent_id)}
                className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all ${isSelected ? 'border-blue-500' : 'border-gray-800 hover:border-gray-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-white">{agentName}</span>
                    <span className="ml-2 text-xs text-gray-500">{fp.sample_count.toLocaleString()} samples</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${healthBg(fp.health_score)}`}>
                    <span className={healthColor(fp.health_score)}>{fp.health_score}</span>
                  </div>
                </div>

                {/* Latency percentile bars */}
                <div className="space-y-2 mb-3">
                  {[
                    { label: 'P50', value: fp.p50_latency_ms, max: fp.p99_latency_ms || 1 },
                    { label: 'P95', value: fp.p95_latency_ms, max: fp.p99_latency_ms || 1 },
                    { label: 'P99', value: fp.p99_latency_ms, max: fp.p99_latency_ms || 1 },
                  ].map(({ label, value, max }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-7">{label}</span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${label === 'P99' ? 'bg-red-500' : label === 'P95' ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-16 text-right">
                        {value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className={`text-sm font-bold ${fp.error_rate > 0.05 ? 'text-red-400' : fp.error_rate > 0.02 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {(fp.error_rate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Error Rate</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-sm font-bold text-blue-400">{Math.round(fp.avg_tokens_per_req)}</div>
                    <div className="text-xs text-gray-500">Avg Tokens</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-sm font-bold text-cyan-400">${fp.avg_cost_per_req_usd.toFixed(5)}</div>
                    <div className="text-xs text-gray-500">Avg Cost</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sparkline for selected agent */}
      {selectedAgent && histData?.history && histData.history.length > 1 && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            P99 Latency History — {agents.find(a => a.id === selectedAgent)?.name ?? selectedAgent.slice(0, 12)}
          </h3>
          <MiniSparkline data={histData.history.map(h => h.p99_latency_ms)} color="#ef4444" />
          <MiniSparkline data={histData.history.map(h => h.error_rate * 100)} color="#f59e0b" label="Error Rate %" />
        </div>
      )}
    </div>
  )
}

function MiniSparkline({ data, color, label }: { data: number[]; color: string; label?: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const h = 40
  const w = 400
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="mb-3">
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>min: {min.toFixed(1)}</span>
        <span>max: {max.toFixed(1)}</span>
      </div>
    </div>
  )
}

// ── Anomalies tab ─────────────────────────────────────────────────────────────
function AnomaliesTab({ agents }: { agents: Agent[] }) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [agentFilter, setAgentFilter] = useState('')
  const { data, isFetching, refetch } = useAnomalyFeed(agentFilter || undefined, statusFilter || undefined, 100)
  const ackMutation = useAcknowledgeAnomaly()
  const scanMutation = useTriggerAnomalyScan()
  const anomalies = data?.anomalies ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {['', 'open', 'acknowledged', 'resolved'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {s || 'all'}
            </button>
          ))}
        </div>
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={() => scanMutation.mutate(undefined)}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-950 border border-blue-800 hover:border-blue-600 text-blue-300 text-xs rounded-lg transition-colors disabled:opacity-50">
          {scanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
          Run Scan Now
        </button>
        <button onClick={() => refetch()} className="ml-auto text-gray-500 hover:text-white p-1.5 rounded-lg bg-gray-900 border border-gray-800">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {anomalies.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No {statusFilter} anomalies detected.</p>
          <p className="text-xs text-gray-600 mt-1">System is operating within baseline parameters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map(a => {
            const agentName = agents.find(ag => ag.id === a.agent_id)?.name ?? a.agent_id.slice(0, 12) + '…'
            return (
              <div key={a.id}
                className={`bg-gray-900 border rounded-xl p-4 ${a.severity === 'critical' ? 'border-red-900' : 'border-yellow-900/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-950' : 'bg-yellow-950'}`}>
                      <AlertTriangle className={`h-3.5 w-3.5 ${a.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{metricLabel(a.metric)}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded-full border ${a.severity === 'critical' ? 'bg-red-950 border-red-900 text-red-400' : 'bg-yellow-950 border-yellow-900 text-yellow-400'}`}>
                          z={a.z_score.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500">{agentName}</span>
                      </div>
                      {/* Inline comparison bar */}
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>Baseline: <span className="text-gray-300">{a.baseline_mean.toFixed(3)}</span></span>
                        <span>·</span>
                        <span>Observed: <span className={a.deviation_pct > 0 ? 'text-red-400' : 'text-emerald-400'}>{a.observed_value.toFixed(3)}</span></span>
                        <span>·</span>
                        <span className={a.deviation_pct > 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden w-64">
                        <div
                          className={`h-full rounded-full ${a.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`}
                          style={{ width: `${Math.min(100, (Math.abs(a.z_score) / 5) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {a.status === 'open' && (
                      <button
                        onClick={() => ackMutation.mutate(a.id)}
                        disabled={ackMutation.isPending}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-300 bg-gray-800 border border-gray-700 px-2.5 py-1.5 rounded-lg transition-colors">
                        <Eye className="h-3 w-3" /> Ack
                      </button>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded-full border capitalize ${
                      a.status === 'open' ? 'bg-red-950 border-red-900 text-red-400' :
                      a.status === 'acknowledged' ? 'bg-yellow-950 border-yellow-900 text-yellow-400' :
                      'bg-gray-800 border-gray-700 text-gray-400'
                    }`}>{a.status}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600 text-right">
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Causal Graph tab ──────────────────────────────────────────────────────────
const SEV_COLOR_MAP: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#60a5fa',
}

function CausalTab() {
  const { data: listData } = useGraphList()
  const graphs = listData?.graphs ?? []
  const [selectedGraph, setSelectedGraph] = useState('')

  // Auto-select first graph
  useEffect(() => {
    if (graphs.length > 0 && !selectedGraph) setSelectedGraph(graphs[0].graph_id)
  }, [graphs, selectedGraph])

  const { data: graphData } = useCausalGraph(selectedGraph)
  const graph = graphData?.graph

  return (
    <div className="flex gap-5 h-[500px]">
      {/* Left: cluster list */}
      <div className="w-64 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Clusters ({graphs.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {graphs.length === 0 ? (
            <div className="p-4 text-xs text-gray-500 text-center">No causal clusters yet</div>
          ) : graphs.map(g => (
            <button key={g.graph_id}
              onClick={() => setSelectedGraph(g.graph_id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${selectedGraph === g.graph_id ? 'bg-gray-800 border-l-2 border-l-blue-500' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-gray-300">{g.graph_id.slice(0, 14)}…</span>
                <span className={`text-xs font-medium ${severityColor(g.max_severity)}`}>{g.max_severity}</span>
              </div>
              <div className="text-xs text-gray-500">
                {g.node_count} nodes · {g.edge_count} edges
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {new Date(g.last_seen).toLocaleTimeString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: DAG renderer */}
      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative">
        {!selectedGraph || !graph ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            {graphs.length === 0 ? 'Causal graphs build automatically as incidents occur' : 'Select a cluster to view'}
          </div>
        ) : (
          <CausalDAG graph={graph} />
        )}
      </div>
    </div>
  )
}

function CausalDAG({ graph }: { graph: { nodes: any[]; edges: any[] } }) {
  if (!graph.nodes.length) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-500">No nodes in this graph</div>
  )

  // Simple vertical layout: causes on left, effects on right
  const causes = graph.nodes.filter(n => n.is_cause)
  const effects = graph.nodes.filter(n => !n.is_cause)
  const NODE_H = 64, NODE_W = 160, GAP = 24, PAD = 40

  const causePositions = causes.map((n, i) => ({ id: n.incident_id, x: PAD, y: PAD + i * (NODE_H + GAP) }))
  const effectPositions = effects.map((n, i) => ({ id: n.incident_id, x: PAD + NODE_W + 120, y: PAD + i * (NODE_H + GAP) }))
  const allPositions = [...causePositions, ...effectPositions]
  const posMap = Object.fromEntries(allPositions.map(p => [p.id, p]))

  const totalH = Math.max(
    causes.length * (NODE_H + GAP) + PAD,
    effects.length * (NODE_H + GAP) + PAD,
    200
  )

  return (
    <svg viewBox={`0 0 ${PAD * 2 + NODE_W * 2 + 120} ${totalH}`} className="w-full h-full">
      {/* Edges */}
      {graph.edges.map((e: any) => {
        const from = posMap[e.cause_id]
        const to = posMap[e.effect_id]
        if (!from || !to) return null
        const x1 = from.x + NODE_W
        const y1 = from.y + NODE_H / 2
        const x2 = to.x
        const y2 = to.y + NODE_H / 2
        const mx = (x1 + x2) / 2
        const opacity = Math.max(0.3, e.confidence)
        return (
          <g key={e.id}>
            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none" stroke="#6366f1" strokeWidth={1 + e.confidence * 2}
              strokeOpacity={opacity} markerEnd="url(#arrow)" />
            <text x={mx} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize="9" fill="#6b7280">
              {(e.confidence * 100).toFixed(0)}%
            </text>
          </g>
        )
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
        </marker>
      </defs>

      {/* Nodes */}
      {graph.nodes.map((n: any) => {
        const pos = posMap[n.incident_id]
        if (!pos) return null
        const col = SEV_COLOR_MAP[n.severity] ?? '#6b7280'
        return (
          <g key={n.incident_id}>
            <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
              rx="8" fill="#111827" stroke={col} strokeWidth="1.5" />
            <rect x={pos.x} y={pos.y} width={4} height={NODE_H} rx="2" fill={col} />
            <text x={pos.x + 12} y={pos.y + 20} fontSize="10" fill="#e5e7eb" fontWeight="600">
              {n.title.slice(0, 20)}{n.title.length > 20 ? '…' : ''}
            </text>
            <text x={pos.x + 12} y={pos.y + 36} fontSize="9" fill="#6b7280">
              {n.agent_id.slice(0, 14)}…
            </text>
            <text x={pos.x + 12} y={pos.y + 52} fontSize="9" fill={col} fontWeight="500">
              {n.severity} · {n.is_cause ? 'ROOT CAUSE' : 'EFFECT'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Predictions tab ───────────────────────────────────────────────────────────
function PredictionsTab({ agents }: { agents: Agent[] }) {
  const [selectedAgent, setSelectedAgent] = useState('')
  const { data: fleetData } = useFleetPredictions(false)
  const { data: agentData } = useAgentPredictions(selectedAgent)
  const predictions = fleetData?.predictions ?? []

  // Group by agent
  const byAgent: Record<string, { h1?: number; h4?: number; h24?: number; critical: boolean }> = {}
  for (const p of predictions) {
    if (!byAgent[p.agent_id]) byAgent[p.agent_id] = { critical: false }
    if (p.horizon === '+1h') byAgent[p.agent_id].h1 = p.predicted_score
    if (p.horizon === '+4h') byAgent[p.agent_id].h4 = p.predicted_score
    if (p.horizon === '+24h') byAgent[p.agent_id].h24 = p.predicted_score
    if (p.is_critical) byAgent[p.agent_id].critical = true
  }

  const criticalCount = Object.values(byAgent).filter(v => v.critical).length

  return (
    <div className="space-y-4">
      {criticalCount > 0 && (
        <div className="bg-red-950 border border-red-900 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">{criticalCount} agent{criticalCount !== 1 ? 's' : ''} trending critical</p>
            <p className="text-xs text-red-500 mt-0.5">OLS regression predicts health scores below 50 within the forecast horizon.</p>
          </div>
        </div>
      )}

      {Object.keys(byAgent).length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <TrendingDown className="h-8 w-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No predictions available yet.</p>
          <p className="text-xs text-gray-600 mt-1">Requires at least 6 health snapshots per agent (collected every 5 min).</p>
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(byAgent).map(([agentId, preds]) => {
            const agentName = agents.find(a => a.id === agentId)?.name ?? agentId.slice(0, 12) + '…'
            const isSelected = selectedAgent === agentId
            const h1 = Math.round(preds.h1 ?? 0)
            const h4 = Math.round(preds.h4 ?? 0)
            const h24 = Math.round(preds.h24 ?? 0)
            return (
              <div key={agentId}
                onClick={() => setSelectedAgent(isSelected ? '' : agentId)}
                className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all ${isSelected ? 'border-blue-500' : preds.critical ? 'border-red-900' : 'border-gray-800 hover:border-gray-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-white">{agentName}</span>
                  {preds.critical && (
                    <span className="text-xs bg-red-950 border border-red-900 text-red-400 px-2 py-0.5 rounded-full">Trending Critical</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '+1h', score: h1 },
                    { label: '+4h', score: h4 },
                    { label: '+24h', score: h24 },
                  ].map(({ label, score }) => (
                    <div key={label} className={`rounded-lg p-3 text-center border ${healthBg(score)}`}>
                      <div className={`text-lg font-bold ${healthColor(score)}`}>{score}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Regression sparkline */}
                {isSelected && agentData?.history && agentData.history.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-xs text-gray-500 mb-2">Health score history + regression trend</p>
                    <RegressionChart
                      history={agentData.history.map(h => ({ t: new Date(h.recorded_at).getTime(), score: h.score }))}
                      predictions={[
                        { t: Date.now() + 3600_000, score: h1 },
                        { t: Date.now() + 4 * 3600_000, score: h4 },
                        { t: Date.now() + 24 * 3600_000, score: h24 },
                      ]}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RegressionChart({ history, predictions }: {
  history: { t: number; score: number }[]
  predictions: { t: number; score: number }[]
}) {
  const all = [...history, ...predictions]
  if (all.length < 2) return null
  const minT = Math.min(...all.map(p => p.t))
  const maxT = Math.max(...all.map(p => p.t))
  const W = 400, H = 60, PAD = 4
  const tRange = maxT - minT || 1

  const toX = (t: number) => PAD + ((t - minT) / tRange) * (W - PAD * 2)
  const toY = (s: number) => H - PAD - (Math.max(0, Math.min(100, s)) / 100) * (H - PAD * 2)

  const histPts = history.map(p => `${toX(p.t)},${toY(p.score)}`).join(' ')
  const predPts = [history[history.length - 1], ...predictions].map(p => `${toX(p.t)},${toY(p.score)}`).join(' ')
  const nowX = toX(Date.now())

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 60 }}>
      {/* Critical threshold line */}
      <line x1={PAD} y1={toY(50)} x2={W - PAD} y2={toY(50)} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="3,3" />
      <text x={PAD + 2} y={toY(50) - 3} fontSize="7" fill="#ef4444">Critical</text>
      {/* Now marker */}
      <line x1={nowX} y1={PAD} x2={nowX} y2={H - PAD} stroke="#6366f1" strokeWidth="0.5" strokeDasharray="2,2" />
      {/* History area */}
      <polyline points={histPts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      {/* Prediction dashed line */}
      <polyline points={predPts} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" />
      {/* Prediction dots */}
      {predictions.map((p, i) => (
        <circle key={i} cx={toX(p.t)} cy={toY(p.score)} r="3"
          fill={p.score < 50 ? '#ef4444' : '#f59e0b'} />
      ))}
    </svg>
  )
}

// ── Topology tab ──────────────────────────────────────────────────────────────
function TopologyTab() {
  const { data, isFetching, refetch } = useTopologyGraph()
  const graph = data?.graph
  const canvasRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Simple force-directed layout computed in JS
  const layout = useForceLayout(graph?.nodes ?? [], graph?.edges ?? [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Health ≥ 80</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Health 50–79</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Health &lt; 50</div>
          <div className="flex items-center gap-1.5"><span className="text-gray-500">Node size = request volume</span></div>
        </div>
        <button onClick={() => refetch()} className="text-gray-500 hover:text-white p-1.5 rounded-lg bg-gray-900 border border-gray-800 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 440 }}>
        {!graph || graph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Network className="h-10 w-10 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No topology data yet.</p>
              <p className="text-xs text-gray-600 mt-1">Agent call graphs appear after multi-agent traces are recorded.</p>
            </div>
          </div>
        ) : (
          <svg ref={canvasRef} className="w-full h-full" viewBox="0 0 800 440">
            {/* Edges */}
            {layout.edges.map((e, i) => {
              const src = layout.positions[e.source]
              const tgt = layout.positions[e.target]
              if (!src || !tgt) return null
              const thickness = Math.min(5, 1 + Math.log1p(e.edge_count))
              return (
                <line key={i}
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="#374151" strokeWidth={thickness} strokeOpacity="0.6"
                  markerEnd="url(#topoArrow)" />
              )
            })}
            <defs>
              <marker id="topoArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#374151" />
              </marker>
            </defs>
            {/* Nodes */}
            {layout.nodes.map(node => {
              const pos = layout.positions[node.agent_id]
              if (!pos) return null
              const r = Math.min(28, Math.max(14, 14 + Math.log1p(node.request_volume) * 2))
              const color = node.health_score >= 80 ? '#10b981' : node.health_score >= 50 ? '#f59e0b' : '#ef4444'
              const isHov = hovered === node.agent_id
              return (
                <g key={node.agent_id}
                  onMouseEnter={() => setHovered(node.agent_id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}>
                  <circle cx={pos.x} cy={pos.y} r={r + (isHov ? 3 : 0)}
                    fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
                  <circle cx={pos.x} cy={pos.y} r={r / 3}
                    fill={color} fillOpacity="0.8" />
                  <text x={pos.x} y={pos.y + r + 14} textAnchor="middle" fontSize="10"
                    fill={isHov ? '#e5e7eb' : '#9ca3af'} fontWeight={isHov ? '600' : '400'}>
                    {node.name.slice(0, 16)}
                  </text>
                  {isHov && (
                    <g>
                      <rect x={pos.x - 60} y={pos.y - r - 50} width={120} height={44} rx="6"
                        fill="#1f2937" stroke="#374151" strokeWidth="1" />
                      <text x={pos.x} y={pos.y - r - 32} textAnchor="middle" fontSize="10" fill="#e5e7eb" fontWeight="600">
                        {node.name}
                      </text>
                      <text x={pos.x} y={pos.y - r - 18} textAnchor="middle" fontSize="9" fill="#6b7280">
                        Health: {node.health_score} · {node.request_volume} req/h · {(node.error_rate * 100).toFixed(1)}% err
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {/* Node list */}
      {graph && graph.nodes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {graph.nodes.map(n => (
            <div key={n.agent_id} className={`bg-gray-900 border rounded-lg p-3 ${hovered === n.agent_id ? 'border-blue-500' : 'border-gray-800'}`}
              onMouseEnter={() => setHovered(n.agent_id)} onMouseLeave={() => setHovered(null)}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-300 truncate">{n.name}</span>
                <span className={`text-xs font-bold ${healthColor(n.health_score)}`}>{n.health_score}</span>
              </div>
              <div className="text-xs text-gray-500">{n.request_volume} req · {(n.error_rate * 100).toFixed(1)}% err</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Force layout hook ─────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }

function useForceLayout(nodes: TopologyNode[], edges: TopologyEdgeData[]) {
  const [positions, setPositions] = useState<Record<string, Vec2>>({})

  useEffect(() => {
    if (nodes.length === 0) { setPositions({}); return }

    const W = 800, H = 440
    const pos: Record<string, Vec2> = {}
    const vel: Record<string, Vec2> = {}

    // Initialize in a circle
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2
      const r = Math.min(W, H) * 0.3
      pos[n.agent_id] = { x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle) }
      vel[n.agent_id] = { x: 0, y: 0 }
    })

    const k = Math.sqrt((W * H) / Math.max(1, nodes.length))
    const repulsion = k * k * 3
    const restLen = k * 1.2
    const damping = 0.8

    let frame = 0
    const SIM_FRAMES = 120

    const step = () => {
      if (frame >= SIM_FRAMES) { setPositions({ ...pos }); return }
      frame++

      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const ai = nodes[i].agent_id
          const aj = nodes[j].agent_id
          const dx = pos[ai].x - pos[aj].x
          const dy = pos[ai].y - pos[aj].y
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
          const force = repulsion / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          vel[ai].x += fx; vel[ai].y += fy
          vel[aj].x -= fx; vel[aj].y -= fy
        }
      }

      // Attraction along edges
      for (const e of edges) {
        const ps = pos[e.source]
        const pt = pos[e.target]
        if (!ps || !pt) continue
        const dx = pt.x - ps.x
        const dy = pt.y - ps.y
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
        const force = (dist - restLen) * 0.05
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        vel[e.source].x += fx; vel[e.source].y += fy
        vel[e.target].x -= fx; vel[e.target].y -= fy
      }

      // Gravity toward center
      for (const n of nodes) {
        vel[n.agent_id].x += (W / 2 - pos[n.agent_id].x) * 0.005
        vel[n.agent_id].y += (H / 2 - pos[n.agent_id].y) * 0.005
      }

      // Apply velocity with damping + boundary clamp
      for (const n of nodes) {
        vel[n.agent_id].x *= damping; vel[n.agent_id].y *= damping
        pos[n.agent_id].x = Math.max(40, Math.min(W - 40, pos[n.agent_id].x + vel[n.agent_id].x))
        pos[n.agent_id].y = Math.max(40, Math.min(H - 60, pos[n.agent_id].y + vel[n.agent_id].y))
      }

      requestAnimationFrame(step)
    }

    const raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [nodes.map(n => n.agent_id).join(','), edges.length])

  return { nodes, edges, positions }
}

// ── Main NEXUS page ───────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'fingerprints', label: 'DNA Fingerprints', icon: Fingerprint },
  { id: 'anomalies',    label: 'Anomaly Feed',     icon: AlertTriangle },
  { id: 'causal',       label: 'Causal Graph',     icon: GitMerge },
  { id: 'predictions',  label: 'Predictions',      icon: TrendingDown },
  { id: 'topology',     label: 'Topology',         icon: Network },
]

export default function Nexus() {
  const [tab, setTab] = useState<Tab>('fingerprints')

  const { data: summary } = useNexusSummary()
  const { data: agentData } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })
  const agents = Array.isArray(agentData) ? agentData : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-600 rounded-xl">
          <Cpu className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">NEXUS</h1>
          <p className="text-xs text-gray-400">Neural Execution Intelligence System · Self-calibrating AI observability</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950 border border-emerald-900 px-3 py-1.5 rounded-full">
          <Activity className="h-3 w-3 animate-pulse" /> Live Intelligence
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <SummaryCard label="Active Anomalies"    value={summary?.active_anomalies ?? '—'}    icon={AlertTriangle} color="bg-red-700"    sub="open z-score events" />
        <SummaryCard label="Critical Forecast"   value={summary?.critical_predictions ?? '—'} icon={TrendingDown}  color="bg-orange-700"  sub="agents trending down" />
        <SummaryCard label="Causal Clusters"     value={summary?.causal_clusters ?? '—'}      icon={GitMerge}     color="bg-blue-700"  sub="incident graphs" />
        <SummaryCard label="Fingerprinted"       value={summary?.agents_fingerprinted ?? '—'} icon={Fingerprint}  color="bg-blue-700"  sub="agents with DNA" />
        <SummaryCard label="Topology Nodes"      value={summary?.topology_nodes ?? '—'}       icon={Network}      color="bg-cyan-700"    sub="live call graph" />
        <SummaryCard label="Topology Edges"      value={summary?.topology_edges ?? '—'}       icon={Zap}          color="bg-teal-700"    sub="agent relationships" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${tab === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            <Icon className="h-4 w-4" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'fingerprints' && <FingerprintsTab agents={agents} />}
        {tab === 'anomalies'    && <AnomaliesTab agents={agents} />}
        {tab === 'causal'       && <CausalTab />}
        {tab === 'predictions'  && <PredictionsTab agents={agents} />}
        {tab === 'topology'     && <TopologyTab />}
      </div>
    </div>
  )
}
