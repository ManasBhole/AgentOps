import { useQuery } from '@tanstack/react-query'
import {
  Bot, Siren, GitBranch, TrendingUp, TrendingDown,
  Zap, Clock, CheckCircle2, XCircle, ArrowRight,
  Coins, Activity, ShieldCheck, Sparkles,
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
type LiveStats = {
  tokens: { last_1h: number; last_24h: number; last_7d: number }
  cost: { per_hour: number; per_day_projected: number; last_24h_actual: number }
  uptime: { fleet_pct: number; agents: { agent_id: string; agent_name: string; uptime_pct: number }[] }
}
type Trace    = { id: string; agent_id: string; name: string; status: string; duration_ms: number; start_time: string }
type Incident = { id: string; title: string; severity: string; status: string; agent_id: string; created_at: string }

function buildHourlyChart(traces: Trace[]) {
  const map: Record<string, { ok: number; error: number }> = {}
  traces.forEach(t => {
    const k = `${String(new Date(t.start_time).getHours()).padStart(2,'0')}:00`
    if (!map[k]) map[k] = { ok: 0, error: 0 }
    t.status === 'error' ? map[k].error++ : map[k].ok++
  })
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([time,v]) => ({ time, ...v }))
}

function buildAgentErrorChart(traces: Trace[]) {
  const map: Record<string, { errors: number; total: number }> = {}
  traces.forEach(t => {
    if (!map[t.agent_id]) map[t.agent_id] = { errors: 0, total: 0 }
    map[t.agent_id].total++
    if (t.status === 'error') map[t.agent_id].errors++
  })
  return Object.entries(map)
    .map(([id, v]) => ({ id: id.replace('agent-','A'), rate: Math.round((v.errors/v.total)*100) }))
    .sort((a,b) => b.rate - a.rate).slice(0, 8)
}

const SEV_COLOR: Record<string,string> = {
  critical:'#f87171', high:'#fb923c', medium:'#fbbf24', low:'#60a5fa',
}

/* ── Glass card wrapper ─────────────────────────────────────────── */
function GlassCard({ children, className = '', style = {}, glow }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; glow?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(12,17,32,0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 18,
        boxShadow: glow
          ? `0 0 0 1px ${glow}22, 0 8px 32px rgba(0,0,0,0.4)`
          : '0 4px 24px rgba(0,0,0,0.35)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {glow && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${glow}60, transparent)`,
          pointerEvents: 'none',
        }} />
      )}
      {children}
    </div>
  )
}

/* ── KPI card ───────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, color, glow }: {
  label: string; value: React.ReactNode; sub: string
  icon: React.ElementType; color: string; glow: string
}) {
  return (
    <GlassCard glow={glow} style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>
          {label}
        </span>
        <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${glow}18`, border: `1px solid ${glow}30` }}>
          <Icon style={{ width: 15, height: 15, color }} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', marginTop: 6 }}>{sub}</div>
    </GlassCard>
  )
}

export default function Dashboard() {
  const { data: stats }  = useQuery<Stats>({
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
  const { data: live } = useQuery<LiveStats>({
    queryKey: ['live-stats'],
    queryFn: async () => { const { data } = await api.get('/stats/live'); return data },
    refetchInterval: 10_000,
  })

  const hourly      = buildHourlyChart(traces)
  const agentErrors = buildAgentErrorChart(traces)
  const errorRate   = stats?.error_rate ?? 0
  const avgMs       = Math.round(stats?.avg_latency_ms ?? 0)
  const uptimePct   = live?.uptime.fleet_pct ?? 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
            Overview
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', marginTop: 4, marginBottom: 0 }}>
            Real-time platform health · auto-refreshes every 15 s
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'rgba(52,211,153,0.7)' }}>Live data</span>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        <KpiCard label="Active Agents" value={stats?.active_agents ?? 0}
          sub={`${stats?.total_agents ?? 0} registered`}
          icon={Bot} color="#60a5fa" glow="#3b82f6" />
        <KpiCard label="Open Incidents" value={stats?.active_incidents ?? 0}
          sub="requiring attention"
          icon={Siren} color={stats?.active_incidents ? '#f87171' : '#34d399'} glow={stats?.active_incidents ? '#ef4444' : '#10b981'} />
        <KpiCard label="Total Traces" value={(stats?.total_traces ?? 0).toLocaleString()}
          sub={`${(stats?.error_traces ?? 0).toLocaleString()} errors`}
          icon={GitBranch} color="#38bdf8" glow="#0ea5e9" />
        <KpiCard label="Avg Latency" value={`${avgMs} ms`}
          sub={`${errorRate.toFixed(1)}% error rate`}
          icon={avgMs > 5000 ? TrendingUp : TrendingDown}
          color={avgMs > 5000 ? '#f87171' : '#34d399'} glow={avgMs > 5000 ? '#ef4444' : '#10b981'} />
      </div>

      {/* Live widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>

        {/* LLM Calls */}
        <GlassCard glow="#3b82f6" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>LLM Calls</span>
            <Activity style={{ width: 15, height: 15, color: '#60a5fa' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9' }}>
            {(live?.tokens.last_1h ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', marginTop: 4 }}>last hour</div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{(live?.tokens.last_24h ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>24 h</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{(live?.tokens.last_7d ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>7 d</div>
            </div>
          </div>
        </GlassCard>

        {/* Cost Burn */}
        <GlassCard glow="#f59e0b" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>Cost Burn</span>
            <Coins style={{ width: 15, height: 15, color: '#fbbf24' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9' }}>
            ${(live?.cost.per_hour ?? 0).toFixed(4)}
            <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(148,163,184,0.4)' }}>/hr</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', marginTop: 4 }}>
            projected ${(live?.cost.per_day_projected ?? 0).toFixed(3)}/day
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>${(live?.cost.last_24h_actual ?? 0).toFixed(4)}</div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>actual last 24 h</div>
          </div>
        </GlassCard>

        {/* Fleet Uptime */}
        <GlassCard glow={uptimePct >= 99 ? '#10b981' : uptimePct >= 95 ? '#f59e0b' : '#ef4444'} style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>Fleet Uptime</span>
            <ShieldCheck style={{ width: 15, height: 15, color: uptimePct >= 99 ? '#34d399' : uptimePct >= 95 ? '#fbbf24' : '#f87171' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: uptimePct >= 99 ? '#34d399' : uptimePct >= 95 ? '#fbbf24' : '#f87171' }}>
            {uptimePct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', marginTop: 4 }}>30-day rolling average</div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 60, overflowY: 'auto' }}>
            {(live?.uptime.agents ?? []).map(a => (
              <div key={a.agent_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'rgba(148,163,184,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{a.agent_name}</span>
                <span style={{ color: a.uptime_pct >= 99 ? '#34d399' : a.uptime_pct >= 95 ? '#fbbf24' : '#f87171', flexShrink: 0 }}>
                  {a.uptime_pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>

          {/* Trace volume */}
          <GlassCard style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Trace Volume</div>
                <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 2 }}>last 200 traces by hour</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />ok
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />error
                </span>
              </div>
            </div>
            {hourly.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(148,163,184,0.2)', fontSize: 13 }}>No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourly}>
                  <defs>
                    <linearGradient id="okGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                  <XAxis dataKey="time" tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: '#0C1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#f1f5f9', fontSize: 12 }}/>
                  <Area type="monotone" dataKey="ok" stroke="#3b82f6" strokeWidth={2} fill="url(#okGrad)" dot={false}/>
                  <Area type="monotone" dataKey="error" stroke="#ef4444" strokeWidth={2} fill="url(#errGrad)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          {/* Error rate by agent */}
          <GlassCard style={{ padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Error Rate</div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', marginBottom: 18 }}>by agent</div>
            {agentErrors.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(148,163,184,0.2)', fontSize: 13 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agentErrors} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} unit="%"/>
                  <YAxis type="category" dataKey="id" tick={{ fill: 'rgba(148,163,184,0.45)', fontSize: 10 }} axisLine={false} tickLine={false} width={28}/>
                  <Tooltip
                    contentStyle={{ background: '#0C1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#f1f5f9', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Error rate']}
                  />
                  <Bar dataKey="rate" radius={[0,5,5,0]}>
                    {agentErrors.map(e => (
                      <Cell key={e.id} fill={e.rate > 30 ? '#ef4444' : e.rate > 15 ? '#f97316' : '#3b82f6'}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>

        {/* Live trace feed */}
        <GlassCard style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles style={{ width: 14, height: 14, color: '#60a5fa' }} />
                Live Trace Feed
              </div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 2 }}>most recent agent executions</div>
            </div>
            <Link to="/traces" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 }}>
              View all <ArrowRight style={{ width: 12, height: 12 }} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentTraces.length === 0 && (
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.25)' }}>No traces yet</p>
            )}
            {recentTraces.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {t.status === 'error'
                  ? <XCircle style={{ width: 14, height: 14, color: '#f87171', flexShrink: 0 }} />
                  : <CheckCircle2 style={{ width: 14, height: 14, color: '#34d399', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 1 }}>{t.agent_id}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                    <Clock style={{ width: 11, height: 11 }} />{t.duration_ms}ms
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', marginTop: 1 }}>{new Date(t.start_time).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Recent incidents */}
        <GlassCard style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap style={{ width: 14, height: 14, color: '#fbbf24' }} />
                Recent Incidents
              </div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 2 }}>latest alerts requiring attention</div>
            </div>
            <Link to="/incidents" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 }}>
              View all <ArrowRight style={{ width: 12, height: 12 }} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incidents.length === 0 && (
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.25)' }}>No incidents</p>
            )}
            {incidents.map(inc => (
              <div key={inc.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${SEV_COLOR[inc.severity] ?? '#64748b'}20`,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[inc.severity] ?? '#64748b', marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${SEV_COLOR[inc.severity] ?? '#64748b'}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 3 }}>
                    <span style={{ color: SEV_COLOR[inc.severity], fontWeight: 600 }}>{inc.severity}</span>
                    {' · '}{inc.status}{' · '}{new Date(inc.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

      </div>
    </div>
  )
}
