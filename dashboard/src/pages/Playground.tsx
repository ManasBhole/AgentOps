import { useState } from 'react'
import { FlaskConical, Play, Loader2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../services/api'
import { useQuery } from '@tanstack/react-query'

interface Agent { id: string; name: string; type: string; status: string }

interface TraceResult {
  id: string
  name: string
  status: string
  duration_ms: number
  attributes: string
}

const SAMPLE_TASKS = [
  'Summarize the latest system metrics and flag any anomalies',
  'Search for recent incidents and provide a root cause analysis',
  'Generate a weekly performance report for all agents',
  'Check budget usage and alert if any agent is near limit',
  'Analyze trace patterns and suggest optimization opportunities',
]

export default function Playground() {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TraceResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showAttrs, setShowAttrs] = useState(false)

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data },
  })

  const handleRun = async () => {
    if (!task.trim()) return
    setRunning(true)
    setResult(null)
    setError('')
    try {
      // POST a simulated trace to the API
      const agentId = selectedAgent || (agents[0]?.id ?? 'playground-agent')
      const { data } = await api.post('/traces', {
        agent_id: agentId,
        run_id: `playground-${Date.now()}`,
        trace_id: `trace-${Date.now()}`,
        span_id: `span-${Date.now()}`,
        parent_id: '',
        name: task.slice(0, 80),
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + Math.floor(Math.random() * 800 + 200)).toISOString(),
        duration_ms: Math.floor(Math.random() * 800 + 200),
        status: 'ok',
        attributes: JSON.stringify({
          'playground': true,
          'task': task,
          'agent.id': agentId,
          'llm.model': 'claude-sonnet-4-6',
          'llm.prompt_tokens': Math.floor(Math.random() * 400 + 100),
          'llm.completion_tokens': Math.floor(Math.random() * 200 + 50),
          'llm.cost_usd': parseFloat((Math.random() * 0.002).toFixed(6)),
        }),
        events: '[]',
      })
      setResult(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setError(msg)
    } finally {
      setRunning(false)
    }
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const attrs = result?.attributes ? (() => { try { return JSON.parse(result.attributes) } catch { return null } })() : null

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">Playground</h1>
        <p className="text-sm text-gray-400 mt-0.5">Send test traces to any agent and inspect the result in real time</p>
      </div>

      {/* Config */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Test Configuration</h2>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Target Agent</label>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">Auto-select first active agent</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Task / Prompt</label>
          <textarea
            rows={4}
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Describe the task you want to simulate…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Sample tasks */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Sample tasks:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TASKS.map(t => (
              <button key={t} onClick={() => setTask(t)}
                className="text-xs px-2.5 py-1 bg-gray-800 border border-gray-700 hover:border-indigo-600 hover:text-indigo-300 text-gray-400 rounded-lg transition-colors">
                {t.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={running || !task.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Running…' : 'Run Trace'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-xl p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Trace Result</h2>
            <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Status</div>
              <span className={`text-sm font-bold ${result.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.status.toUpperCase()}
              </span>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Duration</div>
              <span className="text-sm font-bold text-white">{result.duration_ms}ms</span>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Trace ID</div>
              <span className="text-xs font-mono text-indigo-400">{result.id?.slice(0, 8)}…</span>
            </div>
          </div>

          {attrs && (
            <div>
              <button onClick={() => setShowAttrs(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                {showAttrs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Attributes
              </button>
              {showAttrs && (
                <div className="mt-2 bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-300 space-y-1 border border-gray-800">
                  {Object.entries(attrs).map(([k, v]) => (
                    <div key={k}><span className="text-indigo-400">{k}</span>: <span className="text-gray-300">{String(v)}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-600">Trace saved → visible in <a href="/traces" className="text-indigo-400 hover:underline">Traces</a></p>
        </div>
      )}
    </div>
  )
}
