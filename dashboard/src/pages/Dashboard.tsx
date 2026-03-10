import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Bot, TrendingUp, Zap } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import api from '../services/api'

type Stats = {
  total_agents: number
  active_agents: number
  active_incidents: number
  total_traces: number
  error_traces: number
  avg_latency_ms: number
  error_rate: number
}

async function fetchStats(): Promise<Stats> {
  const { data } = await api.get<Stats>('/stats')
  return data
}

type Trace = {
  id: string
  status: string
  duration_ms: number
  start_time: string
}

async function fetchRecentTraces(): Promise<Trace[]> {
  const { data } = await api.get<{ traces: Trace[] }>('/traces', { params: { limit: 100 } })
  return data.traces ?? []
}

// Group traces into hourly buckets for the chart
function buildChartData(traces: Trace[]) {
  const buckets: Record<string, { traces: number; errors: number }> = {}
  traces.forEach((t) => {
    const hour = new Date(t.start_time).getHours()
    const label = `${String(hour).padStart(2, '0')}:00`
    if (!buckets[label]) buckets[label] = { traces: 0, errors: 0 }
    buckets[label].traces++
    if (t.status === 'error') buckets[label].errors++
  })
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, v]) => ({ time, ...v }))
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
  })

  const { data: traces } = useQuery({
    queryKey: ['traces'],
    queryFn: fetchRecentTraces,
    refetchInterval: 15_000,
  })

  const chartData = traces ? buildChartData(traces) : []

  const statCards = [
    {
      label: 'Total Agents',
      value: stats?.total_agents ?? 0,
      sub: `${stats?.active_agents ?? 0} active`,
      icon: Bot,
      iconColor: 'text-indigo-500',
    },
    {
      label: 'Active Incidents',
      value: stats?.active_incidents ?? 0,
      sub: 'requiring attention',
      icon: AlertTriangle,
      iconColor: 'text-red-500',
    },
    {
      label: 'Total Traces',
      value: (stats?.total_traces ?? 0).toLocaleString(),
      sub: `${(stats?.error_traces ?? 0).toLocaleString()} errors`,
      icon: Activity,
      iconColor: 'text-blue-500',
    },
    {
      label: 'Avg Latency',
      value: `${Math.round(stats?.avg_latency_ms ?? 0)} ms`,
      sub: `${(stats?.error_rate ?? 0).toFixed(1)}% error rate`,
      icon: TrendingUp,
      iconColor: 'text-green-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            Real-time overview of your AI agent operations
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Zap className="h-3 w-3" />
          Auto-refreshes every 15 s
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{card.label}</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {statsLoading ? (
                        <span className="text-gray-300 animate-pulse">—</span>
                      ) : (
                        card.value
                      )}
                    </dd>
                    <dd className="text-xs text-gray-400 mt-0.5">{card.sub}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trace activity chart */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Trace Activity (last 100 traces)</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400">No trace data yet — run an instrumented agent.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="traces"
                name="Traces"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="errors"
                name="Errors"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
