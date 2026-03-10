import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../services/api'

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
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
}

export default function Agents() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'llm', version: '1.0.0' })

  const { data: agents, isLoading, isError } = useQuery({
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
    },
  })

  const toggleMutation = useMutation({
    mutationFn: toggleAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    createMutation.mutate(form)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Agents</h2>
          <p className="mt-1 text-sm text-gray-500">
            Register and manage your AI agent deployments
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Agent
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 bg-white shadow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Register New Agent</h3>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="my-research-agent"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="llm">LLM</option>
                <option value="tool-use">Tool-use</option>
                <option value="rag">RAG</option>
                <option value="multi-agent">Multi-agent</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Version</label>
              <input
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="1.0.0"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100"
            >
              Cancel
            </button>
          </form>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-500">Failed to create agent. Check API.</p>
          )}
        </div>
      )}

      {/* Agent table */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Registered Agents</h3>
          <span className="text-xs text-gray-500">{agents?.length ?? 0} total</span>
        </div>

        <div className="p-4">
          {isLoading && <p className="text-sm text-gray-400">Loading agents…</p>}
          {isError && <p className="text-sm text-red-500">Failed to load agents. Check API.</p>}

          {!isLoading && !isError && (agents?.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">
              No agents yet. Click "New Agent" to register one.
            </p>
          )}

          {!isLoading && !isError && (agents?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Type', 'Version', 'Status', 'Created', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {agents?.map((agent) => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{agent.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {agent.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">{agent.version}</td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            STATUS_STYLES[agent.status] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(agent.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            title={agent.status === 'active' ? 'Pause' : 'Activate'}
                            onClick={() => toggleMutation.mutate({ id: agent.id, status: agent.status })}
                            className="text-gray-400 hover:text-indigo-600"
                          >
                            {agent.status === 'active' ? (
                              <ToggleRight className="h-4 w-4 text-indigo-500" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            title="Delete"
                            onClick={() => deleteMutation.mutate(agent.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
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
    </div>
  )
}
