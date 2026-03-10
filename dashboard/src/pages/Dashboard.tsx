import { useQuery } from '@tanstack/react-query'
import {
  Bot, Siren, GitBranch, TrendingUp, TrendingDown,
  Zap, Clock, CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Link } from 'react-router-dom'
import api from '../services/api'

type Stats = {
  total_agents: number; active_agents: number
  active_incidents: number; total_traces: number
  error_traces: number; avg_latency_ms: number; error_rate: number
}
type Trace = { id: string; agent_id: string; name: string; status: string; duration_ms: number; start_time: string }
type Incident = { id: string; title: string; severity: string; status: string; agent_id: string; created_at: string }

function buildHourlyChart(traces: Trace[]) {
  const map: Record<string, { ok: number; error: number }> = {}
  traces.forEach(t => {
    const h = new Date(t.start_time).getHours()
    const k = `${String(h).padStart(2, '0')}:00`
    if (!map[k]) map[k] = { ok: 0, error: 0 }
    t.status === 'error' ? map[k].error++ : map[k].ok++
  })
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([time, v]) => ({ time, ...v }))
}

function buildAgentErrorChart(traces: Trace[]) {
  const map: Record<string, { errors: number; total: number }> = {}
  traces.forEach(t => {
    if (!map[t.agent_id]) map[t.agent_id] = { errors: 0, total: 0 }
    map[t.agent_id].total++
    if (t.status === 'error') map[t.agent_id].errors++
  })
  return Object.entries(map)
    .map(([id, v]) => ({ id: id.replace('agent-', 'A'), rate: Math.round((v.errors / v.total) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)
}

const SEV_COLOR: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400',
}
const SEV_BG: Record<string, string> = {
  critical: 'bg-red-950 border-red-900', high: 'bg-orange-950 border-orange-900',
  medium: 'bg-yellow-950 border-yellow-900', low: 'bg-blue-950 border-blue-900',
}

export default function Dashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/stats'); return data },
    refetchInterval: 15_000,
  })
  const { data: traces = [] } = useQuery<Trace[]>({
    queryKey: ['traces'],
    queryFn: async () => { const { data } = await api.get('/traces', { params: { limit: 200 } }); return data.traces ?? [] },
    refetchInterval: 15_000,
  })
  const { data: incidents = [] } = useQuery<Incident[]>({
    queryKey: ['incidents'],
    queryFn: async () => { const { data } = await api.get('/incidents', { params: { limit: 5 } }); return data.incidents ?? [] },
    refetchInterval: 15_000,
  })
  const { data: recentTraces = [] } = useQuery<Trace[]>({
    queryKey: ['traces-recent'],
    queryFn: async () => { const { data } = await api.get('/traces', { params: { limit: 8 } }); return data.traces ?? [] },
    refetchInterval: 10_000,
  })

  const hourly = buildHourlyChart(traces)
  const agentErrors = buildAgentErrorChart(traces)
  const errorRate = stats?.error_rate ?? 0
  const avgMs = Math.round(stats?.avg_latency_ms ?? 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">Real-time platform health · auto-refreshes every 15 s</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Active Agents', value: stats?.active_agents ?? 0,
            sub: `${stats?.total_agents ?? 0} registered`,
            icon: Bot, color: 'text-indigo-400', trend: null,
          },
          {
            label: 'Open Incidents', value: stats?.active_incidents ?? 0,
            sub: 'requiring attention',
            icon: Siren, color: stats?.active_incidents ? 'text-red-400' : 'text-emerald-400', trend: null,
          },
          {
            label: 'Total Traces', value: (stats?.total_traces ?? 0).toLocaleString(),
            sub: `${(stats?.error_traces ?? 0).toLocaleString()} errors`,
            icon: GitBranch, color: 'text-blue-400', trend: null,
          },
          {
            label: 'Avg Latency', value: `${avgMs} ms`,
            sub: `${errorRate.toFixed(1)}% error rate`,
            icon: avgMs > 5000 ? TrendingUp : TrendingDown,
            color: avgMs > 5000 ? 'text-red-400' : 'text-emerald-400', trend: null,
          },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trace volume area chart */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Trace Volume (last 200 traces)</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />ok</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />error</span>
            </div>
          </div>
          {hourly.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourly}>
                <defs>
                  <linearGradient id="okGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f9fafb' }} />
                <Area type="monotone" dataKey="ok" stroke="#6366f1" strokeWidth={2} fill="url(#okGrad)" dot={false} />
                <Area type="monotone" dataKey="error" stroke="#ef4444" strokeWidth={2} fill="url(#errGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Error rate by agent */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-4">Error Rate by Agent</h3>
          {agentErrors.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentErrors} layout="vertical">
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <YAxis type="category" dataKey="id" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: '#4d7de3', border: '1px solid #2e726a', borderRadius: 8, color: '#f9fafb' }}
                  formatter={(v: number) => [`${v}%`, 'Error rate']}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {agentErrors.map((entry) => (
                    <Cell key={entry.id} fill={entry.rate > 30 ? '#ef4444' : entry.rate > 15 ? '#f97316' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent traces feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Live Trace Feed</h3>
            <Link to="/traces" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentTraces.length === 0 && <p className="text-sm text-gray-600">No traces yet</p>}
            {recentTraces.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0">
                {t.status === 'error'
                  ? <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate">{t.name}</div>
                  <div className="text-xs text-gray-600">{t.agent_id}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />{t.duration_ms}ms
                  </div>
                  <div className="text-xs text-gray-600">{new Date(t.start_time).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent incidents */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Recent Incidents</h3>
            <Link to="/incidents" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {incidents.length === 0 && <p className="text-sm text-gray-600">No incidents</p>}
            {incidents.map(inc => (
              <div key={inc.id} className={`flex items-start gap-3 p-2 rounded-lg border ${SEV_BG[inc.severity] ?? 'bg-gray-800 border-gray-700'}`}>
                <Zap className={`h-4 w-4 mt-0.5 flex-shrink-0 ${SEV_COLOR[inc.severity] ?? 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 truncate">{inc.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {inc.severity} · {inc.status} · {new Date(inc.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
