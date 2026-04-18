import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Key, Webhook, Trash2, Plus, Copy, Eye, EyeOff,
  CheckCircle2, RefreshCw, Zap, Globe, AlertTriangle,
  Users, UserPlus, Shield, User, Lock,
} from 'lucide-react'
import api from '../services/api'
import { authApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

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
  { value: '*',                 label: 'All Events',         color: 'text-blue-400' },
]

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-yellow-900/60 text-yellow-300 border-yellow-800',
  admin: 'bg-blue-900/60 text-blue-300 border-blue-800',
  'agent-runner': 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
  viewer: 'bg-gray-800 text-gray-400 border-gray-700',
}

export default function Settings() {
  const qc = useQueryClient()
  const { user: me, checkAccess } = useAuth()
  const canManageUsers = checkAccess('users', 'read')
  const [tab, setTab] = useState<'profile' | 'apikeys' | 'webhooks' | 'users'>('profile')

  // Profile
  const [profileName, setProfileName]   = useState(me?.name ?? '')
  const [oldPass, setOldPass]           = useState('')
  const [newPass, setNewPass]           = useState('')
  const [profileMsg, setProfileMsg]     = useState('')
  const [profileErr, setProfileErr]     = useState('')

  const updateProfileMutation = useMutation({
    mutationFn: async () => authApi.patch('/auth/me', {
      name: profileName !== me?.name ? profileName : undefined,
      old_password: oldPass || undefined,
      new_password: newPass || undefined,
    }),
    onSuccess: () => {
      setProfileMsg('Profile updated successfully')
      setOldPass(''); setNewPass(''); setProfileErr('')
      setTimeout(() => setProfileMsg(''), 3000)
    },
    onError: (e: any) => setProfileErr(e?.response?.data?.error ?? 'Update failed'),
  })

  // Users (admin/owner only)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName]   = useState('')
  const [newUserPass, setNewUserPass]   = useState('')
  const [newUserRole, setNewUserRole]   = useState('viewer')

  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { const { data } = await authApi.get('/auth/users'); return data as any[] },
    enabled: canManageUsers,
  })

  const [createUserError, setCreateUserError] = useState('')
  const createUserMutation = useMutation({
    mutationFn: async () => authApi.post('/auth/users', {
      email: newUserEmail, name: newUserName, password: newUserPass, role: newUserRole,
    }),
    onSuccess: () => {
      setNewUserEmail(''); setNewUserName(''); setNewUserPass(''); setNewUserRole('viewer')
      setCreateUserError('')
      refetchUsers()
    },
    onError: (e: any) => setCreateUserError(e?.response?.data?.error ?? 'Failed to create user'),
  })

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
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {([
          ['profile', User, 'Profile'],
          ['apikeys', Key, 'API Keys'],
          ['webhooks', Webhook, 'Webhooks'],
          ...(canManageUsers ? [['users', Users, 'Users']] : []),
        ] as [string, React.ElementType, string][]).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ──────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <div className="space-y-4 max-w-lg">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-800">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                {me?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{me?.name}</div>
                <div className="text-xs text-gray-500">{me?.email}</div>
              </div>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_BADGE[me?.role ?? 'viewer']}`}>
                {me?.role}
              </span>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Display Name</label>
              <input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-300">Change Password</span>
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  placeholder="Current password"
                  value={oldPass}
                  onChange={e => setOldPass(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {profileErr && <p className="text-xs text-red-400">{profileErr}</p>}
            {profileMsg && <p className="text-xs text-emerald-400">{profileMsg}</p>}

            <button
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {updateProfileMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Users Tab ────────────────────────────────────────────────────── */}
      {tab === 'users' && canManageUsers && (
        <div className="space-y-4">
          {/* Invite form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Invite New User</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name</label>
                <input value={newUserName} onChange={e => setNewUserName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="jane@company.com" type="email"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Temporary Password</label>
                <input value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
                  placeholder="Min 8 characters" type="password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role</label>
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  {me?.role === 'owner' && <option value="owner">Owner</option>}
                  <option value="admin">Admin</option>
                  <option value="agent-runner">Agent Runner</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            {createUserError && (
              <p className="text-xs text-red-400">{createUserError}</p>
            )}
            <button
              onClick={() => createUserMutation.mutate()}
              disabled={!newUserEmail || !newUserName || !newUserPass || createUserMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {createUserMutation.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>

          {/* Users list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Team Members</span>
              <span className="ml-auto text-xs text-gray-500">{(usersData ?? []).length} users</span>
            </div>
            {(usersData ?? []).map((u: any) => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-800 last:border-0">
                <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {u.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{u.name}</span>
                    {u.id === me?.id && <span className="text-xs text-gray-500">(you)</span>}
                  </div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${ROLE_BADGE[u.role]}`}>
                  <Shield className="h-2.5 w-2.5" />
                  {u.role}
                </span>
                <div className="text-xs text-gray-600">
                  {u.last_login_at ? `Last login ${new Date(u.last_login_at).toLocaleDateString()}` : 'Never signed in'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
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
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newKeyName.trim() && createKeyMutation.mutate(newKeyName.trim())}
              />
              <button
                onClick={() => createKeyMutation.mutate(newKeyName.trim())}
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />
                {createKeyMutation.isPending ? 'Creating…' : 'Generate'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Pass the key in the <code className="text-gray-400">X-Orion-Key</code> header when calling the API.
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
                <Key className="h-4 w-4 text-blue-400 flex-shrink-0" />
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={whName} onChange={e => setWhName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Endpoint URL</label>
                  <input placeholder="https://hooks.slack.com/…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          ? 'bg-blue-900/60 border-blue-700 text-blue-300'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => createWebhookMutation.mutate()}
                disabled={!whName.trim() || !whURL.trim() || whEvents.length === 0 || createWebhookMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
                    <Globe className="h-4 w-4 text-blue-400 flex-shrink-0" />
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
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-950 border border-blue-900 px-2 py-1 rounded-lg">
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
              Every webhook is signed with <code className="text-gray-400">X-Orion-Signature: sha256=…</code> so you can verify authenticity.
              The raw key is shown once on creation. Common destinations: Slack incoming webhooks, PagerDuty Events API v2, Discord, or any custom HTTP endpoint.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
