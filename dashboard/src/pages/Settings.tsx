import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Key, Webhook, Trash2, Plus, Copy, Eye, EyeOff,
  CheckCircle2, RefreshCw, Zap, Globe, AlertTriangle,
  Users, UserPlus, Shield, User, Lock, CreditCard,
  Building2, Crown, UserMinus, Sparkle,
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

type Plan = { id: 'free' | 'pro' | 'enterprise'; label: string; price: string; seats: string; agents: string; blurb: string }
const PLANS: Plan[] = [
  { id: 'free', label: 'Free', price: '$0', seats: '3 seats', agents: '5 agents', blurb: 'For trying Orion out' },
  { id: 'pro', label: 'Pro', price: '$49/mo', seats: '15 seats', agents: '50 agents', blurb: 'For growing teams' },
  { id: 'enterprise', label: 'Enterprise', price: 'Custom', seats: 'Unlimited seats', agents: 'Unlimited agents', blurb: 'For the whole company' },
]

type OrgRow = { id: string; name: string; slug: string; plan_tier: string; role: string; active: boolean }
type Usage = {
  plan_tier: string; seats_used: number; seat_limit: number
  agents_used: number; agent_limit: number
  cost_this_month_usd: number; traces_this_month: number
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit >= 1_000_000
  const pct = unlimited ? 8 : Math.min(100, (used / Math.max(limit, 1)) * 100)
  const hot = !unlimited && pct >= 90
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-gray-400">{label}</span>
        <span className={hot ? 'text-red-400 font-medium' : 'text-gray-300'}>
          {used.toLocaleString()} {unlimited ? '' : `/ ${limit.toLocaleString()}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hot ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [tab, setTab] = useState<'profile' | 'members' | 'billing' | 'apikeys' | 'webhooks'>('profile')

  const { data: orgs } = useQuery({
    queryKey: ['my-orgs'],
    queryFn: async () => { const { data } = await authApi.get('/auth/orgs'); return data.organizations as OrgRow[] },
  })
  const myOrg = orgs?.find(o => o.active)
  const canManageOrg = myOrg?.role === 'owner' || myOrg?.role === 'admin'
  const canManageUsers = canManageOrg

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

  // Members (org owner/admin only can mutate; everyone can view)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName]   = useState('')
  const [newUserPass, setNewUserPass]   = useState('')
  const [newUserRole, setNewUserRole]   = useState('viewer')

  const { data: membersData, refetch: refetchMembers } = useQuery({
    queryKey: ['org-members'],
    queryFn: async () => { const { data } = await api.get('/org/members'); return data.members as any[] },
  })

  const [createUserError, setCreateUserError] = useState('')
  const createUserMutation = useMutation({
    mutationFn: async () => authApi.post('/auth/users', {
      email: newUserEmail, name: newUserName, password: newUserPass, role: newUserRole,
    }),
    onSuccess: () => {
      setNewUserEmail(''); setNewUserName(''); setNewUserPass(''); setNewUserRole('viewer')
      setCreateUserError('')
      refetchMembers()
    },
    onError: (e: any) => setCreateUserError(e?.response?.data?.error ?? 'Failed to create user'),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userID, role }: { userID: string; role: string }) => api.patch(`/org/members/${userID}`, { role }),
    onSuccess: () => refetchMembers(),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userID: string) => api.delete(`/org/members/${userID}`),
    onSuccess: () => refetchMembers(),
  })

  // Billing
  const { data: usage } = useQuery({
    queryKey: ['org-usage'],
    queryFn: async () => { const { data } = await api.get('/org/usage'); return data as Usage },
  })

  const [planError, setPlanError] = useState('')
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const changePlanMutation = useMutation({
    mutationFn: (planTier: string) => { setSwitchingTo(planTier); return api.patch('/org/plan', { plan_tier: planTier }) },
    onSettled: () => setSwitchingTo(null),
    onSuccess: () => {
      setPlanError('')
      qc.invalidateQueries({ queryKey: ['org-usage'] })
      qc.invalidateQueries({ queryKey: ['my-orgs'] })
    },
    onError: (e: any) => setPlanError(e?.response?.data?.error ?? 'Failed to change plan'),
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {myOrg ? <>{myOrg.name} · <span className="capitalize">{myOrg.plan_tier}</span> plan</> : 'API keys, webhooks, and integrations'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {([
          ['profile', User, 'Profile'],
          ['members', Users, 'Members'],
          ['billing', CreditCard, 'Billing'],
          ['apikeys', Key, 'API Keys'],
          ['webhooks', Webhook, 'Webhooks'],
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

      {/* ── Members Tab ──────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">
          {/* Invite form — owner/admin only */}
          {canManageUsers && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Invite to {myOrg?.name}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
                {createUserMutation.isPending ? 'Inviting…' : 'Invite Teammate'}
              </button>
            </div>
          )}

          {/* Members list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Members</span>
              <span className="ml-auto text-xs text-gray-500">
                {(membersData ?? []).length} of {usage ? (usage.seat_limit >= 1_000_000 ? '∞' : usage.seat_limit) : '…'} seats
              </span>
            </div>
            {(membersData ?? []).map((u: any) => (
              <div key={u.user_id} className="flex items-center gap-4 flex-wrap px-5 py-3 border-b border-gray-800 last:border-0">
                <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {u.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{u.name}</span>
                    {u.user_id === me?.id && <span className="text-xs text-gray-500">(you)</span>}
                  </div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                {canManageUsers && u.user_id !== me?.id ? (
                  <select
                    value={u.role}
                    onChange={e => updateRoleMutation.mutate({ userID: u.user_id, role: e.target.value })}
                    className={`text-xs px-2 py-1 rounded-full border font-medium bg-transparent ${ROLE_BADGE[u.role]}`}
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="agent-runner">agent-runner</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${ROLE_BADGE[u.role]}`}>
                    <Shield className="h-2.5 w-2.5" />
                    {u.role}
                  </span>
                )}
                <div className="text-xs text-gray-600 hidden sm:block">
                  {u.last_login_at ? `Last login ${new Date(u.last_login_at).toLocaleDateString()}` : 'Never signed in'}
                </div>
                {canManageUsers && u.user_id !== me?.id && (
                  <button onClick={() => removeMemberMutation.mutate(u.user_id)}
                    title="Remove from organization"
                    className="text-gray-500 hover:text-red-400 transition-colors">
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            Role here controls access within <span className="text-gray-400">{myOrg?.name}</span> — invites, billing, and member management.
          </p>
        </div>
      )}

      {/* ── Billing Tab ──────────────────────────────────────────────────── */}
      {tab === 'billing' && (
        <div className="space-y-4 max-w-3xl">
          {/* Usage meters */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Usage this month</h3>
              <span className="ml-auto text-xs text-gray-500 capitalize">{usage?.plan_tier ?? '…'} plan</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Meter label="Seats" used={usage?.seats_used ?? 0} limit={usage?.seat_limit ?? 0} />
              <Meter label="Agents" used={usage?.agents_used ?? 0} limit={usage?.agent_limit ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-800">
              <div>
                <div className="text-xs text-gray-500 mb-1">Cost this month</div>
                <div className="text-lg font-semibold text-white">${(usage?.cost_this_month_usd ?? 0).toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Traces this month</div>
                <div className="text-lg font-semibold text-white">{(usage?.traces_this_month ?? 0).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Plan cards */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Plan</h3>
            </div>
            {planError && <p className="text-xs text-red-400 mb-3">{planError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PLANS.map(p => {
                const current = usage?.plan_tier === p.id
                return (
                  <div key={p.id}
                    className={`relative rounded-xl p-4 border transition-colors ${current ? 'border-blue-600 bg-blue-950/30' : 'border-gray-800 bg-gray-900'}`}>
                    {p.id === 'enterprise' && (
                      <Crown className="h-3.5 w-3.5 text-yellow-400 absolute top-4 right-4" />
                    )}
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      {p.label}
                      {current && <Sparkle className="h-3 w-3 text-blue-400" />}
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{p.price}</div>
                    <div className="text-xs text-gray-500 mt-1">{p.blurb}</div>
                    <div className="text-xs text-gray-400 mt-3 space-y-0.5">
                      <div>{p.seats}</div>
                      <div>{p.agents}</div>
                    </div>
                    <button
                      onClick={() => changePlanMutation.mutate(p.id)}
                      disabled={current || !canManageOrg || myOrg?.role !== 'owner' || changePlanMutation.isPending}
                      className={`w-full mt-4 text-xs font-medium py-2 rounded-lg transition-colors
                        ${current ? 'bg-gray-800 text-gray-500 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}
                    >
                      {current ? 'Current plan' : switchingTo === p.id ? 'Switching…' : 'Switch plan'}
                    </button>
                  </div>
                )
              })}
            </div>
            {myOrg?.role !== 'owner' && (
              <p className="text-xs text-gray-600 mt-3">Only the organization owner can change plans.</p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Plan changes apply instantly — no payment details needed in this workspace.
            </p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
