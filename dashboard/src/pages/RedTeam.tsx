import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX, Play, RefreshCw,
  ChevronDown, ChevronRight, Crosshair, Zap, Lock, Eye,
  AlertTriangle, CheckCircle2, Loader2, Bot,
} from 'lucide-react'
import api from '../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type Vector = {
  id: string; name: string; category: string; severity: string
  payload: string; description: string; remediation: string
}

type SecurityScore = {
  agent_id: string; agent_name: string; score: number; grade: string
  findings: number; last_scan: string
}

type Finding = {
  id: string; vector_name: string; category: string; severity: string
  payload: string; response: string; successful: boolean
  confidence: number; remediation: string
}

type Scan = {
  id: string; agent_id: string; agent_name: string; status: string
  vectors_run: number; findings: number; score: number
  created_at: string; completed_at?: string
  findings_list?: Finding[]
}

type Agent = { id: string; name: string; status: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  prompt_injection:    { label: 'Prompt Injection',    icon: Zap,          color: 'text-red-400 bg-red-950/40 border-red-900/60' },
  jailbreak:           { label: 'Jailbreak',           icon: Lock,         color: 'text-orange-400 bg-orange-950/40 border-orange-900/60' },
  pii_extraction:      { label: 'PII Extraction',      icon: Eye,          color: 'text-yellow-400 bg-yellow-950/40 border-yellow-900/60' },
  indirect_injection:  { label: 'Indirect Injection',  icon: Crosshair,    color: 'text-purple-400 bg-purple-950/40 border-purple-900/60' },
  role_confusion:      { label: 'Role Confusion',      icon: Bot,          color: 'text-sky-400 bg-sky-950/40 border-sky-900/60' },
  cost_attack:         { label: 'Cost Attack',         icon: AlertTriangle, color: 'text-pink-400 bg-pink-950/40 border-pink-900/60' },
}

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-900 text-red-300',
  high:     'bg-orange-900 text-orange-300',
  medium:   'bg-yellow-900 text-yellow-300',
  low:      'bg-blue-900 text-blue-300',
}

function gradeColor(g: string) {
  return { A: 'text-emerald-400', B: 'text-sky-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' }[g] ?? 'text-gray-400'
}

function scoreRing(score: number) {
  const r = 28, c = 2 * Math.PI * r
  const filled = (score / 100) * c
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'
  return { c, filled, color, r }
}

// ── Components ────────────────────────────────────────────────────────────────

function ScoreCard({ s }: { s: SecurityScore }) {
  const { c, filled, color, r } = scoreRing(s.score)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <svg width="72" height="72" className="-rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#1f2937" strokeWidth="5" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${filled} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center rotate-90">
          <span className={`text-lg font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{s.agent_name}</div>
        <div className="text-xs text-gray-500 mt-0.5">{Math.round(s.score)}/100 security score</div>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-xs ${s.findings > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {s.findings} finding{s.findings !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-600">
            {new Date(s.last_scan).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false)
  const meta = CATEGORY_META[f.category]
  return (
    <div className={`border rounded-lg overflow-hidden ${f.successful ? 'border-red-900/60 bg-red-950/10' : 'border-gray-800 bg-gray-900/40'}`}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {f.successful
          ? <ShieldX className="h-4 w-4 text-red-400 flex-shrink-0" />
          : <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-200">{f.vector_name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEV_COLOR[f.severity] ?? ''}`}>{f.severity}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${meta?.color ?? ''}`}>{meta?.label ?? f.category}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-500">{Math.round(f.confidence * 100)}% confidence</span>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-600" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-3 py-3 space-y-3 text-xs">
          <div>
            <div className="text-gray-500 font-semibold uppercase tracking-wider mb-1">Attack Payload</div>
            <pre className="font-mono text-gray-300 bg-gray-950 rounded p-2 overflow-x-auto whitespace-pre-wrap leading-relaxed">{f.payload}</pre>
          </div>
          <div>
            <div className="text-gray-500 font-semibold uppercase tracking-wider mb-1">Simulated Agent Response</div>
            <p className={`${f.successful ? 'text-red-300' : 'text-emerald-300'} leading-relaxed`}>{f.response}</p>
          </div>
          <div className="p-2 bg-amber-950/30 border border-amber-900/40 rounded">
            <div className="text-amber-400 font-semibold uppercase tracking-wider mb-1">Remediation</div>
            <p className="text-amber-200/80 leading-relaxed">{f.remediation}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RedTeam() {
  const qc = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState('')
  const [expandedScan, setExpandedScan] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'scores' | 'scans' | 'vectors'>('scores')

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => { const { data } = await api.get('/agents'); return data.agents ?? [] },
  })

  const { data: scores = [] } = useQuery<SecurityScore[]>({
    queryKey: ['redteam-scores'],
    queryFn: async () => { const { data } = await api.get('/redteam/scores'); return data.scores ?? [] },
    refetchInterval: 8000,
  })

  const { data: scans = [] } = useQuery<Scan[]>({
    queryKey: ['redteam-scans'],
    queryFn: async () => { const { data } = await api.get('/redteam/scans'); return data.scans ?? [] },
    refetchInterval: 5000,
  })

  const { data: scanDetail } = useQuery<Scan>({
    queryKey: ['redteam-scan', expandedScan],
    queryFn: async () => { const { data } = await api.get(`/redteam/scans/${expandedScan}`); return data },
    enabled: !!expandedScan,
  })

  const { data: vectors = [] } = useQuery<Vector[]>({
    queryKey: ['redteam-vectors'],
    queryFn: async () => { const { data } = await api.get('/redteam/vectors'); return data.vectors ?? [] },
  })

  const scanMutation = useMutation({
    mutationFn: (agentId: string) => api.post('/redteam/scan', { agent_id: agentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redteam-scans'] })
      setActiveTab('scans')
    },
  })

  const runningScans = scans.filter(s => s.status === 'running')
  const totalFindings = scores.reduce((a, s) => a + s.findings, 0)
  const avgScore = scores.length ? scores.reduce((a, s) => a + s.score, 0) / scores.length : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">Autonomous Red Team</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 border border-red-800/60 text-red-300 font-medium">
              Exclusive
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Continuously probe your agents with adversarial attacks — before real attackers do
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 outline-none"
          >
            <option value="">Select agent…</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button
            onClick={() => selectedAgent && scanMutation.mutate(selectedAgent)}
            disabled={!selectedAgent || scanMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
              bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500
              text-white shadow-lg shadow-red-900/30 disabled:opacity-50 transition-all"
          >
            {scanMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Play className="h-4 w-4" />}
            Run Scan
          </button>
        </div>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Agents Scanned', value: scores.length, icon: Shield, color: 'text-white' },
          { label: 'Avg Security Score', value: `${Math.round(avgScore)}`, icon: ShieldCheck, color: avgScore >= 75 ? 'text-emerald-400' : avgScore >= 50 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Total Findings', value: totalFindings, icon: ShieldAlert, color: totalFindings > 0 ? 'text-red-400' : 'text-emerald-400' },
          { label: 'Active Scans', value: runningScans.length, icon: RefreshCw, color: runningScans.length > 0 ? 'text-sky-400' : 'text-gray-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <Icon className={`h-5 w-5 ${color} flex-shrink-0`} />
            <div>
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1 w-fit">
        {(['scores', 'scans', 'vectors'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'scores' ? 'Security Scores' : tab === 'scans' ? `Scan History` : 'Attack Vectors'}
            {tab === 'scans' && runningScans.length > 0 && (
              <span className="ml-1.5 text-xs bg-sky-900 text-sky-300 px-1.5 py-0.5 rounded-full">{runningScans.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'scores' && (
        <div className="space-y-3">
          {scores.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <Shield className="h-10 w-10 text-gray-700 mx-auto mb-3" />
              <div className="text-gray-400 font-medium mb-1">No scans completed yet</div>
              <div className="text-sm text-gray-600">Select an agent above and click Run Scan to start</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {scores.map(s => <ScoreCard key={s.agent_id} s={s} />)}
          </div>

          {/* Category breakdown heatmap */}
          {scores.length > 0 && vectors.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-sm font-semibold text-white mb-3">Attack Vector Library</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const Icon = meta.icon
                  const count = vectors.filter(v => v.category === key).length
                  return (
                    <div key={key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${meta.color}`}>
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <div>
                        <div className="text-xs font-medium">{meta.label}</div>
                        <div className="text-xs opacity-60">{count} vector{count !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'scans' && (
        <div className="space-y-2">
          {scans.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
              No scans yet. Run your first scan above.
            </div>
          )}
          {scans.map(sc => (
            <div key={sc.id} className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900">
              <button
                onClick={() => setExpandedScan(expandedScan === sc.id ? null : sc.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {sc.status === 'running'
                  ? <Loader2 className="h-4 w-4 text-sky-400 animate-spin flex-shrink-0" />
                  : sc.findings > 0
                    ? <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
                    : <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{sc.agent_name || sc.agent_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      sc.status === 'running' ? 'bg-sky-900/60 text-sky-300' :
                      sc.status === 'completed' ? 'bg-gray-800 text-gray-400' : 'bg-red-900/60 text-red-300'
                    }`}>{sc.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {sc.vectors_run} vectors · {sc.findings} findings · {new Date(sc.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {sc.status === 'completed' && (
                    <span className={`text-lg font-bold ${gradeColor(sc.score >= 90 ? 'A' : sc.score >= 75 ? 'B' : sc.score >= 60 ? 'C' : sc.score >= 45 ? 'D' : 'F')}`}>
                      {Math.round(sc.score)}
                    </span>
                  )}
                  {expandedScan === sc.id ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
                </div>
              </button>

              {expandedScan === sc.id && (
                <div className="border-t border-gray-800 px-4 py-4 space-y-2 bg-gray-900/60">
                  {!scanDetail && <div className="text-sm text-gray-500 text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>}
                  {scanDetail?.findings_list?.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> All attack vectors blocked — excellent security posture
                    </div>
                  )}
                  {scanDetail?.findings_list?.map(f => <FindingRow key={f.id} f={f} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'vectors' && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 px-1">
            {vectors.length} attack vectors across {Object.keys(CATEGORY_META).length} categories — updated continuously
          </div>
          {Object.entries(CATEGORY_META).map(([cat, meta]) => {
            const catVectors = vectors.filter(v => v.category === cat)
            if (!catVectors.length) return null
            const Icon = meta.icon
            return (
              <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-800`}>
                  <Icon className={`h-4 w-4 ${meta.color.split(' ')[0]}`} />
                  <span className="text-sm font-semibold text-white">{meta.label}</span>
                  <span className="text-xs text-gray-600 ml-1">{catVectors.length}</span>
                </div>
                <div className="divide-y divide-gray-800/60">
                  {catVectors.map(v => (
                    <div key={v.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-gray-200 font-medium">{v.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEV_COLOR[v.severity] ?? ''}`}>{v.severity}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
