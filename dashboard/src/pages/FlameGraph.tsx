import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, ChevronRight, ChevronDown, Clock, AlertCircle } from 'lucide-react'
import api from '../services/api'

type FlameNode = {
  id: string
  name: string
  duration_ms: number
  status: string
  agent_id: string
  cost_usd: number
  tokens: number
  children: FlameNode[]
}

type TraceRow = {
  trace_id: string
  agent_id: string
  span_count: number
  start_time: string
}

type FlameData = {
  trace_id: string
  span_count: number
  total_dur_ms: number
  roots: FlameNode[]
}

function SpanBar({ node, totalMs, depth }: { node: FlameNode; totalMs: number; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const widthPct = totalMs > 0 ? Math.max(0.5, (node.duration_ms / totalMs) * 100) : 100
  const isError = node.status === 'error'

  const colors = [
    'bg-indigo-600', 'bg-purple-600', 'bg-cyan-600',
    'bg-teal-600', 'bg-blue-600', 'bg-violet-600',
  ]
  const color = isError ? 'bg-red-600' : colors[depth % colors.length]

  return (
    <div className="text-xs">
      <div className="flex items-center gap-1 mb-0.5 hover:bg-gray-800/60 rounded px-1 py-0.5 cursor-pointer"
        onClick={() => setOpen(o => !o)}>
        <div style={{ width: depth * 16 }} className="flex-shrink-0" />
        {node.children.length > 0 ? (
          open ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />
        ) : <div className="w-3" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-gray-200 truncate font-mono ${isError ? 'text-red-400' : ''}`}>{node.name}</span>
            <span className="text-gray-600 flex-shrink-0">{node.duration_ms}ms</span>
            {isError && <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
          </div>
          <div className="relative h-4 bg-gray-800 rounded overflow-hidden">
            <div className={`absolute left-0 top-0 h-full rounded opacity-80 transition-all ${color}`}
              style={{ width: `${widthPct}%` }} />
          </div>
        </div>
        <div className="text-gray-600 flex-shrink-0 ml-2">{node.agent_id.slice(0, 12)}</div>
      </div>
      {open && node.children.map(child => (
        <SpanBar key={child.id} node={child} totalMs={totalMs} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function FlameGraph() {
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null)

  const { data: traces = [] } = useQuery<TraceRow[]>({
    queryKey: ['flame-traces'],
    queryFn: async () => {
      const { data } = await api.get('/flame')
      return Array.isArray(data) ? data : []
    },
  })

  const { data: flame, isLoading } = useQuery<FlameData>({
    queryKey: ['flame-graph', selectedTrace],
    queryFn: async () => {
      const { data } = await api.get(`/flame/${selectedTrace}`)
      return data
    },
    enabled: !!selectedTrace,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Live Flame Graph</h1>
          <p className="text-sm text-gray-500">Hierarchical span visualization — drill down into every agent call</p>
        </div>
      </div>

      {/* Trace selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-sm font-medium text-white">Select Trace</div>
        {traces.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">No traces found. Ingest some traces first.</div>
        )}
        <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
          {traces.map(t => (
            <button key={t.trace_id} onClick={() => setSelectedTrace(t.trace_id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors
                ${selectedTrace === t.trace_id ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : ''}`}>
              <Flame className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 font-mono truncate">{t.trace_id}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.agent_id} · {t.span_count} spans</div>
              </div>
              <div className="text-xs text-gray-600">{new Date(t.start_time).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Flame graph */}
      {isLoading && (
        <div className="p-8 text-center text-gray-500 text-sm">Loading spans…</div>
      )}
      {flame && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="text-sm font-medium text-white font-mono">{flame.trace_id}</div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {flame.total_dur_ms}ms total</span>
              <span>{flame.span_count} spans</span>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            {flame.roots.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">No span data for this trace</div>
            ) : (
              <div className="min-w-[600px]">
                {flame.roots.map(root => (
                  <SpanBar key={root.id} node={root} totalMs={flame.total_dur_ms} depth={0} />
                ))}
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 px-4 pb-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-600" /> Error span</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-indigo-600" /> Root span</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-600" /> Child span</div>
            <span>Bar width = relative duration</span>
          </div>
        </div>
      )}
    </div>
  )
}
