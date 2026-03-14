import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ScrollText, Search, RefreshCw, Loader2,
  LogIn, LogOut, Eye, Edit, Trash2, Plus, Shield, Zap, AlertTriangle,
} from 'lucide-react'
import api from '../services/api'

interface AuditEntry {
  id: string
  user_id: string
  user_email: string
  user_role: string
  action: string
  resource: string
  resource_id: string
  method: string
  path: string
  status_code: number
  ip_address: string
  user_agent: string
  detail: string
  created_at: string
}

const METHOD_COLOR: Record<string, string> = {
  GET:    'bg-blue-900/50 text-blue-300',
  POST:   'bg-emerald-900/50 text-emerald-300',
  PATCH:  'bg-yellow-900/50 text-yellow-300',
  PUT:    'bg-yellow-900/50 text-yellow-300',
  DELETE: 'bg-red-900/50 text-red-300',
}

const STATUS_COLOR = (code: number) => {
  if (code >= 500) return 'text-red-400'
  if (code >= 400) return 'text-orange-400'
  if (code >= 200) return 'text-emerald-400'
  return 'text-gray-400'
}

const ACTION_ICON: Record<string, React.ElementType> = {
  'auth.login':  LogIn,
  'auth.logout': LogOut,
  'agents.list': Eye,
  'agents.read': Eye,
  'agents.create': Plus,
  'agents.update': Edit,
  'agents.delete': Trash2,
  'traces.list': Eye,
  'traces.create': Plus,
  'incidents.list': Eye,
  'incidents.create': AlertTriangle,
  'nexus.list': Zap,
}

const RESOURCES = ['', 'auth', 'agents', 'traces', 'incidents', 'nexus', 'audit', 'deployments', 'intelligence']

export default function AuditLog() {
  const [search, setSearch] = useState('')
  const [resource, setResource] = useState('')

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['audit', resource],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '200' }
      if (resource) params.resource = resource
      const { data } = await api.get('/audit', { params })
      return data as { entries: AuditEntry[]; total: number }
    },
    refetchInterval: 10_000,
  })

  const entries: AuditEntry[] = Array.isArray(data?.entries) ? data!.entries : []
  const total = data?.total ?? 0

  const filtered = search
    ? entries.filter(e =>
        e.action.includes(search) ||
        e.user_email.includes(search) ||
        e.path.includes(search) ||
        e.resource.includes(search)
      )
    : entries

  // Summary counts
  const loginCount  = entries.filter(e => e.action === 'auth.login').length
  const writeCount  = entries.filter(e => ['POST','PUT','PATCH','DELETE'].includes(e.method)).length
  const errorCount  = entries.filter(e => e.status_code >= 400).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every user action, automatically captured</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Events',   value: total,       color: 'text-indigo-400', icon: ScrollText },
          { label: 'Logins',         value: loginCount,  color: 'text-emerald-400', icon: LogIn },
          { label: 'Write Actions',  value: writeCount,  color: 'text-yellow-400', icon: Edit },
          { label: 'Errors (4xx/5xx)', value: errorCount, color: 'text-red-400',  icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            placeholder="Search by action, user, path…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select value={resource} onChange={e => setResource(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500">
          {RESOURCES.map(r => (
            <option key={r} value={r}>{r || 'All Resources'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-medium text-white">Events</span>
            <span className="text-xs text-gray-500 ml-1">{filtered.length} shown · {total} total</span>
          </div>
          {isFetching && <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin" />}
        </div>

        {filtered.length === 0 && !isFetching && (
          <div className="p-12 text-center">
            <ScrollText className="h-8 w-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No audit events yet — they appear as you use the app</p>
          </div>
        )}

        <div className="divide-y divide-gray-800/60">
          {filtered.map(e => {
            const Icon = ACTION_ICON[e.action] ?? Eye
            const detail = (() => { try { return JSON.parse(e.detail) } catch { return null } })()
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors">
                {/* Icon */}
                <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-200">{e.action}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${METHOD_COLOR[e.method] ?? 'bg-gray-800 text-gray-400'}`}>
                      {e.method}
                    </span>
                    <span className={`text-xs font-mono ${STATUS_COLOR(e.status_code)}`}>{e.status_code}</span>
                    {e.resource && (
                      <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{e.resource}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-indigo-400">{e.user_email || 'system'}</span>
                    <span className="text-xs text-gray-600 font-mono truncate max-w-xs">{e.path}</span>
                    {e.ip_address && <span className="text-xs text-gray-600">{e.ip_address}</span>}
                    {detail && Object.keys(detail).length > 0 && (
                      <span className="text-xs text-gray-600">{JSON.stringify(detail).slice(0, 80)}</span>
                    )}
                  </div>
                </div>

                {/* Timestamp + role */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-gray-500">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(e.created_at).toLocaleDateString()}
                  </div>
                  {e.user_role && (
                    <span className="text-xs text-gray-600">{e.user_role}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
