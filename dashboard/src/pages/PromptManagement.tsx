import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Save, Trash2, Copy, Check,
  Tag, Bot, Search, History, GitBranch, RefreshCw, X,
} from 'lucide-react'
import api from '../services/api'

type Prompt = {
  id: string; name: string; description: string; content: string
  version: number; agent_id: string; tags: string; is_active: boolean
  created_by: string; created_at: string; updated_at: string
}
type Agent = { id: string; name: string; status: string }

export default function PromptManagement() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Prompt | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyFor, setHistoryFor] = useState<Prompt | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', description: '', content: '', agent_id: '', tags: '' })
  const [isNew, setIsNew] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState('')

  const { data: promptsData, isFetching, refetch } = useQuery({
    queryKey: ['prompts'],
    queryFn: async () => { const { data } = await api.get('/prompts'); return data },
  })
  const prompts: Prompt[] = promptsData?.prompts ?? []

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })
  const agents: Agent[] = Array.isArray(agentsData) ? agentsData : []

  const { data: versionsData } = useQuery({
    queryKey: ['prompt-versions', historyFor?.id],
    queryFn: async () => { const { data } = await api.get(`/prompts/${historyFor!.id}/versions`); return data },
    enabled: !!historyFor,
  })
  const versions: Prompt[] = versionsData?.versions ?? []

  const createMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post('/prompts', {
      name: form.name, description: form.description, content: form.content,
      agent_id: form.agent_id || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }); return data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); setIsNew(false); setMutationError('') },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to create prompt'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => { const { data } = await api.put(`/prompts/${selected!.id}`, {
      description: form.description, content: form.content,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }); return data },
    onSuccess: (newVersion) => {
      qc.invalidateQueries({ queryKey: ['prompts'] })
      setSelected(newVersion)
      setMutationError('')
    },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to save prompt'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/prompts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); setSelected(null); setDeleteConfirm(null); setMutationError('') },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to delete prompt'),
  })

  // Deduplicate by name (show latest version only in list)
  const latestByName = Object.values(
    prompts.reduce((acc, p) => {
      if (!acc[p.name] || p.version > acc[p.name].version) acc[p.name] = p
      return acc
    }, {} as Record<string, Prompt>)
  ).sort((a, b) => a.name.localeCompare(b.name))

  const filtered = search
    ? latestByName.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.content.toLowerCase().includes(search.toLowerCase()))
    : latestByName

  const selectPrompt = (p: Prompt) => {
    setSelected(p); setIsNew(false)
    const tags = (() => { try { const t = JSON.parse(p.tags); return Array.isArray(t) ? t.join(', ') : '' } catch { return '' } })()
    setForm({ name: p.name, description: p.description, content: p.content, agent_id: p.agent_id ?? '', tags })
  }

  const startNew = () => {
    setSelected(null); setIsNew(true)
    setForm({ name: '', description: '', content: '', agent_id: '', tags: '' })
  }

  const copy = () => {
    navigator.clipboard.writeText(form.content)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? id?.slice(0, 12)

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)]">
      {/* Left: Prompt list */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" /> Prompts
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={() => refetch()} className="p-1.5 rounded-lg text-gray-500 hover:text-white bg-gray-800">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={startNew}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-xs">
              {search ? 'No prompts match your search' : 'No prompts yet. Create one →'}
            </div>
          )}
          {filtered.map(p => (
            <div key={p.id}
              onClick={() => selectPrompt(p)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${selected?.name === p.name ? 'border-indigo-500 bg-indigo-950/30' : 'border-gray-800 hover:border-gray-700 bg-gray-900'}`}>
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm font-medium text-gray-100 truncate flex-1">{p.name}</span>
                <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full flex-shrink-0">v{p.version}</span>
              </div>
              {p.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                {p.agent_id && (
                  <span className="text-xs text-indigo-400 flex items-center gap-1">
                    <Bot className="h-2.5 w-2.5" />{agentName(p.agent_id)}
                  </span>
                )}
                <span className="text-xs text-gray-600 ml-auto">{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
              {(() => {
                try {
                  const t = JSON.parse(p.tags)
                  return Array.isArray(t) && t.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Tag className="h-2 w-2" />{tag}
                        </span>
                      ))}
                    </div>
                  ) : null
                } catch { return null }
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* Right: Editor */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {mutationError && (
          <div className="flex items-center justify-between gap-2 bg-red-950 border border-red-900 rounded-lg px-4 py-2.5 text-sm text-red-400 flex-shrink-0">
            <span>{mutationError}</span>
            <button onClick={() => setMutationError('')} className="text-red-500 hover:text-red-300 flex-shrink-0 text-xs">✕</button>
          </div>
        )}
        {!selected && !isNew ? (
          <div className="flex-1 flex items-center justify-center bg-gray-900 border border-gray-800 rounded-xl">
            <div className="text-center">
              <FileText className="h-10 w-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Select a prompt to edit or create a new one</p>
              <button onClick={startNew} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
                + Create first prompt
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  {isNew ? (
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Prompt name…"
                      className="bg-transparent text-lg font-semibold text-white placeholder-gray-600 outline-none border-b border-gray-700 focus:border-indigo-500 pb-0.5" />
                  ) : (
                    <h2 className="text-lg font-semibold text-white">{form.name}</h2>
                  )}
                  {selected && <p className="text-xs text-gray-500 mt-0.5">v{selected.version} · by {selected.created_by || 'system'}</p>}
                </div>
                {selected && (
                  <span className="text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <GitBranch className="h-2.5 w-2.5" /> v{selected.version}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selected && (
                  <>
                    <button onClick={() => { setHistoryFor(selected); setShowHistory(true) }}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
                      <History className="h-3.5 w-3.5" /> History
                    </button>
                    <button onClick={() => setDeleteConfirm(selected.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 bg-gray-800">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button onClick={copy} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => isNew ? createMutation.mutate() : updateMutation.mutate()}
                  disabled={(isNew ? createMutation : updateMutation).isPending || (!isNew && !form.content) || (isNew && (!form.name || !form.content))}
                  className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg">
                  <Save className="h-3.5 w-3.5" />
                  {isNew ? 'Create' : `Save as v${(selected?.version ?? 0) + 1}`}
                </button>
              </div>
            </div>

            {/* Description + Meta */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description of what this prompt does…"
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500">
                  <option value="">All agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="tag1, tag2…"
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            {/* Content editor */}
            <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-800/40">
                <span className="text-xs text-gray-500 font-mono">prompt content</span>
                <span className="text-xs text-gray-600">{form.content.length} chars · {form.content.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={'Write your prompt here...\n\nYou are a helpful assistant. Your task is to...\n\n{{user_input}}'}
                className="flex-1 w-full bg-transparent px-4 py-3 text-sm text-gray-200 font-mono placeholder-gray-700 focus:outline-none resize-none"
              />
            </div>

            {/* Delete confirm modal */}
            {deleteConfirm && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80">
                  <h3 className="text-white font-medium mb-2">Delete this version?</h3>
                  <p className="text-sm text-gray-400 mb-4">This removes only this version. Other versions remain intact.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700">Cancel</button>
                    <button onClick={() => deleteMutation.mutate(deleteConfirm)} className="flex-1 py-2 text-sm text-white bg-red-700 rounded-lg hover:bg-red-600">Delete</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Version History Drawer */}
      {showHistory && historyFor && (
        <div className="w-80 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-white">{historyFor.name} — History</span>
            </div>
            <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
            {versions.map((v, i) => (
              <div key={v.id}
                onClick={() => selectPrompt(v)}
                className={`p-4 cursor-pointer hover:bg-gray-800/50 transition-colors ${selected?.id === v.id ? 'bg-indigo-950/30' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-indigo-300">v{v.version}</span>
                    {i === 0 && <span className="text-xs bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded-full">latest</span>}
                  </div>
                  <span className="text-xs text-gray-500">{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-gray-500">{v.created_by || 'system'}</p>
                <p className="text-xs text-gray-600 mt-1 font-mono truncate">{v.content.slice(0, 80)}{v.content.length > 80 ? '…' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
