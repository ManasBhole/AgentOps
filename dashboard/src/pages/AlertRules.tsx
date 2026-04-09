import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import api from '../services/api'

type AlertRule = {
  id: string; name: string; agent_id: string; metric: string
  operator: string; threshold: number; channels: string
  slack_url: string; enabled: boolean
  last_fired_at?: string; created_at: string
}
type AlertFiring = {
  id: string; rule_name: string; agent_id: string; metric: string
  current_value: number; threshold: number; operator: string
  message: string; status: string; fired_at: string
}

const METRIC_LABELS: Record<string, string> = {
  error_rate: 'Error Rate (%)',
  avg_latency_ms: 'Avg Latency (ms)',
  cost_per_hour: 'Cost / Hour ($)',
}
const OP_LABELS: Record<string, string> = { gt: '>', lt: '<' }

function parseChannels(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export default function AlertRules() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', agent_id: '', metric: 'error_rate', operator: 'gt',
    threshold: 5, channels: ['webhook'], slack_url: '',
  })
  const [formError, setFormError] = useState('')

  const { data: rulesData } = useQuery<{ rules: AlertRule[] }>({
    queryKey: ['alert-rules'],
    queryFn: async () => { const { data } = await api.get('/alert-rules'); return data },
    refetchInterval: 30_000,
  })
  const { data: firingsData } = useQuery<{ firings: AlertFiring[] }>({
    queryKey: ['alert-firings'],
    queryFn: async () => { const { data } = await api.get('/alert-rules/firings', { params: { limit: 30 } }); return data },
    refetchInterval: 30_000,
  })

  const rules = rulesData?.rules ?? []
  const firings = firingsData?.firings ?? []

  const createMutation = useMutation({
    mutationFn: async (body: typeof form) => api.post('/alert-rules', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      setShowForm(false)
      setForm({ name: '', agent_id: '', metric: 'error_rate', operator: 'gt', threshold: 5, channels: ['webhook'], slack_url: '' })
      setFormError('')
    },
    onError: (e: any) => setFormError(e?.response?.data?.error ?? 'Failed to create rule'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/alert-rules/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/alert-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })

  const toggleChannel = (ch: string) =>
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-yellow-400" />
            Alert Rules
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Threshold-based notifications — fires every 60 s evaluation cycle</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> New Rule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Alert Rule</h3>
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rule Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="High error rate"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agent ID (blank = all agents)</label>
              <input value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                placeholder="agent-xyz or leave blank"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Metric</label>
              <select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-shrink-0">
                <label className="block text-xs text-gray-400 mb-1">Condition</label>
                <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="gt">Greater than (&gt;)</option>
                  <option value="lt">Less than (&lt;)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Threshold</label>
                <input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">Channels</label>
            <div className="flex gap-3">
              {['webhook', 'slack'].map(ch => (
                <label key={ch} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => toggleChannel(ch)}
                    className="accent-indigo-500" />
                  <span className="text-sm text-gray-300 capitalize">{ch}</span>
                </label>
              ))}
            </div>
            {form.channels.includes('slack') && (
              <input value={form.slack_url} onChange={e => setForm(f => ({ ...f, slack_url: e.target.value }))}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => createMutation.mutate(form)}
              disabled={!form.name || createMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {createMutation.isPending ? 'Creating…' : 'Create Rule'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-white">{rules.length} rule{rules.length !== 1 ? 's' : ''}</h3>
        </div>
        {rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No rules yet — create one above</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {rules.map(r => {
              const channels = parseChannels(r.channels)
              return (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{r.name}</span>
                      {!r.enabled && <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">paused</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {METRIC_LABELS[r.metric] ?? r.metric} {OP_LABELS[r.operator]} {r.threshold}
                      {r.agent_id ? ` · agent: ${r.agent_id}` : ' · all agents'}
                      {channels.length > 0 && ` · ${channels.join(', ')}`}
                    </div>
                    {r.last_fired_at && (
                      <div className="text-xs text-orange-400 mt-0.5">
                        Last fired: {new Date(r.last_fired_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleMutation.mutate({ id: r.id, enabled: !r.enabled })}
                      className="text-gray-400 hover:text-white transition-colors">
                      {r.enabled
                        ? <ToggleRight className="h-5 w-5 text-indigo-400" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => deleteMutation.mutate(r.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent firings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-white">Recent Firings</h3>
        </div>
        {firings.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No firings yet</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {firings.map(f => (
              <div key={f.id} className="px-4 py-3 flex items-start gap-3">
                {f.status === 'firing'
                  ? <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{f.rule_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{f.message}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{new Date(f.fired_at).toLocaleString()}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${f.status === 'firing' ? 'bg-orange-900/50 text-orange-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                  {f.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
