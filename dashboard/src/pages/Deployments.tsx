import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Rocket, Plus, RefreshCw, Trash2, ChevronDown, ChevronUp, Server, Loader2 } from 'lucide-react'
import api from '../services/api'

interface Deployment {
  id: string
  agent_id: string
  namespace: string
  replicas: number
  status: string
  config: string
  created_at: string
  updated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-emerald-950 text-emerald-400 border-emerald-900',
  pending: 'bg-yellow-950 text-yellow-400 border-yellow-900',
  failed:  'bg-red-950 text-red-400 border-red-900',
  stopped: 'bg-gray-800 text-gray-400 border-gray-700',
}

export default function Deployments() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ agent_id: '', namespace: 'default', replicas: '1' })

  const { data: deploymentsRaw, isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: async () => { const { data } = await api.get('/deployments'); return data ?? [] },
    refetchInterval: 15_000,
  })
  const deployments: Deployment[] = Array.isArray(deploymentsRaw) ? deploymentsRaw : []

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/deployments', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deployments'] }); setShowCreate(false); setForm({ agent_id: '', namespace: 'default', replicas: '1' }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/deployments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  })

  const handleCreate = () => {
    if (!form.agent_id.trim()) return
    createMutation.mutate({ agent_id: form.agent_id, namespace: form.namespace, replicas: parseInt(form.replicas) || 1, status: 'pending', config: '{}' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Deployments</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage agent deployments across namespaces</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="h-4 w-4" />
          New Deployment
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Create Deployment</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Agent ID</label>
              <input value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                placeholder="agent-uuid…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Namespace</label>
              <input value={form.namespace} onChange={e => setForm(f => ({ ...f, namespace: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Replicas</label>
              <input type="number" min={1} max={20} value={form.replicas} onChange={e => setForm(f => ({ ...f, replicas: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleCreate} disabled={createMutation.isPending || !form.agent_id.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Deploy
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {(['running', 'pending', 'failed', 'stopped'] as const).map(s => {
          const count = deployments.filter(d => d.status === s).length
          return (
            <div key={s} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white">{count}</div>
              <div className={`text-xs mt-1 capitalize px-2 py-0.5 rounded-full border inline-block ${STATUS_STYLES[s]}`}>{s}</div>
            </div>
          )
        })}
      </div>

      {/* Deployment list */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">All Deployments</h2>
          </div>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['deployments'] })}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
        ) : deployments.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">No deployments yet</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {deployments.map(dep => {
              const isOpen = expanded === dep.id
              const cfg = (() => { try { return JSON.parse(dep.config) } catch { return null } })()
              return (
                <div key={dep.id}>
                  <div className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-300">{dep.id.slice(0, 12)}…</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${STATUS_STYLES[dep.status] ?? STATUS_STYLES.stopped}`}>{dep.status}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Agent: <span className="text-gray-400 font-mono">{dep.agent_id.slice(0, 12)}…</span>
                        &nbsp;·&nbsp;ns: <span className="text-gray-400">{dep.namespace}</span>
                        &nbsp;·&nbsp;{dep.replicas} replica{dep.replicas !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setExpanded(isOpen ? null : dep.id)}
                        className="text-gray-500 hover:text-white transition-colors p-1">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteMutation.mutate(dep.id)}
                        disabled={deleteMutation.isPending}
                        className="text-gray-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-4 bg-gray-950 border-t border-gray-800">
                      <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
                        <div>
                          <span className="text-gray-500">Created</span>
                          <div className="text-gray-300 mt-0.5">{new Date(dep.created_at).toLocaleString()}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Updated</span>
                          <div className="text-gray-300 mt-0.5">{new Date(dep.updated_at).toLocaleString()}</div>
                        </div>
                        {cfg && Object.keys(cfg).length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Config</span>
                            <pre className="mt-1 bg-gray-900 border border-gray-800 rounded-lg p-2 text-gray-300 text-xs overflow-x-auto">{JSON.stringify(cfg, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
