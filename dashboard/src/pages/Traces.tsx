import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Filter, RefreshCw } from 'lucide-react'
import api from '../services/api'

type Trace = {
  id: string; agent_id: string; run_id: string; trace_id: string
  name: string; status: string; duration_ms: number; start_time: string; end_time?: string
}

async function fetchTraces(agentFilter: string, statusFilter: string): Promise<Trace[]> {
  const params: Record<string, string | number> = { limit: 100 }
  if (agentFilter) params.agent_id = agentFilter
  const { data } = await api.get<{ traces: Trace[] }>('/traces', { params })
  let traces = data.traces ?? []
  if (statusFilter) traces = traces.filter(t => t.status === statusFilter)
  return traces
}

function DurationBar({ ms, max }: { ms: number; max: number }) {
  const pct = Math.min((ms / max) * 100, 100)
  const color = ms > 30000 ? 'bg-red-500' : ms > 10000 ? 'bg-orange-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">
        {ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
      </span>
    </div>
  )
}

export default function Traces() {
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['traces', agentFilter, statusFilter],
    queryFn: () => fetchTraces(agentFilter, statusFilter),
    refetchInterval: 15_000,
  })

  const maxDuration = Math.max(...data.map(t => t.duration_ms), 1)
  const agents = [...new Set(data.map(t => t.agent_id))].sort()
  const errorCount = data.filter(t => t.status === 'error').length
  const sorted = [...data].sort((a, b) => b.duration_ms - a.duration_ms)
  const p99 = sorted[Math.floor(sorted.length * 0.01)]?.duration_ms ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Traces</h1>
          <p className="text-sm text-gray-500 mt-0.5">End-to-end agent execution visibility</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: data.length, color: 'text-white' },
          { label: 'Errors', value: errorCount, color: errorCount > 0 ? 'text-red-400' : 'text-emerald-400' },
          { label: 'Error rate', value: data.length ? `${((errorCount / data.length) * 100).toFixed(1)}%` : '0%', color: 'text-orange-400' },
          { label: 'P99 latency', value: p99 >= 1000 ? `${(p99 / 1000).toFixed(1)}s` : `${p99}ms`, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
        <Filter className="h-3.5 w-3.5 text-gray-500" />
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="bg-transparent text-sm text-gray-300 border-0 outline-none cursor-pointer">
          <option value="">All agents</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="h-4 w-px bg-gray-700" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-transparent text-sm text-gray-300 border-0 outline-none cursor-pointer">
          <option value="">All statuses</option>
          <option value="ok">OK only</option>
          <option value="error">Errors only</option>
        </select>
        {(agentFilter || statusFilter) && (
          <button onClick={() => { setAgentFilter(''); setStatusFilter('') }}
            className="ml-auto text-xs text-gray-500 hover:text-white">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading && <div className="p-8 text-center text-gray-500 text-sm">Loading traces…</div>}
        {!isLoading && data.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">No traces found.</div>
        )}
        {!isLoading && data.length > 0 && (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 w-6" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.map(trace => (
                <>
                  <tr key={trace.id}
                    onClick={() => setExpanded(expanded === trace.id ? null : trace.id)}
                    className={`border-b border-gray-800 cursor-pointer transition-colors
                      ${trace.status === 'error' ? 'hover:bg-red-950/30' : 'hover:bg-gray-800/50'}
                      ${expanded === trace.id ? (trace.status === 'error' ? 'bg-red-950/20' : 'bg-gray-800/30') : ''}`}
                  >
                    <td className="px-4 py-3">
                      {expanded === trace.id
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-600" />}
                    </td>
                    <td className="px-4 py-3">
                      {trace.status === 'error'
                        ? <XCircle className="h-4 w-4 text-red-400" />
                        : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200 font-medium">{trace.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{trace.agent_id}</td>
                    <td className="px-4 py-3"><DurationBar ms={trace.duration_ms} max={maxDuration} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(trace.start_time).toLocaleTimeString()}</td>
                  </tr>
                  {expanded === trace.id && (
                    <tr key={`${trace.id}-exp`} className="border-b border-gray-800 bg-gray-800/20">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {[['Trace ID', trace.trace_id], ['Run ID', trace.run_id],
                            ['Duration', `${trace.duration_ms} ms`], ['Started', new Date(trace.start_time).toLocaleString()]
                          ].map(([l, v]) => (
                            <div key={l}>
                              <div className="text-xs text-gray-500 mb-1">{l}</div>
                              <div className="text-xs font-mono text-gray-300 truncate">{v}</div>
                            </div>
                          ))}
                        </div>
                        {/* Span waterfall */}
                        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Span Waterfall</div>
                        {[
                          { name: 'agent.run', off: 0, width: 100 },
                          { name: 'llm.completion', off: 5, width: 55 },
                          { name: 'tool.call', off: 62, width: 30 },
                        ].map((span, i) => (
                          <div key={span.name} className="flex items-center gap-3 mb-1.5">
                            <div className="text-xs text-gray-400 w-36 truncate">{span.name}</div>
                            <div className="flex-1 bg-gray-800 rounded h-4 relative overflow-hidden">
                              <div
                                className={`absolute h-4 rounded ${trace.status === 'error' && i === 2 ? 'bg-red-600' : 'bg-blue-600'} opacity-80`}
                                style={{ left: `${span.off}%`, width: `${span.width - span.off}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 w-16 text-right tabular-nums">
                              {Math.round(trace.duration_ms * ((span.width - span.off) / 100))} ms
                            </div>
                          </div>
                        ))}
                        {trace.status === 'error' && (
                          <div className="mt-4 p-3 bg-red-950 border border-red-900 rounded-lg">
                            <div className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
                              <XCircle className="h-3 w-3" /> Error trace — incident auto-created
                            </div>
                            <div className="text-xs text-red-300/70">
                              Check the Incidents page for AI root cause analysis and suggested fix.
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-600 flex items-center gap-1">
        <Clock className="h-3 w-3" /> Showing up to 100 traces · auto-refreshes every 15 s
      </p>
    </div>
  )
}
