import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitMerge, ShieldCheck, RefreshCw, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../services/api'

type AlertCluster = {
  id: string
  label: string
  pattern: string
  incident_ids: string
  anomaly_ids: string
  agent_ids: string
  confidence: number
  severity: string
  count: number
  first_seen: string
  last_seen: string
  status: string
  created_at: string
}

type CorrelationResult = {
  clusters: (AlertCluster & { incidents: unknown[]; anomalies: unknown[] })[]
  count: number
}

const SEV_STYLE: Record<string, { badge: string; border: string; bg: string; dot: string }> = {
  critical: { badge: 'bg-red-900 text-red-300', border: 'border-red-900', bg: 'bg-red-950/30', dot: 'bg-red-400' },
  high:     { badge: 'bg-orange-900 text-orange-300', border: 'border-orange-900', bg: 'bg-orange-950/20', dot: 'bg-orange-400' },
  medium:   { badge: 'bg-yellow-900 text-yellow-300', border: 'border-yellow-900', bg: 'bg-yellow-950/20', dot: 'bg-yellow-400' },
  low:      { badge: 'bg-blue-900 text-blue-300', border: 'border-blue-900', bg: 'bg-blue-950/20', dot: 'bg-blue-400' },
}
const fallbackSev = { badge: 'bg-gray-800 text-gray-300', border: 'border-gray-800', bg: '', dot: 'bg-gray-400' }

function parseIds(json: string): string[] {
  try { return JSON.parse(json) ?? [] } catch { return [] }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0)
  const color = value >= 0.8 ? 'bg-red-500' : value >= 0.6 ? 'bg-orange-400' : 'bg-yellow-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-700 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400">{pct}%</span>
    </div>
  )
}

export default function AlertCorrelation() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: clusters = [], isLoading, refetch, isFetching } = useQuery<AlertCluster[]>({
    queryKey: ['alert-clusters'],
    queryFn: async () => {
      const { data } = await api.get('/alerts/clusters')
      return Array.isArray(data) ? data : []
    },
    refetchInterval: 30_000,
  })

  const correlateMutation = useMutation<CorrelationResult>({
    mutationFn: async () => {
      const { data } = await api.post('/alerts/correlate')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-clusters'] }),
  })

  const suppressMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/clusters/${id}/suppress`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-clusters'] }),
  })

  const activeClusters = clusters.filter(c => c.status === 'active')
  const suppressedCount = clusters.filter(c => c.status === 'suppressed').length
  const criticalCount = activeClusters.filter(c => c.severity === 'critical').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-pink-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Smart Alert Correlation</h1>
            <p className="text-sm text-gray-500">Automatically cluster related alerts to reduce noise and find root causes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={() => correlateMutation.mutate()}
            disabled={correlateMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pink-700 hover:bg-pink-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {correlateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
            Run Correlation
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Active clusters', value: activeClusters.length, color: activeClusters.length > 0 ? 'text-orange-400' : 'text-emerald-400' },
          { label: 'Critical clusters', value: criticalCount, color: criticalCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Suppressed', value: suppressedCount, color: 'text-gray-400' },
          { label: 'Total alerts', value: activeClusters.reduce((s, c) => s + c.count, 0), color: 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Correlation result hint */}
      {correlateMutation.isSuccess && correlateMutation.data && (
        <div className="flex items-center gap-2 p-3 bg-emerald-950 border border-emerald-900 rounded-lg text-sm text-emerald-400">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          Found {correlateMutation.data.count} correlation cluster{correlateMutation.data.count !== 1 ? 's' : ''}
        </div>
      )}

      {/* Cluster list */}
      {isLoading && <div className="p-8 text-center text-gray-500 text-sm">Loading clusters…</div>}
      {!isLoading && activeClusters.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
          No active clusters. Click "Run Correlation" to scan recent incidents and anomalies.
        </div>
      )}
      <div className="space-y-2">
        {activeClusters.map(cluster => {
          const s = SEV_STYLE[cluster.severity] ?? fallbackSev
          const isOpen = expanded === cluster.id
          const incIDs = parseIds(cluster.incident_ids)
          const anIDs = parseIds(cluster.anomaly_ids)
          const agentIDs = parseIds(cluster.agent_ids)
          return (
            <div key={cluster.id} className={`border rounded-xl overflow-hidden ${s.border} ${s.bg}`}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isOpen ? null : cluster.id)}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-100">{cluster.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{cluster.severity}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{cluster.count} alerts</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{cluster.pattern}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <ConfidenceBar value={cluster.confidence} />
                  <button
                    onClick={e => { e.stopPropagation(); suppressMutation.mutate(cluster.id) }}
                    className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                    title="Suppress this cluster"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4 bg-gray-900/50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Incidents ({incIDs.length})</div>
                      <div className="space-y-1">
                        {incIDs.slice(0, 5).map(id => (
                          <div key={id} className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded truncate">{id}</div>
                        ))}
                        {incIDs.length > 5 && <div className="text-xs text-gray-600">+{incIDs.length - 5} more</div>}
                        {incIDs.length === 0 && <div className="text-xs text-gray-600">None</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Anomalies ({anIDs.length})</div>
                      <div className="space-y-1">
                        {anIDs.slice(0, 5).map(id => (
                          <div key={id} className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded truncate">{id}</div>
                        ))}
                        {anIDs.length > 5 && <div className="text-xs text-gray-600">+{anIDs.length - 5} more</div>}
                        {anIDs.length === 0 && <div className="text-xs text-gray-600">None</div>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Affected Agents</div>
                    <div className="flex flex-wrap gap-1.5">
                      {agentIDs.map(id => (
                        <span key={id} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full font-mono">{id}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>First seen: {new Date(cluster.first_seen).toLocaleString()}</span>
                    <span>Last seen: {new Date(cluster.last_seen).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
