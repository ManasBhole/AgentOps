import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Radiation, Play, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, RefreshCw, Zap, Activity, TrendingUp,
} from 'lucide-react'
import api from '../services/api'

interface Agent { id: string; name: string }

interface BlastResult {
  agent_id: string
  agent_name: string
  depth: number
  impact_prob: number
  err_rate_delta: number
  lat_delta_ms: number
  current_err_rate: number
  current_p95_lat_ms: number
  current_health: number
  call_frequency: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

interface SimOutput {
  simulation_id: string
  source_agent_id: string
  change_type: string
  change_desc: string
  iterations: number
  results: BlastResult[]
  total_affected: number
  max_depth: number
  created_at: string
}

const CHANGE_TYPES = [
  { value: 'deploy',     label: 'New Deploy',    icon: '🚀', amplifier: 'Moderate risk', color: 'text-indigo-400' },
  { value: 'config',     label: 'Config Change', icon: '⚙️', amplifier: 'Lower risk',    color: 'text-blue-400' },
  { value: 'scale_down', label: 'Scale Down',    icon: '📉', amplifier: 'High risk',     color: 'text-red-400' },
  { value: 'rollback',   label: 'Rollback',      icon: '↩️', amplifier: 'Lowest risk',   color: 'text-emerald-400' },
]

const SEV_STYLE: Record<string, string> = {
  critical: 'bg-red-950/60 border-red-800 text-red-300',
  high:     'bg-orange-950/60 border-orange-800 text-orange-300',
  medium:   'bg-yellow-950/60 border-yellow-800 text-yellow-300',
  low:      'bg-gray-800/60 border-gray-700 text-gray-400',
}

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-gray-500',
}

const SEV_ICON: Record<string, React.ElementType> = {
  critical: AlertTriangle,
  high:     AlertTriangle,
  medium:   Activity,
  low:      CheckCircle2,
}

function ImpactBar({ prob, severity }: { prob: number; severity: string }) {
  const colorMap: Record<string, string> = {
    critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-500',
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorMap[severity]}`}
          style={{ width: `${prob * 100}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-10 text-right">{(prob * 100).toFixed(1)}%</span>
    </div>
  )
}

function DepthTree({ results }: { results: BlastResult[] }) {
  const byDepth: Record<number, BlastResult[]> = {}
  for (const r of results) {
    byDepth[r.depth] = [...(byDepth[r.depth] ?? []), r]
  }
  const depths = Object.keys(byDepth).map(Number).sort()

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-2">
      {depths.map((d, di) => (
        <div key={d} className="flex items-start">
          {di > 0 && (
            <div className="flex items-center self-center px-1">
              <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <div className="text-xs text-gray-600 font-medium mb-1 text-center">
              {d === 1 ? 'Direct' : `${d} hops`}
            </div>
            {byDepth[d].slice(0, 4).map(r => {
              const Icon = SEV_ICON[r.severity]
              return (
                <div key={r.agent_id}
                  className={`border rounded-lg px-2.5 py-2 text-xs ${SEV_STYLE[r.severity]}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEV_DOT[r.severity]}`} />
                    <span className="font-medium truncate max-w-[100px]">
                      {r.agent_name || r.agent_id.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Icon className="h-3 w-3 flex-shrink-0 opacity-70" />
                    <span className="opacity-80">{(r.impact_prob * 100).toFixed(0)}% impact</span>
                  </div>
                </div>
              )
            })}
            {byDepth[d].length > 4 && (
              <div className="text-xs text-gray-600 text-center">+{byDepth[d].length - 4} more</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function BlastRadius() {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [changeType, setChangeType] = useState('deploy')
  const [changeDesc, setChangeDesc] = useState('')
  const [result, setResult] = useState<SimOutput | null>(null)

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data as { agents: Agent[] } },
  })
  const agents: Agent[] = Array.isArray(agentsData?.agents) ? agentsData!.agents : []

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/blast-radius/simulate', {
        source_agent_id: selectedAgent,
        change_type: changeType,
        change_desc: changeDesc,
        iterations: 1000,
      })
      return data as SimOutput
    },
    onSuccess: (data) => setResult(data),
  })

  const criticalCount = result?.results.filter(r => r.severity === 'critical').length ?? 0
  const highCount     = result?.results.filter(r => r.severity === 'high').length ?? 0
  const selectedCT    = CHANGE_TYPES.find(c => c.value === changeType)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Radiation className="h-5 w-5 text-orange-400" />
          Blast Radius Simulator
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Monte Carlo simulation — see exactly which agents will be affected before you deploy
        </p>
      </div>

      {/* Config panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Agent picker */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Source Agent (the one changing)</label>
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
              <option value="">Select agent…</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name || a.id.slice(0, 16)}</option>
              ))}
            </select>
          </div>

          {/* Change type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Change Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {CHANGE_TYPES.map(ct => (
                <button key={ct.value} onClick={() => setChangeType(ct.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left
                    ${changeType === ct.value
                      ? 'bg-gray-700 border-gray-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                  <span>{ct.icon}</span>
                  <div>
                    <div>{ct.label}</div>
                    <div className={`text-xs font-normal opacity-70 ${ct.color}`}>{ct.amplifier}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description + run */}
          <div className="flex flex-col gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Description (optional)</label>
              <input value={changeDesc} onChange={e => setChangeDesc(e.target.value)}
                placeholder="e.g. upgrade model from gpt-4o-mini to gpt-4o"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500" />
            </div>
            <button onClick={() => simulateMutation.mutate()}
              disabled={!selectedAgent || simulateMutation.isPending}
              className="flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {simulateMutation.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Simulating 1000 iterations…</>
                : <><Play className="h-4 w-4" /> Run Simulation</>}
            </button>
          </div>
        </div>

        {/* Info strip */}
        <div className="text-xs text-gray-600 bg-gray-800/50 rounded-lg px-3 py-2">
          Monte Carlo runs <strong className="text-gray-400">1,000 iterations</strong> per downstream agent.
          Each iteration samples propagation probability from real call frequency data in your topology graph,
          then models error amplification using {selectedCT?.label} risk profile (<strong className={selectedCT?.color}>{selectedCT?.amplifier}</strong>).
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Agents Affected', value: result.total_affected, color: 'text-white', icon: Zap },
              { label: 'Critical Impact', value: criticalCount, color: 'text-red-400', icon: AlertTriangle },
              { label: 'High Impact', value: highCount, color: 'text-orange-400', icon: TrendingUp },
              { label: 'Max Depth', value: `${result.max_depth} hops`, color: 'text-indigo-400', icon: Clock },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Critical alert */}
          {criticalCount > 0 && (
            <div className="flex items-start gap-3 bg-red-950/40 border border-red-800 rounded-xl p-4">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-300">
                  {criticalCount} agent{criticalCount > 1 ? 's' : ''} at critical risk
                </div>
                <div className="text-xs text-red-400/80 mt-0.5">
                  These agents have &gt;50% probability of impact and significant error rate increase.
                  Consider a staged rollout or blue-green deployment.
                </div>
              </div>
            </div>
          )}

          {result.total_affected === 0 && (
            <div className="flex items-center gap-3 bg-emerald-950/30 border border-emerald-800 rounded-xl p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="text-sm font-semibold text-emerald-300">No downstream impact detected</div>
                <div className="text-xs text-emerald-600 mt-0.5">
                  This agent has no known downstream dependencies in the topology graph. Safe to deploy.
                </div>
              </div>
            </div>
          )}

          {/* Blast tree visualization */}
          {result.results.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-sm font-semibold text-white mb-3">Propagation Tree</div>
              <DepthTree results={result.results} />
            </div>
          )}

          {/* Agent table */}
          {result.results.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <span className="text-sm font-semibold text-white">Affected Agents — Ranked by Impact</span>
              </div>
              <div className="divide-y divide-gray-800/60">
                {result.results.map(r => {
                  const Icon = SEV_ICON[r.severity]
                  return (
                    <div key={r.agent_id} className="px-5 py-3 hover:bg-gray-800/30">
                      <div className="flex items-center gap-4">
                        {/* Severity + name */}
                        <div className="flex items-center gap-2 w-48 flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${SEV_DOT[r.severity]}`} />
                          <span className="text-sm text-gray-200 truncate">
                            {r.agent_name || r.agent_id.slice(0, 14)}
                          </span>
                        </div>

                        {/* Impact probability bar */}
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">Impact Probability</div>
                          <ImpactBar prob={r.impact_prob} severity={r.severity} />
                        </div>

                        {/* Deltas */}
                        <div className="flex gap-4 flex-shrink-0 text-xs">
                          <div className="text-center">
                            <div className="text-gray-500">Err Δ</div>
                            <div className={r.err_rate_delta > 0.1 ? 'text-red-400 font-medium' : 'text-gray-300'}>
                              +{(r.err_rate_delta * 100).toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">Lat Δ</div>
                            <div className={r.lat_delta_ms > 200 ? 'text-orange-400 font-medium' : 'text-gray-300'}>
                              +{r.lat_delta_ms.toFixed(0)}ms
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">Depth</div>
                            <div className="text-indigo-300">{r.depth}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">Health</div>
                            <div className={r.current_health < 50 ? 'text-red-400' : r.current_health < 80 ? 'text-yellow-400' : 'text-emerald-400'}>
                              {r.current_health || '—'}
                            </div>
                          </div>
                        </div>

                        {/* Severity badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0 ${SEV_STYLE[r.severity]}`}>
                          <Icon className="h-3 w-3" />
                          {r.severity}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-600 text-right">
            Simulation ID: {result.simulation_id} · {result.iterations.toLocaleString()} Monte Carlo iterations ·{' '}
            {new Date(result.created_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
