import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { DollarSign, TrendingUp, RefreshCw, Layers } from 'lucide-react'
import api from '../services/api'
import ExportButton from '../components/ExportButton'

type BreakdownItem = {
  agent_id: string
  agent_name: string
  total_cost_usd: number
  trace_count: number
  tokens_used: number
  avg_cost_per_call: number
  pct_of_total: number
}

type BreakdownData = {
  items: BreakdownItem[]
  total_cost_usd: number
  period_days: number
}

type DailyCostRow = {
  day: string
  agent_id: string
  cost_usd: number
}

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

export default function CostAllocation() {
  const { data: breakdown, isLoading, refetch, isFetching } = useQuery<BreakdownData>({
    queryKey: ['cost-breakdown'],
    queryFn: async () => {
      const { data } = await api.get('/cost/breakdown')
      return data
    },
  })

  const { data: daily = [] } = useQuery<DailyCostRow[]>({
    queryKey: ['cost-daily'],
    queryFn: async () => {
      const { data } = await api.get('/cost/daily')
      return Array.isArray(data) ? data : []
    },
  })

  const items = breakdown?.items ?? []
  const total = breakdown?.total_cost_usd ?? 0

  // Build daily aggregate for line chart
  const dailyAgg: Record<string, number> = {}
  for (const row of daily) {
    dailyAgg[row.day] = (dailyAgg[row.day] ?? 0) + row.cost_usd
  }
  const dailyData = Object.entries(dailyAgg)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cost]) => ({ day: day.slice(5), cost: parseFloat(cost.toFixed(4)) }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Cost Allocation</h1>
            <p className="text-sm text-gray-500">30-day spend breakdown by agent with chargeback attribution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={items.map(i => ({ agent: i.agent_name, total_cost_usd: i.total_cost_usd, pct_of_total: i.pct_of_total, calls: i.trace_count, avg_per_call: i.avg_cost_per_call, tokens: i.tokens_used }))}
            filename="cost-allocation"
          />
          <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Spend (30d)', value: `$${total.toFixed(4)}`, icon: DollarSign, color: 'text-emerald-400' },
          { label: 'Agents with spend', value: items.length, icon: Layers, color: 'text-blue-400' },
          { label: 'Avg per agent', value: items.length ? `$${(total / items.length).toFixed(4)}` : '$0', icon: TrendingUp, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <div className={`text-xl font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-white mb-3">Cost Distribution</div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No cost data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={items.slice(0, 7)} dataKey="total_cost_usd" nameKey="agent_name" cx="50%" cy="50%"
                  outerRadius={80} label={({ name, pct_of_total }) => `${String(name).slice(0, 12)} ${typeof pct_of_total === 'number' ? pct_of_total.toFixed(0) : 0}%`}>
                  {items.slice(0, 7).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, 'Cost']}
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Daily trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-white mb-3">Daily Spend Trend</div>
          {dailyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No daily data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-45} textAnchor="end" />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, 'Cost']}
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Line type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chargeback table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-sm font-medium text-white">Chargeback by Agent</div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No data — route some LLM calls through the model router to see costs</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Agent', 'Total Cost', '% of Total', 'Calls', 'Avg / Call', 'Tokens'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.sort((a, b) => b.total_cost_usd - a.total_cost_usd).map((item, i) => (
                  <tr key={item.agent_id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-200 font-medium truncate max-w-[120px]">{item.agent_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-mono">${item.total_cost_usd.toFixed(4)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${item.pct_of_total}%` }} />
                        </div>
                        <span className="text-gray-400">{item.pct_of_total.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{item.trace_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono">${item.avg_cost_per_call.toFixed(5)}</td>
                    <td className="px-4 py-3 text-gray-400">{item.tokens_used.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
