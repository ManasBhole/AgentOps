import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Loader2, RefreshCw,
  TrendingDown, ShieldAlert, Activity,
} from 'lucide-react'
import api from '../services/api'

type Agent = { id: string; name: string; status: string }

type ChaosExperiment = {
  id: string
  agent_id: string
  fault_type: string
  intensity: number
  duration_sec: number
  status: string
  results?: string
  notes: string
  created_by: string
  created_at: string
  completed_at?: string
}

type ChaosResult = {
  fault_type: string
  intensity: number
  projected_error_rate: number
  projected_latency_ms: number
  projected_health_drop: number
  recovery_time_sec: number
  affected_traces: number
  breached_slos: string[]
  recommendation: string
}

const FAULT_TYPES = [
  { value: 'latency_spike', label: 'Latency Spike', icon: '⏱', desc: 'Injects artificial latency into responses' },
  { value: 'error_injection', label: 'Error Injection', icon: '💥', desc: 'Forces a percentage of calls to fail' },
  { value: 'memory_pressure', label: 'Memory Pressure', icon: '🧠', desc: 'Simulates high memory consumption' },
  { value: 'network_partition', label: 'Network Partition', icon: '🔌', desc: 'Simulates network connectivity loss' },
]


function IntensitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = value < 0.3 ? 'Low' : value < 0.6 ? 'Medium' : value < 0.8 ? 'High' : 'Extreme'
  const color = value < 0.3 ? 'bg-emerald-500' : value < 0.6 ? 'bg-yellow-500' : value < 0.8 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Intensity</span>
        <span className={value < 0.3 ? 'text-emerald-400' : value < 0.6 ? 'text-yellow-400' : value < 0.8 ? 'text-orange-400' : 'text-red-400'}>
          {label} ({(value * 100).toFixed(0)}%)
        </span>
      </div>
      <input type="range" min="0.1" max="1" step="0.05" value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500" />
      <div className="w-full h-1.5 bg-gray-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: ChaosResult }) {
  const metrics = [
    { label: 'Projected Error Rate', value: `${(result.projected_error_rate * 100).toFixed(1)}%`, bad: result.projected_error_rate > 0.1 },
    { label: 'Projected Latency', value: `${result.projected_latency_ms.toFixed(0)}ms`, bad: result.projected_latency_ms > 2000 },
    { label: 'Health Drop', value: `-${result.projected_health_drop.toFixed(0)} pts`, bad: result.projected_health_drop > 20 },
    { label: 'Recovery Time', value: `${result.recovery_time_sec}s`, bad: result.recovery_time_sec > 60 },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => (
          <div key={m.label} className={`p-3 rounded-lg border ${m.bad ? 'bg-red-950/30 border-red-900' : 'bg-emerald-950/30 border-emerald-900'}`}>
            <div className="text-xs text-gray-500">{m.label}</div>
            <div className={`text-lg font-semibold mt-0.5 ${m.bad ? 'text-red-400' : 'text-emerald-400'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {result.breached_slos.length > 0 && (
        <div className="p-3 bg-red-950 border border-red-900 rounded-lg">
          <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-red-300 uppercase tracking-wider">
            <ShieldAlert className="h-3.5 w-3.5" /> SLO Breaches
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.breached_slos.map(slo => (
              <span key={slo} className="text-xs px-2 py-0.5 bg-red-900 text-red-300 rounded-full">{slo}</span>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 bg-indigo-950 border border-indigo-900 rounded-lg">
        <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Recommendation</div>
        <p className="text-sm text-indigo-200/80">{result.recommendation}</p>
      </div>
    </div>
  )
}

export default function ChaosEngineering() {
  const qc = useQueryClient()
  const [agentID, setAgentID] = useState('')
  const [faultType, setFaultType] = useState('latency_spike')
  const [intensity, setIntensity] = useState(0.5)
  const [durationSec, setDurationSec] = useState(30)
  const [notes, setNotes] = useState('')
  const [selectedResult, setSelectedResult] = useState<ChaosResult | null>(null)

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data } = await api.get('/agents')
      return Array.isArray(data?.agents) ? data.agents : []
    },
  })

  const { data: experiments = [], refetch, isFetching } = useQuery<ChaosExperiment[]>({
    queryKey: ['chaos-experiments'],
    queryFn: async () => {
      const { data } = await api.get('/chaos/experiments')
      return Array.isArray(data) ? data : []
    },
    refetchInterval: 5000,
  })

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/chaos/experiments', {
        agent_id: agentID, fault_type: faultType, intensity, duration_sec: durationSec, notes,
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chaos-experiments'] })
    },
  })

  const fetchResult = async (exp: ChaosExperiment) => {
    if (exp.results) {
      try { setSelectedResult(JSON.parse(exp.results)) } catch { /* */ }
    } else {
      const { data } = await api.get(`/chaos/experiments/${exp.id}`)
      if (data.results) {
        try { setSelectedResult(JSON.parse(data.results)) } catch { /* */ }
      }
    }
  }

  const statusBadge = (status: string) => {
    const c = status === 'completed' ? 'bg-emerald-900 text-emerald-300' :
              status === 'running' ? 'bg-yellow-900 text-yellow-300 animate-pulse' :
              status === 'failed' ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-300'
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c}`}>{status}</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Chaos Engineering</h1>
            <p className="text-sm text-gray-500">Inject controlled faults to test resilience before real failures happen</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Experiment builder */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="text-sm font-medium text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-yellow-400" /> New Experiment
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Target Agent</label>
            <select value={agentID} onChange={e => setAgentID(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500">
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400">Fault Type</label>
            <div className="grid grid-cols-2 gap-2">
              {FAULT_TYPES.map(ft => (
                <button key={ft.value} onClick={() => setFaultType(ft.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${faultType === ft.value ? 'border-indigo-600 bg-indigo-950/50' : 'border-gray-700 hover:border-gray-600'}`}>
                  <div className="text-base mb-1">{ft.icon}</div>
                  <div className="text-xs font-medium text-gray-200">{ft.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ft.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <IntensitySlider value={intensity} onChange={setIntensity} />

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Duration: {durationSec}s</label>
            <input type="range" min="10" max="300" step="10" value={durationSec}
              onChange={e => setDurationSec(parseInt(e.target.value))}
              className="w-full accent-indigo-500" />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              placeholder="Why are you running this experiment?" />
          </div>

          <button
            onClick={() => runMutation.mutate()}
            disabled={!agentID || runMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {runMutation.isPending ? 'Running…' : 'Run Experiment'}
          </button>
        </div>

        {/* Results panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-white">Simulation Results</div>
          {selectedResult ? (
            <ResultCard result={selectedResult} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600 text-sm">
              <Zap className="h-8 w-8 mb-2 opacity-30" />
              Run an experiment to see projected impact
            </div>
          )}
        </div>
      </div>

      {/* Experiment history */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-sm font-medium text-white">Experiment History</div>
        {experiments.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">No experiments yet</div>
        )}
        <div className="divide-y divide-gray-800">
          {experiments.map(exp => (
            <button key={exp.id} onClick={() => fetchResult(exp)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors">
              <div className="text-lg">{FAULT_TYPES.find(f => f.value === exp.fault_type)?.icon ?? '⚡'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-200">{FAULT_TYPES.find(f => f.value === exp.fault_type)?.label}</span>
                  {statusBadge(exp.status)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {exp.agent_id} · Intensity: {(exp.intensity * 100).toFixed(0)}% · {exp.duration_sec}s
                </div>
              </div>
              <div className="text-xs text-gray-600">{new Date(exp.created_at).toLocaleTimeString()}</div>
              {exp.status === 'completed' && <TrendingDown className="h-4 w-4 text-red-400 flex-shrink-0" />}
              {exp.status === 'running' && <Loader2 className="h-4 w-4 text-yellow-400 animate-spin flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
