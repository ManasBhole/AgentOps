import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, DollarSign, Zap, Clock, AlertTriangle } from 'lucide-react'
import api from '../services/api'

interface RouterLog {
  id: string
  agent_id: string
  task: string
  complexity: string
  model_chosen: string
  cost_est_usd: number
  created_at: string
}

interface BudgetStatus {
  agent_id: string
  daily_spend: number
  daily_limit: number
  monthly_spend: number
  monthly_limit: number
  status: string
}

const COMPLEXITY_COLOR: Record<string, string> = {
  simple: 'bg-emerald-500',
  moderate: 'bg-yellow-500',
  complex: 'bg-red-500',
}

const MODEL_COLOR: Record<string, string> = {
  'gpt-4o-mini': 'text-emerald-400',
  'ai-model-fast': 'text-emerald-400',
  'gpt-4o': 'text-yellow-400',
  'ai-model-balanced': 'text-yellow-400',
  'o1': 'text-red-400',
  'ai-model-pro': 'text-red-400',
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function Analytics() {
  const { data: logsRaw } = useQuery<RouterLog[]>({
    queryKey: ['router-logs'],
    queryFn: async () => { const { data } = await api.get('/intelligence/router/logs'); return data ?? [] },
    refetchInterval: 30_000,
  })
  const logs: RouterLog[] = Array.isArray(logsRaw) ? logsRaw : []

  const { data: budgetsRaw } = useQuery<BudgetStatus[]>({
    queryKey: ['budgets'],
    queryFn: async () => { const { data } = await api.get('/budgets'); return data ?? [] },
    refetchInterval: 30_000,
  })
  const budgets: BudgetStatus[] = Array.isArray(budgetsRaw) ? budgetsRaw : []

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/stats'); return data ?? {} },
    refetchInterval: 30_000,
  })

  // Aggregate model usage
  const modelCounts: Record<string, number> = {}
  const modelCosts: Record<string, number> = {}
  let totalCost = 0
  let totalSavings = 0
  const GPT4O_COST_PER_1K = 0.005

  for (const log of logs) {
    modelCounts[log.model_chosen] = (modelCounts[log.model_chosen] ?? 0) + 1
    modelCosts[log.model_chosen] = (modelCosts[log.model_chosen] ?? 0) + log.cost_est_usd
    totalCost += log.cost_est_usd
    // savings = baseline cost - actual cost (estimate ~500 tokens per task)
    const baseline = (500 / 1000) * GPT4O_COST_PER_1K
    totalSavings += Math.max(0, baseline - log.cost_est_usd)
  }

  const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]
  const complexityBreakdown: Record<string, number> = { simple: 0, moderate: 0, complex: 0 }
  for (const log of logs) complexityBreakdown[log.complexity] = (complexityBreakdown[log.complexity] ?? 0) + 1

  const totalBudgetSpend = budgets.reduce((s, b) => s + b.monthly_spend, 0)
  const overBudget = budgets.filter(b => b.status === 'exceeded').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cost intelligence, model usage, and performance trends</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Routed" value={logs.length.toString()} sub="model routing decisions" icon={Zap} color="bg-indigo-600" />
        <StatCard label="Estimated Cost" value={`$${totalCost.toFixed(4)}`} sub="from model routing" icon={DollarSign} color="bg-emerald-700" />
        <StatCard label="Estimated Savings" value={`$${totalSavings.toFixed(4)}`} sub="vs GPT-4o baseline" icon={TrendingUp} color="bg-cyan-700" />
        <StatCard label="Monthly Spend" value={`$${totalBudgetSpend.toFixed(3)}`} sub={overBudget > 0 ? `${overBudget} agent(s) over budget` : 'all within budget'} icon={AlertTriangle} color={overBudget > 0 ? 'bg-red-700' : 'bg-gray-700'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model usage breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Model Usage</h2>
          </div>
          {Object.keys(modelCounts).length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">No routing data yet</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).map(([model, count]) => {
                const pct = Math.round((count / logs.length) * 100)
                return (
                  <div key={model}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`font-medium ${MODEL_COLOR[model] ?? 'text-gray-300'}`}>{model}</span>
                      <span className="text-gray-400">{count} calls · ${(modelCosts[model] ?? 0).toFixed(5)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Complexity breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Task Complexity</h2>
          </div>
          <div className="space-y-4">
            {(['simple', 'moderate', 'complex'] as const).map(c => {
              const count = complexityBreakdown[c] ?? 0
              const pct = logs.length ? Math.round((count / logs.length) * 100) : 0
              return (
                <div key={c}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 capitalize">{c}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${COMPLEXITY_COLOR[c]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          {topModel && (
            <div className="mt-5 pt-4 border-t border-gray-800 text-xs text-gray-500">
              Most used model: <span className={`font-medium ${MODEL_COLOR[topModel[0]] ?? 'text-gray-300'}`}>{topModel[0]}</span>
              <span className="ml-1 text-gray-600">({topModel[1]} calls)</span>
            </div>
          )}
        </div>
      </div>

      {/* Budget table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Agent Budget Overview</h2>
        </div>
        {budgets.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">No budgets configured — set them in Intelligence → Cost Budgets</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Daily Spend</th>
                  <th className="pb-2 font-medium">Monthly Spend</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {budgets.map(b => (
                  <tr key={b.agent_id} className="text-gray-300">
                    <td className="py-2.5 text-xs font-mono text-gray-400">{(b.agent_id ?? '').slice(0, 12)}…</td>
                    <td className="py-2.5 text-xs">${b.daily_spend.toFixed(4)} / ${b.daily_limit.toFixed(2)}</td>
                    <td className="py-2.5 text-xs">${b.monthly_spend.toFixed(4)} / ${b.monthly_limit.toFixed(2)}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.status === 'exceeded' ? 'bg-red-950 text-red-400 border border-red-900' :
                        b.status === 'warning' ? 'bg-yellow-950 text-yellow-400 border border-yellow-900' :
                        'bg-emerald-950 text-emerald-400 border border-emerald-900'
                      }`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Platform stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Agents', value: stats.total_agents ?? 0 },
            { label: 'Total Traces', value: stats.total_traces ?? 0 },
            { label: 'Active Incidents', value: stats.active_incidents ?? 0 },
            { label: 'Error Rate', value: `${((stats.error_rate ?? 0) * 100).toFixed(1)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
