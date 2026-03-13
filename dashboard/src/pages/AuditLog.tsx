import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search, Filter, RefreshCw, Loader2, Shield, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import api from '../services/api'

interface Trace {
  id: string
  agent_id: string
  run_id: string
  trace_id: string
  name: string
  status: string
  duration_ms: number
  attributes: string
  created_at: string
}

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  agent_id: string
  root_cause: string
  created_at: string
}

type EventKind = 'trace' | 'incident'

interface AuditEvent {
  id: string
  kind: EventKind
  actor: string
  action: string
  detail: string
  severity?: string
  status: string
  timestamp: string
}

const SEV_ICON: Record<string, React.ElementType> = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: Info,
  low: Info,
  ok: CheckCircle2,
  error: AlertTriangle,
}

const SEV_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  ok: 'text-emerald-400',
  error: 'text-red-400',
  open: 'text-orange-400',
  resolved: 'text-emerald-400',
}

const KIND_BADGE: Record<EventKind, string> = {
  trace: 'bg-indigo-950 text-indigo-400 border-indigo-900',
  incident: 'bg-red-950 text-red-400 border-red-900',
}

export default function AuditLog() {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<EventKind | 'all'>('all')

  const { data: tracesRaw, isFetching: tFetch, refetch: refetchTraces } = useQuery<Trace[]>({
    queryKey: ['audit-traces'],
    queryFn: async () => { const { data } = await api.get('/traces'); return data ?? [] },
    refetchInterval: 20_000,
  })

  const { data: incidentsRaw, isFetching: iFetch, refetch: refetchIncidents } = useQuery<Incident[]>({
    queryKey: ['audit-incidents'],
    queryFn: async () => { const { data } = await api.get('/incidents'); return data ?? [] },
    refetchInterval: 20_000,
  })

  const traces: Trace[] = Array.isArray(tracesRaw) ? tracesRaw : []
  const incidents: Incident[] = Array.isArray(incidentsRaw) ? incidentsRaw : []

  const events: AuditEvent[] = [
    ...traces.map(t => ({
      id: t.id ?? '',
      kind: 'trace' as EventKind,
      actor: (t.agent_id ?? '').slice(0, 12) + '…',
      action: t.name ?? '(unnamed)',
      detail: `run_id: ${(t.run_id ?? '').slice(0, 12)}`,
      severity: t.status,
      status: t.status,
      timestamp: t.created_at,
    })),
    ...incidents.map(i => ({
      id: i.id ?? '',
      kind: 'incident' as EventKind,
      actor: (i.agent_id ?? '').slice(0, 12) + '…',
      action: i.title ?? '(untitled)',
      detail: i.root_cause?.slice(0, 80) ?? '',
      severity: i.severity,
      status: i.status,
      timestamp: i.created_at,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const filtered = events.filter(e => {
    if (kindFilter !== 'all' && e.kind !== kindFilter) return false
    if (search && !e.action.toLowerCase().includes(search.toLowerCase()) && !e.actor.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const isLoading = tFetch || iFetch

  const handleRefresh = () => { refetchTraces(); refetchIncidents() }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">Chronological record of all agent activity and incidents</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield className="h-4 w-4 text-indigo-400" />
          <span>{events.length} events indexed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search actions or agents…"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <Filter className="h-3.5 w-3.5 text-gray-500 mx-1" />
          {(['all', 'trace', 'incident'] as const).map(k => (
            <button key={k} onClick={() => setKindFilter(k)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${kindFilter === k ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {k}
            </button>
          ))}
        </div>
        <button onClick={handleRefresh} className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg bg-gray-900 border border-gray-800">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: events.length },
          { label: 'Traces', value: traces.length },
          { label: 'Incidents', value: incidents.length },
          { label: 'Errors', value: events.filter(e => e.status === 'error' || e.severity === 'critical').length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Event stream */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Event Stream</h2>
          <span className="ml-auto text-xs text-gray-500">{filtered.length} results</span>
        </div>

        {isLoading && events.length === 0 ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">No events match your filters</div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-[60vh] overflow-y-auto">
            {filtered.map(evt => {
              const Icon = SEV_ICON[evt.severity ?? ''] ?? Info
              return (
                <div key={`${evt.kind}-${evt.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-800/50 transition-colors">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${SEV_COLOR[evt.severity ?? ''] ?? 'text-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 text-xs rounded border ${KIND_BADGE[evt.kind]}`}>{evt.kind}</span>
                      <span className="text-xs font-medium text-gray-200 truncate">{evt.action}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Agent: <span className="font-mono text-gray-400">{evt.actor}</span></span>
                      {evt.detail && <span className="text-gray-600">· {evt.detail}</span>}
                      <span className={`${SEV_COLOR[evt.status] ?? 'text-gray-500'}`}>· {evt.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 flex-shrink-0 text-right">
                    <div>{new Date(evt.timestamp).toLocaleDateString()}</div>
                    <div>{new Date(evt.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
