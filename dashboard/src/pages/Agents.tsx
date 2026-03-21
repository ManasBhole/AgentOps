import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react'
import api from '../services/api'
import { useFleetHealth, scoreColor, scoreBg, trendIcon } from '../hooks/useAgentHealth'
import ExportButton from '../components/ExportButton'

type Agent = {
  id: string
  name: string
  type: string
  version: string
  status: string
  created_at: string
  updated_at: string
}

async function fetchAgents(): Promise<Agent[]> {
  const { data } = await api.get<{ agents: Agent[] }>('/agents')
  return data.agents ?? []
}

async function createAgent(body: { name: string; type: string; version: string }): Promise<Agent> {
  const { data } = await api.post<{ agent: Agent }>('/agents', body)
  return data.agent
}

async function toggleAgent({ id, status }: { id: string; status: string }): Promise<Agent> {
  const newStatus = status === 'active' ? 'paused' : 'active'
  const { data } = await api.put<{ agent: Agent }>(`/agents/${id}`, { status: newStatus })
  return data.agent
}

async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`)
}

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-emerald-900/60 text-emerald-300',
  paused:  'bg-yellow-900/60 text-yellow-300',
  error:   'bg-red-900/60 text-red-300',
}

const TYPE_STYLES: Record<string, string> = {
  llm:          'bg-indigo-900/60 text-indigo-300',
  'tool-use':   'bg-purple-900/60 text-purple-300',
  rag:          'bg-cyan-900/60 text-cyan-300',
  'multi-agent':'bg-orange-900/60 text-orange-300',
  custom:       'bg-gray-800 text-gray-300',
}

export default function Agents() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'llm', version: '1.0.0' })
  const [agentError, setAgentError] = useState('')

  const { data: agents, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    refetchInterval: 15_000,
  })

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setShowForm(false)
      setForm({ name: '', type: 'llm', version: '1.0.0' })
      setAgentError('')
    },
    onError: (e: any) => setAgentError(e?.response?.data?.error ?? 'Failed to create agent'),
  })

  const toggleMutation = useMutation({
    mutationFn: toggleAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
    onError: (e: any) => setAgentError(e?.response?.data?.error ?? 'Failed to update agent'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
    onError: (e: any) => setAgentError(e?.response?.data?.error ?? 'Failed to delete agent'),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    createMutation.mutate(form)
  }

  const activeCount = agents?.filter(a => a.status === 'active').length ?? 0
  const pausedCount = agents?.filter(a => a.status === 'paused').length ?? 0
  const errorCount  = agents?.filter(a => a.status === 'error').length ?? 0

  const { data: fleetHealth } = useFleetHealth()
  const healthMap = Object.fromEntries((fleetHealth ?? []).map(h => [h.agent_id, h]))

  return (
    <div className="space-y-4">
      {agentError && (
        <div className="flex items-center justify-between gap-2 bg-red-950 border border-red-900 rounded-lg px-4 py-2.5 text-sm text-red-400">
          <span>{agentError}</span>
          <button onClick={() => setAgentError('')} className="text-red-500 hover:text-red-300 text-xs">✕</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Register and manage your AI agent fleet</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={(agents ?? []).map(a => ({ id: a.id, name: a.name, type: a.type, version: a.version, status: a.status, created_at: a.created_at }))}
            filename="agents"
          />
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> New Agent
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',   value: agents?.length ?? 0, color: 'text-white' },
          { label: 'Active',  value: activeCount,          color: activeCount > 0 ? 'text-emerald-400' : 'text-gray-400' },
          { label: 'Paused',  value: pausedCount,          color: pausedCount > 0 ? 'text-yellow-400' : 'text-gray-400' },
          { label: 'Error',   value: errorCount,           color: errorCount  > 0 ? 'text-red-400'    : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Register New Agent</h3>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
                placeholder="my-research-agent"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="llm">LLM</option>
                <option value="tool-use">Tool-use</option>
                <option value="rag">RAG</option>
                <option value="multi-agent">Multi-agent</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Version</label>
              <input
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
                placeholder="1.0.0"
                value={form.version}
                onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
              />
            </div>
            <button type="submit" disabled={createMutation.isPending}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
              Cancel
            </button>
          </form>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-400">Failed to create agent. Check API.</p>
          )}
        </div>
      )}

      {/* Agent table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Registered Agents</span>
          <span className="text-xs text-gray-500">{agents?.length ?? 0} total</span>
        </div>

        {isLoading && <div className="p-8 text-center text-sm text-gray-500">Loading agents…</div>}
        {isError   && <div className="p-8 text-center text-sm text-red-400">Failed to load agents. Check API.</div>}

        {!isLoading && !isError && (agents?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">
            No agents yet. Click "New Agent" to register one.
          </div>
        )}

        {!isLoading && !isError && (agents?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Type', 'Version', 'Status', 'Health', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents?.map((agent, i) => (
                  <tr key={agent.id}
                    className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-100">{agent.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLES[agent.type] ?? 'bg-gray-800 text-gray-300'}`}>
                        {agent.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-400">{agent.version}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[agent.status] ?? 'bg-gray-800 text-gray-300'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const h = healthMap[agent.id]
                        if (!h) return <span className="text-xs text-gray-600">—</span>
                        return (
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-semibold ${scoreBg(h.score)}`}>
                            <span className={scoreColor(h.score)}>{h.score}</span>
                            <span className="text-gray-500">{h.grade}</span>
                            <span className="text-gray-600">{trendIcon(h.trend)}</span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(agent.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <button title={agent.status === 'active' ? 'Pause' : 'Activate'}
                          onClick={() => toggleMutation.mutate({ id: agent.id, status: agent.status })}
                          className="text-gray-500 hover:text-indigo-400 transition-colors">
                          {agent.status === 'active'
                            ? <ToggleRight className="h-5 w-5 text-indigo-400" />
                            : <ToggleLeft className="h-5 w-5" />}
                        </button>
                        <button title="Delete"
                          onClick={() => deleteMutation.mutate(agent.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
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
