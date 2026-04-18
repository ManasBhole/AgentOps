import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { Dna, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import api from '../services/api'

type Genome = {
  id: string
  agent_id: string
  window_start: string
  error_rate: number
  avg_latency_ms: number
  avg_cost_usd: number
  health_score: number
  avg_tokens: number
  drift_score: number
  is_drifted: boolean
  computed_at: string
}

type Agent = { id: string; name: string; status: string }

const DRIFT_THRESHOLD = 0.25

export default function GenomeDrift() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data } = await api.get('/agents')
      return Array.isArray(data?.agents) ? data.agents : []
    },
  })

  const { data: fleetGenomes = [], refetch: refetchFleet, isFetching } = useQuery<Genome[]>({
    queryKey: ['genome-fleet'],
    queryFn: async () => {
      const { data } = await api.get('/genome/fleet')
      return Array.isArray(data) ? data : []
    },
  })

  const { data: agentHistory = [] } = useQuery<Genome[]>({
    queryKey: ['genome-agent', selectedAgent],
    queryFn: async () => {
      const { data } = await api.get(`/genome/${selectedAgent}`, { params: { limit: 30 } })
      return Array.isArray(data) ? data : []
    },
    enabled: !!selectedAgent,
  })

  const computeMutation = useMutation({
    mutationFn: (agentID: string) => api.post(`/genome/${agentID}/compute`),
    onSuccess: () => refetchFleet(),
  })

  const driftedCount = fleetGenomes.filter(g => g.is_drifted).length

  const radarData = (g: Genome) => [
    { metric: 'Health', value: g.health_score },
    { metric: 'Error Rate', value: (1 - g.error_rate) * 100 },
    { metric: 'Latency', value: Math.max(0, 100 - g.avg_latency_ms / 50) },
    { metric: 'Cost', value: Math.max(0, 100 - g.avg_cost_usd * 10000) },
    { metric: 'Tokens', value: Math.max(0, 100 - g.avg_tokens / 200) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dna className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Agent Genome Drift</h1>
            <p className="text-sm text-gray-500">Behavioral fingerprint comparison — detect when agents change personality</p>
          </div>
        </div>
        <button onClick={() => refetchFleet()}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Agents tracked', value: fleetGenomes.length, color: 'text-white' },
          { label: 'Drifted agents', value: driftedCount, color: driftedCount > 0 ? 'text-orange-400' : 'text-emerald-400' },
          { label: 'Stable agents', value: fleetGenomes.length - driftedCount, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Agent selector + compute */}
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
        <Dna className="h-3.5 w-3.5 text-gray-500" />
        <select
          value={selectedAgent ?? ''}
          onChange={e => setSelectedAgent(e.target.value || null)}
          className="bg-transparent text-sm text-gray-300 border-0 outline-none cursor-pointer flex-1"
        >
          <option value="">Select agent to compute genome…</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
        </select>
        {selectedAgent && (
          <button
            onClick={() => computeMutation.mutate(selectedAgent)}
            disabled={computeMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
          >
            {computeMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Dna className="h-3 w-3" />}
            Compute
          </button>
        )}
      </div>

      {/* Agent history drift chart */}
      {selectedAgent && agentHistory.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-white">Drift score history</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={[...agentHistory].reverse().map(g => ({
              t: new Date(g.computed_at).toLocaleDateString(),
              drift: parseFloat(g.drift_score.toFixed(3)),
            }))}>
              <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 1]} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
              <ReferenceLine y={DRIFT_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'threshold', fill: '#f59e0b', fontSize: 10 }} />
              <Line type="monotone" dataKey="drift" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: '#a78bfa' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fleet drift table */}
      <div className="space-y-2">
        {fleetGenomes.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
            No genome data yet. Select an agent above and click Compute to build the first snapshot.
          </div>
        )}
        {fleetGenomes.map(genome => {
          const isExpanded = expanded === genome.id
          return (
            <div key={genome.id} className={`border rounded-xl overflow-hidden transition-all ${genome.is_drifted ? 'border-orange-900 bg-orange-950/20' : 'border-gray-800'}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : genome.id)}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${genome.is_drifted ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-100">{genome.agent_id}</span>
                    {genome.is_drifted && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-900 text-orange-300 rounded-full">
                        <AlertTriangle className="h-3 w-3" /> Drifted
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Drift score: {genome.drift_score.toFixed(3)} · Health: {genome.health_score.toFixed(0)} · Error rate: {(genome.error_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-700 rounded-full">
                    <div className={`h-2 rounded-full ${genome.drift_score >= 0.5 ? 'bg-red-500' : genome.drift_score >= 0.25 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.min(100, genome.drift_score * 100)}%` }} />
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-800 px-4 py-4 bg-gray-900/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      {[
                        ['Error Rate', `${(genome.error_rate * 100).toFixed(2)}%`],
                        ['Avg Latency', `${genome.avg_latency_ms.toFixed(0)}ms`],
                        ['Avg Cost', `$${genome.avg_cost_usd.toFixed(4)}`],
                        ['Health Score', genome.health_score.toFixed(0)],
                        ['Avg Tokens', genome.avg_tokens.toFixed(0)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between text-xs">
                          <span className="text-gray-500">{label}</span>
                          <span className="text-gray-200 font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <RadarChart data={radarData(genome)}>
                        <PolarGrid stroke="#374151" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 10 }} />
                        <Radar dataKey="value" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs text-gray-500">Computed {new Date(genome.computed_at).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
