import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingDown, Activity,
} from 'lucide-react'
import api from '../services/api'

interface SLODefinition {
  id: string
  agent_id: string
  name: string
  sli_type: 'availability' | 'latency' | 'error_rate'
  target_value: number
  window_days: number
  threshold_ms: number
  enabled: boolean
  created_at: string
}

interface SLOStatus {
  slo: SLODefinition
  error_budget_remaining: number
  burn_rate_1h: number
  burn_rate_6h: number
  burn_rate_24h: number
  current_value: number
  target_value: number
  budget_consumed: number
  alert: '' | 'warning' | 'critical'
  updated_at: string
}

interface Agent { id: string; name: string }

const SLI_LABELS: Record<string, string> = {
  availability: 'Availability',
  latency: 'Latency',
  error_rate: 'Error Rate',
}

const ALERT_STYLE: Record<string, string> = {
  critical: 'border-red-700 bg-red-950/30',
  warning: 'border-yellow-700 bg-yellow-950/20',
  '': 'border-gray-800',
}

const ALERT_BADGE: Record<string, string> = {
  critical: 'bg-red-900/60 text-red-300',
  warning: 'bg-yellow-900/60 text-yellow-300',
  '': 'bg-emerald-900/60 text-emerald-300',
}

function BurnRateBar({ value, label }: { value: number; label: string }) {
  const capped = Math.min(value, 20)
  const pct = (capped / 20) * 100
  const color = value > 14 ? 'bg-red-500' : value > 6 ? 'bg-yellow-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={value > 14 ? 'text-red-400' : value > 6 ? 'text-yellow-400' : 'text-emerald-400'}>
          {value.toFixed(2)}x
        </span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BudgetArc({ pct }: { pct: number }) {
  // SVG arc gauge 0-100%
  const r = 36
  const circumference = Math.PI * r  // half circle
  const remaining = Math.max(0, Math.min(100, pct))
  const fill = (remaining / 100) * circumference
  const color = remaining > 50 ? '#10b981' : remaining > 20 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="88" height="52" viewBox="0 0 88 52">
      <path d={`M 8 44 A ${r} ${r} 0 0 1 80 44`} fill="none" stroke="#1f2937" strokeWidth="8" strokeLinecap="round" />
      <path d={`M 8 44 A ${r} ${r} 0 0 1 80 44`} fill="none" stroke={color} strokeWidth="8"
        strokeLinecap="round" strokeDasharray={`${fill} ${circumference}`} />
      <text x="44" y="40" textAnchor="middle" fill={color} fontSize="13" fontWeight="bold">
        {remaining.toFixed(0)}%
      </text>
    </svg>
  )
}

export default function SLO() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    agent_id: '', name: '', sli_type: 'availability', target_value: '99.9',
    window_days: '30', threshold_ms: '2000',
  })
  const [createError, setCreateError] = useState('')

  const { data: statusData, isFetching, refetch } = useQuery({
    queryKey: ['slo-statuses'],
    queryFn: async () => {
      const { data } = await api.get('/slo/status')
      return data as { statuses: SLOStatus[]; total: number }
    },
    refetchInterval: 30_000,
  })

  const { data: agentsData } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })

  const statuses: SLOStatus[] = Array.isArray(statusData?.statuses) ? statusData!.statuses : []
  const agents: Agent[] = Array.isArray(agentsData) ? agentsData : []

  const createMutation = useMutation({
    mutationFn: async () => api.post('/slo', {
      agent_id: form.agent_id,
      name: form.name,
      sli_type: form.sli_type,
      target_value: parseFloat(form.target_value) / 100,
      window_days: parseInt(form.window_days),
      threshold_ms: parseInt(form.threshold_ms),
    }),
    onSuccess: () => { setShowCreate(false); setCreateError(''); qc.invalidateQueries({ queryKey: ['slo-statuses'] }) },
    onError: (e: any) => setCreateError(e?.response?.data?.error ?? 'Failed to create SLO'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/slo/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slo-statuses'] }),
    onError: (e: any) => setCreateError(e?.response?.data?.error ?? 'Failed to delete SLO'),
  })

  const critical = statuses.filter(s => s.alert === 'critical').length
  const warning = statuses.filter(s => s.alert === 'warning').length
  const healthy = statuses.filter(s => s.alert === '').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">SLO Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Error budgets & burn rates — Google SRE methodology</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-white bg-gray-900 border border-gray-800 rounded-lg">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">
            <Plus className="h-4 w-4" /> Define SLO
          </button>
        </div>
      </div>

      {/* Error banner */}
      {createError && (
        <div className="flex items-center justify-between gap-2 bg-red-950 border border-red-900 rounded-lg px-4 py-2.5 text-sm text-red-400">
          <span>{createError}</span>
          <button onClick={() => setCreateError('')} className="text-red-500 hover:text-red-300 text-xs">✕</button>
        </div>
      )}

      {/* Fleet summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Critical Burn', value: critical, color: 'text-red-400', icon: AlertTriangle, bg: 'border-red-900/50' },
          { label: 'Warning Burn', value: warning, color: 'text-yellow-400', icon: TrendingDown, bg: 'border-yellow-900/50' },
          { label: 'Healthy', value: healthy, color: 'text-emerald-400', icon: CheckCircle2, bg: 'border-emerald-900/50' },
        ].map(({ label, value, color, icon: Icon, bg }) => (
          <div key={label} className={`bg-gray-900 border rounded-xl p-4 ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-400" /> New SLO Definition
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agent</label>
              <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">Select agent…</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.id.slice(0, 12)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SLO Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 99.9% availability"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SLI Type</label>
              <select value={form.sli_type} onChange={e => setForm(f => ({ ...f, sli_type: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="availability">Availability</option>
                <option value="latency">Latency</option>
                <option value="error_rate">Error Rate</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Target (%)</label>
              <input type="number" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                min="0" max="100" step="0.1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rolling Window (days)</label>
              <input type="number" value={form.window_days} onChange={e => setForm(f => ({ ...f, window_days: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            {form.sli_type === 'latency' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Latency Threshold (ms)</label>
                <input type="number" value={form.threshold_ms} onChange={e => setForm(f => ({ ...f, threshold_ms: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMutation.mutate()}
              disabled={!form.agent_id || !form.name || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg">
              {createMutation.isPending ? 'Creating…' : 'Create SLO'}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SLO cards */}
      {statuses.length === 0 && !isFetching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Target className="h-10 w-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No SLOs defined yet</p>
          <p className="text-gray-600 text-xs mt-1">Click "Define SLO" to set your first service level objective</p>
        </div>
      )}

      <div className="space-y-3">
        {statuses.map(st => (
          <div key={st.slo.id} className={`bg-gray-900 border rounded-xl p-5 ${ALERT_STYLE[st.alert]}`}>
            <div className="flex items-start gap-4">
              {/* Budget gauge */}
              <div className="flex-shrink-0 text-center">
                <BudgetArc pct={st.error_budget_remaining} />
                <div className="text-xs text-gray-500 mt-1">Budget Left</div>
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-white text-sm">{st.slo.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_BADGE[st.alert]}`}>
                    {st.alert || 'healthy'}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                    {SLI_LABELS[st.slo.sli_type]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {st.slo.window_days}d window
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                  <span>Target: <span className="text-white">{(st.target_value * 100).toFixed(2)}%</span></span>
                  <span>Current: <span className={st.current_value >= st.target_value ? 'text-emerald-400' : 'text-red-400'}>
                    {(st.current_value * 100).toFixed(3)}%
                  </span></span>
                  <span>Consumed: <span className="text-white">{st.budget_consumed.toFixed(1)}%</span></span>
                </div>

                {/* Burn rate bars */}
                <div className="grid grid-cols-3 gap-3">
                  <BurnRateBar value={st.burn_rate_1h} label="1h burn" />
                  <BurnRateBar value={st.burn_rate_6h} label="6h burn" />
                  <BurnRateBar value={st.burn_rate_24h} label="24h burn" />
                </div>

                {st.alert === 'critical' && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Fast burn detected — at this rate the {st.slo.window_days}d error budget will be exhausted in{' '}
                    <strong>{st.burn_rate_1h > 0 ? (24 / st.burn_rate_1h).toFixed(1) : '∞'} hours</strong>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right text-xs text-gray-600">
                  <div>Agent</div>
                  <div className="font-mono">{st.slo.agent_id.slice(0, 8)}…</div>
                </div>
                <button onClick={() => deleteMutation.mutate(st.slo.id)}
                  className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-medium text-gray-400">Burn Rate Thresholds (Google SRE)</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><span className="text-red-400">Critical (1h &gt; 14×)</span> — Budget exhausted in ~2 days. Page immediately.</div>
          <div><span className="text-yellow-400">Warning (6h &gt; 6×)</span> — Budget exhausted in ~5 days. Ticket required.</div>
          <div><span className="text-emerald-400">Healthy (24h &lt; 3×)</span> — Consuming budget at sustainable rate.</div>
        </div>
      </div>
    </div>
  )
}
