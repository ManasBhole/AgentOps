import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Siren, CheckCircle2, ChevronDown, ChevronRight,
  Lightbulb, Filter, RefreshCw, ShieldCheck, Radio,
} from 'lucide-react'
import api from '../services/api'
import ExportButton from '../components/ExportButton'

type Incident = {
  id: string; title: string; severity: string; status: string
  agent_id: string; trace_id: string; root_cause: string
  suggested_fix: string; confidence: number; created_at: string; resolved_at?: string
}

const SEV: Record<string, { border: string; bg: string; badge: string; dot: string }> = {
  critical: { border: 'border-red-900',    bg: 'bg-red-950/40',    badge: 'bg-red-900 text-red-300',    dot: 'bg-red-400' },
  high:     { border: 'border-orange-900', bg: 'bg-orange-950/30', badge: 'bg-orange-900 text-orange-300', dot: 'bg-orange-400' },
  medium:   { border: 'border-yellow-900', bg: 'bg-yellow-950/20', badge: 'bg-yellow-900 text-yellow-300', dot: 'bg-yellow-400' },
  low:      { border: 'border-blue-900',   bg: 'bg-blue-950/20',   badge: 'bg-blue-900 text-blue-300',   dot: 'bg-blue-400' },
}
const fallbackSev = { border: 'border-gray-800', bg: '', badge: 'bg-gray-800 text-gray-300', dot: 'bg-gray-400' }

const STATUS: Record<string, string> = {
  open:          'bg-red-900/60 text-red-300',
  investigating: 'bg-yellow-900/60 text-yellow-300',
  resolved:      'bg-emerald-900/60 text-emerald-300',
}

export default function Incidents() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [sevFilter, setSevFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: all = [], isLoading, refetch, isFetching } = useQuery<Incident[]>({
    queryKey: ['incidents'],
    queryFn: async () => {
      const { data } = await api.get<{ incidents: Incident[] }>('/incidents', { params: { limit: 100 } })
      return data.incidents ?? []
    },
    refetchInterval: 15_000,
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/incidents/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const data = all.filter(i => {
    if (statusFilter && i.status !== statusFilter) return false
    if (sevFilter && i.severity !== sevFilter) return false
    return true
  })

  const openCount = all.filter(i => i.status !== 'resolved').length
  const critCount = all.filter(i => i.severity === 'critical' && i.status !== 'resolved').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Incidents</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered root cause analysis · auto-remediation suggestions</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={all.map(i => ({ id: i.id, title: i.title, severity: i.severity, status: i.status, agent_id: i.agent_id, created_at: i.created_at, resolved_at: i.resolved_at ?? '' }))}
            filename="incidents"
          />
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: all.length,    color: 'text-white' },
          { label: 'Open',     value: openCount,     color: openCount > 0 ? 'text-red-400' : 'text-emerald-400' },
          { label: 'Critical', value: critCount,     color: critCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Resolved', value: all.length - openCount, color: 'text-emerald-400' },
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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-transparent text-sm text-gray-300 border-0 outline-none cursor-pointer">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
        <div className="h-4 w-px bg-gray-700" />
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
          className="bg-transparent text-sm text-gray-300 border-0 outline-none cursor-pointer">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(statusFilter || sevFilter) && (
          <button onClick={() => { setStatusFilter(''); setSevFilter('') }}
            className="ml-auto text-xs text-gray-500 hover:text-white">Clear</button>
        )}
      </div>

      {/* Incident list */}
      <div className="space-y-2">
        {isLoading && <div className="p-8 text-center text-gray-500 text-sm">Loading incidents…</div>}
        {!isLoading && data.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
            No incidents found.
          </div>
        )}
        {data.map(inc => {
          const s = SEV[inc.severity] ?? fallbackSev
          const isOpen = expanded === inc.id
          return (
            <div key={inc.id} className={`border rounded-xl overflow-hidden transition-all ${s.border} ${s.bg}`}>
              {/* Row header */}
              <button
                onClick={() => setExpanded(isOpen ? null : inc.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-100 truncate">{inc.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{inc.severity}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[inc.status] ?? 'bg-gray-800 text-gray-300'}`}>{inc.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{inc.agent_id} · {new Date(inc.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {inc.status !== 'resolved' && (
                    <button
                      onClick={e => { e.stopPropagation(); resolveMutation.mutate(inc.id) }}
                      disabled={resolveMutation.isPending}
                      className="flex items-center gap-1 text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3 w-3" /> Resolve
                    </button>
                  )}
                  {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4 space-y-4 bg-gray-900/50">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[['Incident ID', inc.id], ['Trace ID', inc.trace_id || '—'],
                      ['Confidence', `${Math.round(inc.confidence * 100)}%`],
                      ['Resolved', inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : '—'],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div className="text-xs text-gray-500 mb-1">{l}</div>
                        <div className="text-xs font-mono text-gray-300 truncate">{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Root cause */}
                  <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Siren className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Root Cause</span>
                      <span className="ml-auto text-xs text-gray-500">
                        {Math.round(inc.confidence * 100)}% confidence
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1 mb-2">
                      <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${inc.confidence * 100}%` }} />
                    </div>
                    <p className="text-sm text-gray-200">{inc.root_cause || 'No root cause identified yet.'}</p>
                  </div>

                  {/* Suggested fix */}
                  {inc.suggested_fix && (
                    <div className="p-3 bg-emerald-950 rounded-lg border border-emerald-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Suggested Fix</span>
                      </div>
                      <p className="text-sm text-emerald-200/80">{inc.suggested_fix}</p>
                    </div>
                  )}

                  {inc.status === 'resolved' && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolved {inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : ''}
                    </div>
                  )}

                  {/* War Room link */}
                  <div className="flex justify-end pt-1">
                    <Link
                      to={`/warroom/${inc.id}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-950 border border-indigo-800 hover:bg-indigo-900 text-indigo-300 rounded-lg transition-colors"
                    >
                      <Radio className="h-3 w-3" /> Open War Room
                    </Link>
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
