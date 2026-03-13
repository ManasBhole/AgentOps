import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Zap, DollarSign, Database, Trash2,
  ChevronDown, ChevronUp, RefreshCw, Sparkles, AlertTriangle,
} from 'lucide-react'
import api from '../services/api'

type Memory = {
  id: string; agent_id: string; scope: string; key: string
  value: string; run_id: string; updated_at: string
}

type Agent = { id: string; name: string; type: string; version: string; status: string }

type RouterDecision = {
  task: string; complexity: string; model: string; provider: string
  est_cost_usd: number; full_cost_usd: number; savings_usd: number
  savings_pct: number; rationale: string; alternative_model?: string
}

type RouterStats = {
  total_decisions: number; total_cost_usd: number
  total_saved_usd: number; savings_pct: number
}

type BudgetStatus = {
  agent_id: string; daily_limit_usd: number; monthly_limit_usd: number
  alert_threshold_pct: number; daily_spend_usd: number; monthly_spend_usd: number
  daily_pct: number; monthly_pct: number; daily_status: string; monthly_status: string
}

const BUDGET_BAR: Record<string, string> = {
  ok:       'bg-emerald-500',
  warning:  'bg-yellow-500',
  exceeded: 'bg-red-500',
}

const COMPLEXITY_STYLE: Record<string, string> = {
  simple:   'bg-emerald-900/60 text-emerald-300',
  moderate: 'bg-yellow-900/60 text-yellow-300',
  complex:  'bg-red-900/60 text-red-300',
}

const PROVIDER_LOGO: Record<string, string> = {
  openai: '⚡', anthropic: '◆',
}

export default function Intelligence() {
  const qc = useQueryClient()

  const [selectedAgent, setSelectedAgent] = useState('')
  const [showShared, setShowShared] = useState(false)
  const [newKey, setNewKey]     = useState('')
  const [newValue, setNewValue] = useState('')
  const [newScope, setNewScope] = useState<'agent' | 'shared'>('agent')
  const [task, setTask]         = useState('')
  const [provider, setProvider] = useState('')
  const [decision, setDecision] = useState<RouterDecision | null>(null)
  const [budgetAgent, setBudgetAgent] = useState('')
  const [budgetDaily, setBudgetDaily]     = useState('')
  const [budgetMonthly, setBudgetMonthly] = useState('')
  const [budgetAlertPct, setBudgetAlertPct] = useState('80')

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })

  const { data: agentMemData, isFetching: memFetching, refetch: refetchMem } = useQuery({
    queryKey: ['memory', selectedAgent],
    queryFn: async () => {
      if (!selectedAgent) return { memories: [], count: 0 }
      const { data } = await api.get(`/agents/${selectedAgent}/memory`)
      return data
    },
    enabled: !!selectedAgent,
  })

  const { data: sharedMemData, refetch: refetchShared } = useQuery({
    queryKey: ['memory', 'shared'],
    queryFn: async () => { const { data } = await api.get('/memory/shared'); return data },
    enabled: showShared,
  })

  const { data: routerStatsData } = useQuery({
    queryKey: ['router-stats'],
    queryFn: async () => { const { data } = await api.get('/router/stats'); return data.router_stats as RouterStats },
    refetchInterval: 15_000,
  })

  const setMemMutation = useMutation({
    mutationFn: async () => {
      const id = newScope === 'shared' ? (selectedAgent || agents[0]?.id || '') : selectedAgent
      await api.post(`/agents/${id}/memory`, { key: newKey, value: newValue, scope: newScope })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory'] })
      setNewKey(''); setNewValue('')
    },
  })

  const delMemMutation = useMutation({
    mutationFn: async ({ agentId, key, scope }: { agentId: string; key: string; scope: string }) => {
      await api.delete(`/agents/${agentId}/memory/${key}?scope=${scope}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  })

  const routeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/router/route', {
        agent_id: selectedAgent,
        task,
        prefer_provider: provider,
      })
      return data.decision as RouterDecision
    },
    onSuccess: (d) => {
      setDecision(d)
      qc.invalidateQueries({ queryKey: ['router-stats'] })
    },
  })

  const { data: allBudgets, refetch: refetchBudgets } = useQuery<BudgetStatus[]>({
    queryKey: ['budgets'],
    queryFn: async () => { const { data } = await api.get('/budgets'); return data.budgets ?? [] },
    refetchInterval: 30_000,
  })

  const setBudgetMutation = useMutation({
    mutationFn: async () => api.post(`/agents/${budgetAgent}/budget`, {
      daily_limit_usd:    parseFloat(budgetDaily)    || 0,
      monthly_limit_usd:  parseFloat(budgetMonthly)  || 0,
      alert_threshold_pct: parseFloat(budgetAlertPct) || 80,
    }),
    onSuccess: () => { refetchBudgets(); setBudgetAgent(''); setBudgetDaily(''); setBudgetMonthly('') },
  })

  const agentMems: Memory[] = agentMemData?.memories ?? []
  const sharedMems: Memory[] = sharedMemData?.memories ?? []
  const stats: RouterStats | undefined = routerStatsData
  const selectedAgentName = agents.find(a => a.id === selectedAgent)?.name ?? ''

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-400" /> Intelligence Layer
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cross-run agent memory · Intelligent model routing · Cost optimisation
          </p>
        </div>
      </div>

      {/* Router stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Routing Decisions', value: stats?.total_decisions ?? 0,      icon: Zap,        color: 'text-white' },
          { label: 'Total Cost',        value: `$${(stats?.total_cost_usd ?? 0).toFixed(4)}`, icon: DollarSign, color: 'text-yellow-400' },
          { label: 'Cost Saved',        value: `$${(stats?.total_saved_usd ?? 0).toFixed(4)}`, icon: Sparkles,  color: 'text-emerald-400' },
          { label: 'Savings Rate',      value: `${(stats?.savings_pct ?? 0).toFixed(1)}%`,     icon: Brain,     color: (stats?.savings_pct ?? 0) > 0 ? 'text-emerald-400' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-3">
            <s.icon className="h-4 w-4 text-gray-600 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ── Model Router ──────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white">Model Router</span>
            <span className="text-xs text-gray-500 ml-1">— routes tasks to cheapest capable model</span>
          </div>
          <div className="p-4 space-y-3">
            <textarea
              rows={3}
              placeholder="Describe the task, e.g. 'Summarise this support ticket in one sentence'"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              value={task}
              onChange={e => setTask(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={provider}
                onChange={e => setProvider(e.target.value)}>
                <option value="">Any provider</option>
                <option value="openai">OpenAI only</option>
                <option value="anthropic">Anthropic only</option>
              </select>
              <button
                onClick={() => routeMutation.mutate()}
                disabled={!task.trim() || routeMutation.isPending}
                className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                {routeMutation.isPending ? 'Routing…' : 'Route'}
              </button>
            </div>

            {decision && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">
                      {PROVIDER_LOGO[decision.provider] ?? '•'} {decision.model}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COMPLEXITY_STYLE[decision.complexity]}`}>
                      {decision.complexity}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">Est. <span className="text-white font-mono">${decision.est_cost_usd.toFixed(5)}</span></span>
                    <span className="text-emerald-400 font-semibold">
                      saves {decision.savings_pct.toFixed(0)}% vs GPT-4o
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">{decision.rationale}</p>
                {decision.alternative_model && (
                  <p className="text-xs text-gray-600">
                    Need more power? Use <span className="text-indigo-400">{decision.alternative_model}</span>
                  </p>
                )}
                {/* Savings bar */}
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div className="bg-emerald-500 h-1 rounded-full transition-all"
                    style={{ width: `${Math.min(decision.savings_pct, 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Agent Memory ─────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Agent Memory</span>
            </div>
            <button onClick={() => { refetchMem(); refetchShared() }}
              className="text-gray-500 hover:text-white">
              <RefreshCw className={`h-3.5 w-3.5 ${memFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Agent selector */}
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}>
              <option value="">Select agent to view memory…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {/* Write new memory */}
            <div className="flex gap-2">
              <input placeholder="key"
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-600"
                value={newKey} onChange={e => setNewKey(e.target.value)} />
              <input placeholder="value"
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-600"
                value={newValue} onChange={e => setNewValue(e.target.value)} />
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                value={newScope}
                onChange={e => setNewScope(e.target.value as 'agent' | 'shared')}>
                <option value="agent">private</option>
                <option value="shared">shared</option>
              </select>
              <button
                onClick={() => setMemMutation.mutate()}
                disabled={!newKey.trim() || !newValue.trim() || (!selectedAgent && newScope === 'agent') || setMemMutation.isPending}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                Save
              </button>
            </div>

            {/* Memory list */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {agentMems.length === 0 && selectedAgent && (
                <p className="text-xs text-gray-600 text-center py-4">No memories yet for {selectedAgentName}.</p>
              )}
              {agentMems.map(m => (
                <div key={m.id} className="flex items-start gap-2 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-indigo-300">{m.key}</span>
                      <span className="text-xs text-gray-600">{new Date(m.updated_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{m.value}</p>
                  </div>
                  <button onClick={() => delMemMutation.mutate({ agentId: m.agent_id, key: m.key, scope: m.scope })}
                    className="text-gray-600 hover:text-red-400 flex-shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Shared Memory */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button onClick={() => setShowShared(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">Shared Memory</span>
            <span className="text-xs text-gray-500">— all agents can read and write</span>
            {sharedMems.length > 0 && (
              <span className="text-xs bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded-full">{sharedMems.length}</span>
            )}
          </div>
          {showShared ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </button>

        {showShared && (
          <div className="border-t border-gray-800 p-4">
            {sharedMems.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-4">
                No shared memories yet. Save a memory with scope "shared" to see it here.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {sharedMems.map(m => (
                <div key={m.id} className="flex items-start gap-2 bg-gray-800/50 border border-purple-900/40 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-purple-300">{m.key}</span>
                      <span className="text-xs text-gray-600">{new Date(m.updated_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{m.value}</p>
                  </div>
                  <button onClick={() => delMemMutation.mutate({ agentId: m.agent_id, key: m.key, scope: 'shared' })}
                    className="text-gray-600 hover:text-red-400 flex-shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Cost Budgets ────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white">Cost Budgets</span>
            <span className="text-xs text-gray-500">— set daily &amp; monthly spend limits per agent</span>
          </div>
          <button onClick={() => refetchBudgets()} className="text-gray-500 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Set budget form */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agent</label>
              <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={budgetAgent} onChange={e => setBudgetAgent(e.target.value)}>
                <option value="">Select agent…</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Daily limit (USD)</label>
              <input type="number" min="0" step="0.01" placeholder="e.g. 5.00"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
                value={budgetDaily} onChange={e => setBudgetDaily(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Monthly limit (USD)</label>
              <input type="number" min="0" step="0.01" placeholder="e.g. 50.00"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
                value={budgetMonthly} onChange={e => setBudgetMonthly(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Alert at %</label>
              <input type="number" min="1" max="100"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={budgetAlertPct} onChange={e => setBudgetAlertPct(e.target.value)} />
            </div>
            <button
              onClick={() => setBudgetMutation.mutate()}
              disabled={!budgetAgent || setBudgetMutation.isPending}
              className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50">
              {setBudgetMutation.isPending ? 'Saving…' : 'Set Budget'}
            </button>
          </div>

          {/* Budget status rows */}
          {(allBudgets ?? []).length === 0 && (
            <p className="text-xs text-gray-600 text-center py-3">No budgets configured. Set one above.</p>
          )}
          <div className="space-y-2">
            {(allBudgets ?? []).map(b => {
              const agentName = agents.find(a => a.id === b.agent_id)?.name ?? b.agent_id.slice(0, 8)
              return (
                <div key={b.agent_id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-200">{agentName}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {b.daily_status !== 'ok' && (
                        <span className={`flex items-center gap-1 ${b.daily_status === 'exceeded' ? 'text-red-400' : 'text-yellow-400'}`}>
                          <AlertTriangle className="h-3 w-3" /> Daily {b.daily_status}
                        </span>
                      )}
                      {b.monthly_status !== 'ok' && (
                        <span className={`flex items-center gap-1 ${b.monthly_status === 'exceeded' ? 'text-red-400' : 'text-yellow-400'}`}>
                          <AlertTriangle className="h-3 w-3" /> Monthly {b.monthly_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Daily', spent: b.daily_spend_usd, limit: b.daily_limit_usd, pct: b.daily_pct, status: b.daily_status },
                      { label: 'Monthly', spent: b.monthly_spend_usd, limit: b.monthly_limit_usd, pct: b.monthly_pct, status: b.monthly_status },
                    ].map(row => (
                      <div key={row.label}>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{row.label}</span>
                          <span className="text-gray-300">${row.spent.toFixed(4)} <span className="text-gray-600">/ ${row.limit.toFixed(2)}</span></span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${BUDGET_BAR[row.status] ?? 'bg-gray-500'}`}
                            style={{ width: `${Math.min(row.pct, 100)}%` }} />
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">{row.pct.toFixed(1)}% used</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
