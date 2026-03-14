import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Search, Loader2, Clock, Database, BarChart2, AlertCircle, Sparkles } from 'lucide-react'
import api from '../services/api'

type NLQResult = {
  sql: string
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  chart_type: string
  duration_ms: number
}

type NLQHistoryItem = {
  id: string
  question: string
  generated_sql: string
  row_count: number
  chart_type: string
  duration_ms: number
  error?: string
  created_at: string
}

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

const EXAMPLE_QUERIES = [
  'Show me the top 5 agents by error rate in the last 24 hours',
  'How many incidents per day in the last 7 days?',
  'What is the average latency by agent?',
  'List all critical incidents that are still open',
  'Which models are used most frequently by the router?',
  'Show total cost per agent this month',
]

function Chart({ result }: { result: NLQResult }) {
  const { rows, columns, chart_type } = result
  if (!rows.length || !columns.length) {
    return <div className="text-center text-gray-500 py-8 text-sm">No data returned</div>
  }

  const numericCols = columns.filter(c => {
    const v = rows[0][c]
    return typeof v === 'number' || (!isNaN(Number(v)) && v !== null && v !== '')
  })
  const labelCol = columns.find(c => !numericCols.includes(c)) ?? columns[0]
  const valueCol = numericCols[0] ?? columns[1] ?? columns[0]

  const data = rows.slice(0, 50).map(r => ({
    ...r,
    [labelCol]: String(r[labelCol] ?? '').slice(0, 20),
    [valueCol]: Number(r[valueCol]) || 0,
  }))

  if (chart_type === 'pie' && data.length <= 12) {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey={valueCol} nameKey={labelCol} cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart_type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 32, left: 8 }}>
          <XAxis dataKey={labelCol} tick={{ fill: '#6b7280', fontSize: 11 }} angle={-30} textAnchor="end" />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
          <Line type="monotone" dataKey={valueCol} stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // Default bar
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, bottom: 32, left: 8 }}>
        <XAxis dataKey={labelCol} tick={{ fill: '#6b7280', fontSize: 11 }} angle={-30} textAnchor="end" />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
        <Bar dataKey={valueCol} fill="#6366f1" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function DataTable({ result }: { result: NLQResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            {result.columns.map(col => (
              <th key={col} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 100).map((row, i) => (
            <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
              {result.columns.map(col => (
                <td key={col} className="px-3 py-2 text-gray-300 font-mono whitespace-nowrap">
                  {row[col] === null ? <span className="text-gray-600">null</span> : String(row[col]).slice(0, 80)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.row_count > 100 && (
        <div className="px-3 py-2 text-xs text-gray-500">Showing first 100 of {result.row_count} rows</div>
      )}
    </div>
  )
}

export default function NLQ() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<NLQResult | null>(null)
  const [view, setView] = useState<'chart' | 'table' | 'sql'>('chart')

  const { data: history = [] } = useQuery<NLQHistoryItem[]>({
    queryKey: ['nlq-history'],
    queryFn: async () => {
      const { data } = await api.get('/nlq/history')
      return Array.isArray(data) ? data : []
    },
  })

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const { data } = await api.post('/nlq/query', { question: q })
      return data as NLQResult
    },
    onSuccess: (data) => {
      setResult(data)
      setView(data.chart_type === 'table' ? 'table' : 'chart')
    },
  })

  const submit = () => {
    if (!question.trim()) return
    mutation.mutate(question.trim())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Natural Language Query</h1>
          <p className="text-sm text-gray-500">Ask questions in plain English — Claude generates SQL and charts the results</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Show me the top 5 agents by error rate today..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>
          <button
            onClick={submit}
            disabled={mutation.isPending || !question.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mutation.isPending ? 'Querying…' : 'Ask Claude'}
          </button>
        </div>

        {/* Example queries */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => { setQuestion(q); mutation.mutate(q) }}
              className="text-xs px-2.5 py-1 bg-gray-800 border border-gray-700 hover:border-indigo-600 text-gray-400 hover:text-indigo-300 rounded-lg transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {mutation.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-900 rounded-lg text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {(mutation.error as Error).message}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> {result.row_count} rows</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {result.duration_ms}ms</span>
            </div>
            <div className="flex items-center gap-1">
              {(['chart', 'table', 'sql'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                >
                  {v === 'chart' ? <><BarChart2 className="h-3 w-3 inline mr-1" />Chart</> : v === 'table' ? 'Table' : 'SQL'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {view === 'chart' && <Chart result={result} />}
            {view === 'table' && <DataTable result={result} />}
            {view === 'sql' && (
              <pre className="text-xs text-emerald-400 font-mono bg-gray-950 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {result.sql}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 text-sm font-medium text-white">Recent queries</div>
          <div className="divide-y divide-gray-800">
            {history.slice(0, 10).map(h => (
              <button
                key={h.id}
                onClick={() => { setQuestion(h.question); mutation.mutate(h.question) }}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
              >
                <Clock className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{h.question}</div>
                  {h.error ? (
                    <div className="text-xs text-red-400 mt-0.5">{h.error}</div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-0.5">{h.row_count} rows · {h.duration_ms}ms · {h.chart_type}</div>
                  )}
                </div>
                <div className="text-xs text-gray-600 flex-shrink-0">{new Date(h.created_at).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
