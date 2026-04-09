import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, Plus, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import api from '../services/api'

type Agent = { id: string; name: string; type: string; status: string }
type AgentMetrics = {
  agent_id: string; agent_name: string; agent_type: string; agent_status: string
  traces_24h: number; errors_24h: number; error_rate_pct: number
  avg_latency_ms: number; p95_latency_ms: number
  cost_7d_usd: number; cost_30d_usd: number
  uptime_30d_pct: number; open_incidents: number
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-900/60 text-emerald-300',
  paused: 'bg-yellow-900/60 text-yellow-300',
  error: 'bg-red-900/60 text-red-300',
}

function Delta({ values, idx, higherIsBetter = false }: { values: number[]; idx: number; higherIsBetter?: boolean }) {
  const valid = values.filter(v => v > 0)
  if (valid.length < 2) return null
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const v = values[idx]
  if (v === 0) return null
  const diff = ((v - avg) / avg) * 100
  const isBetter = higherIsBetter ? diff > 0 : diff < 0
  if (Math.abs(diff) < 1) return <Minus className="h-3 w-3 text-gray-500 inline ml-1" />
  return isBetter
    ? <TrendingDown className="h-3 w-3 text-emerald-400 inline ml-1" />
    : <TrendingUp className="h-3 w-3 text-red-400 inline ml-1" />
}

function MetricRow({ label, values, fmt, higherIsBetter }: {
  label: string; values: number[]; fmt: (v: number) => string; higherIsBetter?: boolean
}) {
  if (values.length === 0) return null
  const max = Math.max(...values)
  return (
    <tr className="border-b border-gray-800">
      <td className="py-2.5 px-3 text-xs text-gray-400 font-medium whitespace-nowrap">{label}</td>
      {values.map((v, i) => {
        const isMax = v === max
        const highlight = higherIsBetter ? (isMax ? 'text-emerald-400' : 'text-white') : (v === Math.min(...values) ? 'text-emerald-400' : 'text-white')
        return (
          <td key={i} className={`py-2.5 px-3 text-sm font-semibold text-center ${highlight}`}>
            {fmt(v)}
            <Delta values={values} idx={i} higherIsBetter={higherIsBetter} />
          </td>
        )
      })}
    </tr>
  )
}

export default function AgentComparison() {
  const [selectedIDs, setSelectedIDs] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })

  const { data: comparison, isLoading } = useQuery<{ agents: AgentMetrics[] }>({
    queryKey: ['agent-compare', selectedIDs],
    queryFn: async () => { const { data } = await api.get('/agents/compare', { params: { ids: selectedIDs.join(',') } }); return data },
    enabled: selectedIDs.length >= 2,
  })

  const filtered = agents.filter(a =>
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.id.includes(search)) &&
    !selectedIDs.includes(a.id)
  )

  const addAgent = (id: string) => {
    if (selectedIDs.length < 5) setSelectedIDs(prev => [...prev, id])
  }
  const removeAgent = (id: string) => setSelectedIDs(prev => prev.filter(x => x !== id))

  const metrics = comparison?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-indigo-400" />
          Agent Comparison
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Select 2–5 agents to compare side-by-side</p>
      </div>

      {/* Agent selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {selectedIDs.map(id => {
            const ag = agents.find(a => a.id === id)
            return (
              <span key={id} className="flex items-center gap-1.5 bg-indigo-900/50 border border-indigo-700 text-indigo-300 text-xs px-2.5 py-1 rounded-full">
                {ag?.name ?? id}
                <button onClick={() => removeAgent(id)} className="hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {selectedIDs.length < 5 && (
            <span className="text-xs text-gray-600">{selectedIDs.length === 0 ? 'No agents selected' : `${5 - selectedIDs.length} more slots`}</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents to add..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        {search && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-gray-500">No agents found</div>
            ) : filtered.map(a => (
              <button
                key={a.id}
                onClick={() => { addAgent(a.id); setSearch('') }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center justify-between group"
              >
                <div>
                  <div className="text-sm text-white">{a.name}</div>
                  <div className="text-xs text-gray-500">{a.type} · {a.id}</div>
                </div>
                <Plus className="h-4 w-4 text-gray-500 group-hover:text-indigo-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comparison table */}
      {selectedIDs.length < 2 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <GitCompare className="h-10 w-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Select at least 2 agents above to see a comparison</p>
        </div>
      ) : isLoading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">Loading metrics…</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-3 text-left text-xs text-gray-500 font-medium w-36">Metric</th>
                {metrics.map(m => (
                  <th key={m.agent_id} className="py-3 px-3 text-center min-w-[140px]">
                    <div className="text-white font-semibold text-xs">{m.agent_name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{m.agent_type}</div>
                    <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${STATUS_STYLES[m.agent_status] ?? 'bg-gray-800 text-gray-400'}`}>
                      {m.agent_status}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Traces (24h)" values={metrics.map(m => m.traces_24h)} fmt={v => v.toLocaleString()} higherIsBetter />
              <MetricRow label="Error Rate" values={metrics.map(m => m.error_rate_pct)} fmt={v => `${v.toFixed(1)}%`} />
              <MetricRow label="Avg Latency" values={metrics.map(m => m.avg_latency_ms)} fmt={v => `${v.toFixed(0)} ms`} />
              <MetricRow label="P95 Latency" values={metrics.map(m => m.p95_latency_ms)} fmt={v => `${v.toFixed(0)} ms`} />
              <MetricRow label="Cost (7d)" values={metrics.map(m => m.cost_7d_usd)} fmt={v => `$${v.toFixed(4)}`} />
              <MetricRow label="Cost (30d)" values={metrics.map(m => m.cost_30d_usd)} fmt={v => `$${v.toFixed(4)}`} />
              <MetricRow label="Uptime (30d)" values={metrics.map(m => m.uptime_30d_pct)} fmt={v => `${v.toFixed(1)}%`} higherIsBetter />
              <MetricRow label="Open Incidents" values={metrics.map(m => m.open_incidents)} fmt={v => v.toString()} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
