import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Key, Webhook, Trash2, Plus, Copy, Eye, EyeOff,
  CheckCircle2, RefreshCw, Zap, Globe, AlertTriangle,
} from 'lucide-react'
import api from '../services/api'

type APIKey = {
  id: string; name: string; key_prefix: string
  active: boolean; last_used_at?: string; created_at: string
  key?: string // only present on creation
}

type WebhookItem = {
  id: string; name: string; url: string; events: string
  active: boolean; last_fired?: string; created_at: string
}

const EVENT_OPTIONS = [
  { value: 'incident.created',  label: 'Incident Created',  color: 'text-red-400' },
  { value: 'incident.resolved', label: 'Incident Resolved', color: 'text-emerald-400' },
  { value: 'trace.error',       label: 'Trace Error',       color: 'text-orange-400' },
  { value: '*',                 label: 'All Events',         color: 'text-indigo-400' },
]

export default function Settings() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'apikeys' | 'webhooks'>('apikeys')

  // API Keys
  const [newKeyName, setNewKeyName]   = useState('')
  const [createdKey, setCreatedKey]   = useState<APIKey | null>(null)
  const [revealedKey, setRevealedKey] = useState(false)
  const [copied, setCopied]           = useState(false)

  // Webhooks
  const [whName, setWhName]     = useState('')
  const [whURL, setWhURL]       = useState('')
  const [whEvents, setWhEvents] = useState<string[]>(['incident.created', 'incident.resolved'])
  const [testResult, setTestResult] = useState<Record<string, { status: number; msg: string }>>({})

  const { data: keysData, isFetching: keysFetching } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => { const { data } = await api.get('/api-keys'); return data.api_keys as APIKey[] },
  })

  const { data: hooksData, isFetching: hooksFetching } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => { const { data } = await api.get('/webhooks'); return data.webhooks as WebhookItem[] },
  })

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => { const { data } = await api.post('/api-keys', { name }); return data.api_key as APIKey },
    onSuccess: (key) => {
      setCreatedKey(key)
      setRevealedKey(true)
      setNewKeyName('')
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const createWebhookMutation = useMutation({
    mutationFn: async () => api.post('/webhooks', { name: whName, url: whURL, events: whEvents }),
    onSuccess: () => {
      setWhName(''); setWhURL(''); setWhEvents(['incident.created', 'incident.resolved'])
      qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => { const { data } = await api.post(`/webhooks/${id}/test`); return { id, ...data } },
    onSuccess: ({ id, status, message }) => setTestResult(r => ({ ...r, [id]: { status, msg: message } })),
  })

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleEvent = (ev: string) => {
    setWhEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
  }

  const parseEvents = (raw: string): string[] => {
    try { return JSON.parse(raw) } catch { return [] }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">API keys, webhooks, and integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {([['apikeys', Key, 'API Keys'], ['webhooks', Webhook, 'Webhooks']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── API Keys Tab ─────────────────────────────────────────────────── */}
      {tab === 'apikeys' && (
        <div className="space-y-4">
          {/* New key created banner */}
          {createdKey?.key && (
            <div className="bg-emerald-950 border border-emerald-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">API key created — copy it now, it won't be shown again</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-emerald-300">
                  {revealedKey ? createdKey.key : '•'.repeat(40)}
                </code>
                <button onClick={() => setRevealedKey(v => !v)}
                  className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg">
                  {revealedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => copyKey(createdKey.key!)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Generate New Key</h3>
            <div className="flex gap-2">
              <input
                placeholder="Key name, e.g. production-sdk"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newKeyName.trim() && createKeyMutation.mutate(newKeyName.trim())}
              />
              <button
                onClick={() => createKeyMutation.mutate(newKeyName.trim())}
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />
                {createKeyMutation.isPending ? 'Creating…' : 'Generate'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Pass the key in the <code className="text-gray-400">X-AgentOps-Key</code> header when calling the API.
            </p>
          </div>

          {/* Keys list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Active Keys</span>
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${keysFetching ? 'animate-spin' : ''}`} />
            </div>
            {(keysData ?? []).length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500">No API keys yet.</div>
            )}
            {(keysData ?? []).map(k => (
              <div key={k.id} className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 last:border-0">
                <Key className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200">{k.name}</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{k.key_prefix}••••••••••••••••</div>
                </div>
                <div className="text-xs text-gray-600">
                  {k.last_used_at ? `Used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${k.active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
                  {k.active ? 'active' : 'revoked'}
                </span>
                {k.active && (
                  <button onClick={() => revokeKeyMutation.mutate(k.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Webhooks Tab ──────────────────────────────────────────────────── */}
      {tab === 'webhooks' && (
        <div className="space-y-4">
          {/* Create form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">New Webhook</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input placeholder="e.g. Slack Alerts"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={whName} onChange={e => setWhName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Endpoint URL</label>
                  <input placeholder="https://hooks.slack.com/…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={whURL} onChange={e => setWhURL(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2">Trigger on</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => toggleEvent(opt.value)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors
                        ${whEvents.includes(opt.value)
                          ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => createWebhookMutation.mutate()}
                disabled={!whName.trim() || !whURL.trim() || whEvents.length === 0 || createWebhookMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />
                {createWebhookMutation.isPending ? 'Creating…' : 'Create Webhook'}
              </button>
            </div>
          </div>

          {/* Webhooks list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Active Webhooks</span>
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${hooksFetching ? 'animate-spin' : ''}`} />
            </div>
            {(hooksData ?? []).length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500">
                No webhooks yet. Add one to get notified in Slack, PagerDuty, or any HTTP endpoint.
              </div>
            )}
            {(hooksData ?? []).map(hook => {
              const events = parseEvents(hook.events)
              const result = testResult[hook.id]
              return (
                <div key={hook.id} className="px-4 py-3 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{hook.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${hook.active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
                          {hook.active ? 'active' : 'disabled'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">{hook.url}</div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {events.map(ev => (
                          <span key={ev} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{ev}</span>
                        ))}
                        {hook.last_fired && (
                          <span className="text-xs text-gray-600 ml-1">· last fired {new Date(hook.last_fired).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result && (
                        <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1
                          ${result.status >= 200 && result.status < 300 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {result.status >= 200 && result.status < 300
                            ? <CheckCircle2 className="h-3 w-3" />
                            : <AlertTriangle className="h-3 w-3" />}
                          {result.status}
                        </span>
                      )}
                      <button onClick={() => testWebhookMutation.mutate(hook.id)}
                        disabled={testWebhookMutation.isPending}
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950 border border-indigo-900 px-2 py-1 rounded-lg">
                        <Zap className="h-3 w-3" /> Test
                      </button>
                      <button onClick={() => deleteWebhookMutation.mutate(hook.id)}
                        className="text-gray-500 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Every webhook is signed with <code className="text-gray-400">X-AgentOps-Signature: sha256=…</code> so you can verify authenticity.
              The raw key is shown once on creation. Common destinations: Slack incoming webhooks, PagerDuty Events API v2, Discord, or any custom HTTP endpoint.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
