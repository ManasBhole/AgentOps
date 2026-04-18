import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Rocket, Scale, ShieldAlert, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../services/api'

type Deployment = {
  id: string
  agent_id: string
  namespace: string
  replicas: number
  status: string
  config: string
  created_at: string
  updated_at: string
}

type Agent = {
  id: string
  name: string
  type: string
  version: string
  status: string
}

async function fetchDeployments(): Promise<Deployment[]> {
  const { data } = await api.get<{ deployments: Deployment[] }>('/orchestration/deployments')
  return data.deployments ?? []
}

async function fetchAgents(): Promise<Agent[]> {
  const { data } = await api.get<{ agents: Agent[] }>('/agents')
  return data.agents ?? []
}

async function deployAgent(body: { agent_id: string; namespace: string; replicas: number }) {
  const { data } = await api.post('/orchestration/deploy', body)
  return data
}

async function scaleDeployment(body: { deployment_id: string; replicas: number }) {
  const { data } = await api.post('/orchestration/scale', body)
  return data
}

async function setCircuitBreaker(body: {
  agent_id: string
  settings: { enabled: boolean; threshold: number; timeout_s: number }
}) {
  const { data } = await api.post('/orchestration/circuit-breaker', body)
  return data
}

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-emerald-900/60 text-emerald-300',
  pending: 'bg-yellow-900/60 text-yellow-300',
  error:   'bg-red-900/60 text-red-300',
  scaled:  'bg-blue-900/60 text-blue-300',
}

const NS_STYLES: Record<string, string> = {
  production: 'bg-red-900/40 text-red-300',
  staging:    'bg-yellow-900/40 text-yellow-300',
  dev:        'bg-gray-800 text-gray-400',
}

export default function Orchestration() {
  const queryClient = useQueryClient()

  const { data: deployments, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    refetchInterval: 15_000,
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  })

  const [deployForm, setDeployForm] = useState({ agent_id: '', namespace: 'production', replicas: 1 })
  const [showDeploy, setShowDeploy] = useState(false)
  const [scaleTarget, setScaleTarget] = useState<{ id: string; current: number } | null>(null)
  const [scaleReplicas, setScaleReplicas] = useState(1)
  const [cbTarget, setCbTarget] = useState('')
  const [cbSettings, setCbSettings] = useState({ enabled: true, threshold: 5, timeout_s: 30 })
  const [showCb, setShowCb] = useState(false)
  const [orchError, setOrchError] = useState('')

  const deployMutation = useMutation({
    mutationFn: deployAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setShowDeploy(false)
      setDeployForm({ agent_id: '', namespace: 'production', replicas: 1 })
      setOrchError('')
    },
    onError: (e: any) => setOrchError(e?.response?.data?.error ?? 'Deploy failed'),
  })

  const scaleMutation = useMutation({
    mutationFn: scaleDeployment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setScaleTarget(null)
      setOrchError('')
    },
    onError: (e: any) => setOrchError(e?.response?.data?.error ?? 'Scale failed'),
  })

  const cbMutation = useMutation({
    mutationFn: setCircuitBreaker,
    onSuccess: () => {
      setShowCb(false)
      setCbTarget('')
      setOrchError('')
    },
    onError: (e: any) => setOrchError(e?.response?.data?.error ?? 'Circuit breaker update failed'),
  })

  const activeCount  = deployments?.filter(d => d.status === 'active').length  ?? 0
  const totalReplicas = deployments?.reduce((sum, d) => sum + d.replicas, 0) ?? 0

  return (
    <div className="space-y-4">
      {orchError && (
        <div className="flex items-center justify-between gap-2 bg-red-950 border border-red-900 rounded-lg px-4 py-2.5 text-sm text-red-400">
          <span>{orchError}</span>
          <button onClick={() => setOrchError('')} className="text-red-500 hover:text-red-300 text-xs">✕</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Orchestration</h1>
          <p className="text-sm text-gray-500 mt-0.5">Deploy, scale, and protect agent fleets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowDeploy(v => !v)}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Rocket className="h-4 w-4" /> Deploy Agent
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Deployments',    value: deployments?.length ?? 0, color: 'text-white' },
          { label: 'Active',         value: activeCount,               color: activeCount > 0 ? 'text-emerald-400' : 'text-gray-400' },
          { label: 'Total Replicas', value: totalReplicas,             color: 'text-blue-400' },
          { label: 'Namespaces',     value: new Set(deployments?.map(d => d.namespace)).size, color: 'text-gray-300' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Deploy form */}
      {showDeploy && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">New Deployment</h3>
          <form onSubmit={e => { e.preventDefault(); if (!deployForm.agent_id) return; deployMutation.mutate(deployForm) }}
            className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agent *</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={deployForm.agent_id}
                onChange={e => setDeployForm(f => ({ ...f, agent_id: e.target.value }))}>
                <option value="">Select agent…</option>
                {agents?.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.version})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Namespace</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={deployForm.namespace}
                onChange={e => setDeployForm(f => ({ ...f, namespace: e.target.value }))}>
                <option value="production">production</option>
                <option value="staging">staging</option>
                <option value="dev">dev</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Replicas</label>
              <input type="number" min={1} max={20}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={deployForm.replicas}
                onChange={e => setDeployForm(f => ({ ...f, replicas: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <button type="submit" disabled={deployMutation.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {deployMutation.isPending ? 'Deploying…' : 'Deploy'}
            </button>
            <button type="button" onClick={() => setShowDeploy(false)}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
              Cancel
            </button>
          </form>
          {deployMutation.isError && (
            <p className="mt-2 text-xs text-red-400">Deployment failed. Check API.</p>
          )}
        </div>
      )}

      {/* Circuit breaker */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button onClick={() => setShowCb(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-medium text-white">Circuit Breaker</span>
            <span className="text-xs text-gray-500">Protect agents from cascading failures</span>
          </div>
          {showCb
            ? <ChevronUp className="h-4 w-4 text-gray-500" />
            : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </button>

        {showCb && (
          <div className="px-4 pb-4 border-t border-gray-800 pt-4">
            <form onSubmit={e => { e.preventDefault(); if (!cbTarget) return; cbMutation.mutate({ agent_id: cbTarget, settings: cbSettings }) }}
              className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent *</label>
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cbTarget}
                  onChange={e => setCbTarget(e.target.value)}>
                  <option value="">Select agent…</option>
                  {agents?.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Error threshold</label>
                <input type="number" min={1} max={100}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cbSettings.threshold}
                  onChange={e => setCbSettings(s => ({ ...s, threshold: parseInt(e.target.value) || 5 }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Timeout (s)</label>
                <input type="number" min={5} max={300}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cbSettings.timeout_s}
                  onChange={e => setCbSettings(s => ({ ...s, timeout_s: parseInt(e.target.value) || 30 }))}
                />
              </div>
              <button type="submit" disabled={cbMutation.isPending}
                className="px-4 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {cbMutation.isPending ? 'Saving…' : 'Apply'}
              </button>
            </form>
            {cbMutation.isSuccess && (
              <p className="mt-2 text-xs text-emerald-400">Circuit breaker configured.</p>
            )}
          </div>
        )}
      </div>

      {/* Deployments table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Active Deployments</span>
          <span className="text-xs text-gray-500">{deployments?.length ?? 0} deployments</span>
        </div>

        {isLoading && <div className="p-8 text-center text-sm text-gray-500">Loading deployments…</div>}

        {!isLoading && (deployments?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">
            No deployments yet. Click "Deploy Agent" to create one.
          </div>
        )}

        {!isLoading && (deployments?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Agent', 'Namespace', 'Replicas', 'Status', 'Last Updated', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments?.map((dep, i) => {
                  const agent = agents?.find(a => a.id === dep.agent_id)
                  return (
                    <tr key={dep.id}
                      className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-100">
                        {agent?.name ?? dep.agent_id}
                        {agent && <span className="ml-2 font-mono text-xs text-gray-500">{agent.version}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${NS_STYLES[dep.namespace] ?? 'bg-gray-800 text-gray-400'}`}>
                          {dep.namespace}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-200">{dep.replicas}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[dep.status] ?? 'bg-gray-800 text-gray-300'}`}>
                          {dep.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(dep.updated_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {scaleTarget?.id === dep.id ? (
                          <div className="flex items-center gap-2">
                            <input type="number" min={0} max={50}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-16"
                              value={scaleReplicas}
                              onChange={e => setScaleReplicas(parseInt(e.target.value) || 0)}
                            />
                            <button
                              onClick={() => scaleMutation.mutate({ deployment_id: dep.id, replicas: scaleReplicas })}
                              disabled={scaleMutation.isPending}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                              {scaleMutation.isPending ? '…' : 'Set'}
                            </button>
                            <button onClick={() => setScaleTarget(null)}
                              className="text-xs text-gray-500 hover:text-gray-300">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setScaleTarget({ id: dep.id, current: dep.replicas }); setScaleReplicas(dep.replicas) }}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                            <Scale className="h-3 w-3" /> Scale
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
