import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FlaskConical, Plus, Trophy, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, Loader2, Play,
  CheckCircle2, Clock, Zap, DollarSign, ThumbsUp, X,
} from 'lucide-react'
import api from '../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type VariantStats = {
  variant: string
  runs: number
  success_rate: number
  avg_latency_ms: number
  avg_tokens: number
  avg_cost_usd: number
  avg_feedback: number
}

type ABTest = {
  id: string
  name: string
  description: string
  prompt_a_id: string
  prompt_b_id: string
  prompt_a_name: string
  prompt_b_name: string
  traffic_split: number
  status: string
  winner_id: string
  created_by: string
  created_at: string
  concluded_at?: string
  stats_a: VariantStats
  stats_b: VariantStats
  z_score: number
  significant: boolean
}

type Prompt = { id: string; name: string; description: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number) { return `${(n * 100).toFixed(1)}%` }
function ms(n: number)  { return `${Math.round(n)}ms` }
function tok(n: number) { return Math.round(n).toString() }
function usd(n: number) { return `$${n.toFixed(4)}` }

function delta(a: number, b: number, higherBetter = true) {
  if (!a && !b) return null
  const d = b - a
  if (Math.abs(d) < 0.001) return null
  const better = higherBetter ? d > 0 : d < 0
  return { d, better }
}

function DeltaBadge({ a, b, higherBetter = true, fmt }: {
  a: number; b: number; higherBetter?: boolean; fmt: (n: number) => string
}) {
  const r = delta(a, b, higherBetter)
  if (!r) return <span className="text-gray-600 text-xs">—</span>
  const Icon = r.better ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${r.better ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon className="h-3 w-3" />
      {fmt(Math.abs(r.d))}
    </span>
  )
}

function StatBar({ a, b, higherBetter = true }: { a: number; b: number; higherBetter?: boolean }) {
  const total = a + b
  if (!total) return null
  const aW = total ? (a / total) * 100 : 50
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      <div
        className={`rounded-l-full transition-all ${higherBetter ? (a >= b ? 'bg-violet-500' : 'bg-violet-800') : (a <= b ? 'bg-violet-500' : 'bg-violet-800')}`}
        style={{ width: `${aW}%` }}
      />
      <div
        className={`rounded-r-full transition-all ${higherBetter ? (b > a ? 'bg-sky-500' : 'bg-sky-800') : (b < a ? 'bg-sky-500' : 'bg-sky-800')}`}
        style={{ width: `${100 - aW}%` }}
      />
    </div>
  )
}

function SignificanceBadge({ z, significant }: { z: number; significant: boolean }) {
  if (!z) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
      significant
        ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300'
        : 'bg-gray-800 border-gray-700 text-gray-500'
    }`}>
      {significant ? '✓ Significant' : '~ Not significant'} · z={z.toFixed(2)}
    </span>
  )
}

// ── Test card ─────────────────────────────────────────────────────────────────

function TestCard({ test, onConclude, onSimulate }: {
  test: ABTest
  onConclude: (id: string, winnerID: string) => void
  onSimulate: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isRunning = test.status === 'running'
  const winner = test.winner_id === test.prompt_a_id ? 'A' : test.winner_id === test.prompt_b_id ? 'B' : null
  const aLeads = (test.stats_a.success_rate ?? 0) >= (test.stats_b.success_rate ?? 0)
  const totalRuns = (test.stats_a.runs ?? 0) + (test.stats_b.runs ?? 0)

  return (
    <div className={`border rounded-xl overflow-hidden ${
      test.status === 'concluded'
        ? 'border-emerald-900/50 bg-emerald-950/10'
        : 'border-gray-800 bg-gray-900'
    }`}>
      {/* Header row */}
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <FlaskConical className={`h-4 w-4 flex-shrink-0 ${isRunning ? 'text-violet-400' : 'text-emerald-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-100">{test.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isRunning ? 'bg-violet-900/60 text-violet-300' : 'bg-emerald-900/60 text-emerald-300'
            }`}>{test.status}</span>
            {test.significant && <SignificanceBadge z={test.z_score} significant={test.significant} />}
            {winner && (
              <span className="flex items-center gap-1 text-xs text-amber-300">
                <Trophy className="h-3 w-3" /> Variant {winner} won
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {test.prompt_a_name} vs {test.prompt_b_name} · {totalRuns} runs · {new Date(test.created_at).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isRunning && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onSimulate(test.id) }}
                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg"
              >
                <Play className="h-3 w-3" /> Simulate data
              </button>
              <button
                onClick={e => { e.stopPropagation(); onConclude(test.id, aLeads ? test.prompt_a_id : test.prompt_b_id) }}
                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg"
              >
                <Trophy className="h-3 w-3" /> Declare winner
              </button>
            </>
          )}
          {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
        </div>
      </button>

      {/* Expanded stats */}
      {open && (
        <div className="border-t border-gray-800 p-4 space-y-4 bg-gray-900/60">
          {/* Traffic split pill */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Traffic split</span>
            <div className="flex items-center gap-1.5">
              <span className="text-violet-300 font-medium">{Math.round(test.traffic_split * 100)}% → A</span>
              <div className="w-24 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-sky-500 rounded-full"
                  style={{ width: `${test.traffic_split * 100}%` }} />
              </div>
              <span className="text-sky-300 font-medium">{Math.round((1 - test.traffic_split) * 100)}% → B</span>
            </div>
            <div className="ml-auto">
              <SignificanceBadge z={test.z_score} significant={test.significant} />
            </div>
          </div>

          {/* Metric comparison grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Variant A */}
            <div className={`rounded-xl border p-3 space-y-3 ${
              winner === 'A' ? 'border-amber-700/60 bg-amber-950/20' : 'border-violet-900/60 bg-violet-950/20'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-violet-300 bg-violet-900/50 border border-violet-800 px-2 py-0.5 rounded-full">A</span>
                <span className="text-sm font-medium text-gray-200 truncate">{test.prompt_a_name}</span>
                {winner === 'A' && <Trophy className="h-3.5 w-3.5 text-amber-400 ml-auto flex-shrink-0" />}
              </div>
              <MetricRows stats={test.stats_a} other={test.stats_b} />
            </div>

            {/* Variant B */}
            <div className={`rounded-xl border p-3 space-y-3 ${
              winner === 'B' ? 'border-amber-700/60 bg-amber-950/20' : 'border-sky-900/60 bg-sky-950/20'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-sky-300 bg-sky-900/50 border border-sky-800 px-2 py-0.5 rounded-full">B</span>
                <span className="text-sm font-medium text-gray-200 truncate">{test.prompt_b_name}</span>
                {winner === 'B' && <Trophy className="h-3.5 w-3.5 text-amber-400 ml-auto flex-shrink-0" />}
              </div>
              <MetricRows stats={test.stats_b} other={test.stats_a} />
            </div>
          </div>

          {/* Bar comparisons */}
          {totalRuns > 0 && (
            <div className="space-y-2">
              {[
                { label: 'Success Rate', a: test.stats_a.success_rate, b: test.stats_b.success_rate, higherBetter: true, fmt: pct },
                { label: 'Avg Latency',  a: test.stats_a.avg_latency_ms, b: test.stats_b.avg_latency_ms, higherBetter: false, fmt: ms },
                { label: 'Avg Tokens',   a: test.stats_a.avg_tokens, b: test.stats_b.avg_tokens, higherBetter: false, fmt: tok },
              ].map(({ label, a, b, higherBetter, fmt }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
                  <span className="text-xs text-violet-300 font-mono w-16 text-right">{a ? fmt(a) : '—'}</span>
                  <div className="flex-1"><StatBar a={a} b={b} higherBetter={higherBetter} /></div>
                  <span className="text-xs text-sky-300 font-mono w-16">{b ? fmt(b) : '—'}</span>
                  <DeltaBadge a={a} b={b} higherBetter={higherBetter} fmt={fmt} />
                </div>
              ))}
            </div>
          )}

          {totalRuns === 0 && (
            <div className="text-sm text-gray-500 text-center py-2">
              No data yet — click "Simulate data" to populate with realistic results
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricRows({ stats, other }: { stats: VariantStats; other: VariantStats }) {
  const metrics = [
    { icon: CheckCircle2, label: 'Success rate', value: pct(stats.success_rate ?? 0), better: (stats.success_rate ?? 0) >= (other.success_rate ?? 0) },
    { icon: Clock,        label: 'Avg latency',  value: ms(stats.avg_latency_ms ?? 0),  better: (stats.avg_latency_ms ?? 0) <= (other.avg_latency_ms ?? 0) },
    { icon: Zap,          label: 'Avg tokens',   value: tok(stats.avg_tokens ?? 0),       better: (stats.avg_tokens ?? 0) <= (other.avg_tokens ?? 0) },
    { icon: DollarSign,   label: 'Avg cost',     value: usd(stats.avg_cost_usd ?? 0),     better: (stats.avg_cost_usd ?? 0) <= (other.avg_cost_usd ?? 0) },
    { icon: ThumbsUp,     label: 'Feedback',     value: (stats.avg_feedback ?? 0).toFixed(2), better: (stats.avg_feedback ?? 0) >= (other.avg_feedback ?? 0) },
    { icon: FlaskConical, label: 'Runs',         value: (stats.runs ?? 0).toString(), better: null },
  ]
  return (
    <div className="space-y-1.5">
      {metrics.map(({ icon: Icon, label, value, better }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-3 w-3 text-gray-600 flex-shrink-0" />
          <span className="text-xs text-gray-500 flex-1">{label}</span>
          <span className={`text-xs font-mono font-medium ${
            better === null ? 'text-gray-300' : better ? 'text-emerald-400' : 'text-gray-400'
          }`}>{value}</span>
          {better === true && <TrendingUp className="h-3 w-3 text-emerald-400" />}
          {better === false && <Minus className="h-3 w-3 text-gray-600" />}
        </div>
      ))}
    </div>
  )
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateModal({ prompts, onClose, onCreate }: {
  prompts: Prompt[]
  onClose: () => void
  onCreate: (data: { name: string; description: string; prompt_a_id: string; prompt_b_id: string; traffic_split: number }) => void
}) {
  const [form, setForm] = useState({ name: '', description: '', prompt_a_id: '', prompt_b_id: '', traffic_split: 50 })
  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.name.trim() && form.prompt_a_id && form.prompt_b_id && form.prompt_a_id !== form.prompt_b_id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-violet-400" />
            <span className="font-semibold text-white">New A/B Test</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">Test name *</label>
            <input
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Conciseness vs. Detail"
              className="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-violet-600"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">Description</label>
            <input
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="What are you testing?"
              className="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-violet-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                <span className="text-violet-300 font-bold">A</span> — Control prompt *
              </label>
              <select
                value={form.prompt_a_id} onChange={e => set('prompt_a_id', e.target.value)}
                className="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 outline-none focus:border-violet-600"
              >
                <option value="">Select prompt…</option>
                {prompts.filter(p => p.id !== form.prompt_b_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                <span className="text-sky-300 font-bold">B</span> — Challenger prompt *
              </label>
              <select
                value={form.prompt_b_id} onChange={e => set('prompt_b_id', e.target.value)}
                className="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 outline-none focus:border-violet-600"
              >
                <option value="">Select prompt…</option>
                {prompts.filter(p => p.id !== form.prompt_a_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 font-medium">Traffic split</label>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-violet-300 font-medium">A: {form.traffic_split}%</span>
                <span className="text-sky-300 font-medium">B: {100 - form.traffic_split}%</span>
              </div>
            </div>
            <input
              type="range" min="10" max="90" step="5" value={form.traffic_split}
              onChange={e => set('traffic_split', Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-xs text-gray-700 mt-1">
              <span>10%</span><span>50/50</span><span>90%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-4 py-2">Cancel</button>
          <button
            onClick={() => valid && onCreate({ ...form, traffic_split: form.traffic_split / 100 })}
            disabled={!valid}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg font-medium"
          >
            <Play className="h-3.5 w-3.5" /> Start test
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ABTesting() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'concluded'>('all')

  const { data: tests = [], isLoading } = useQuery<ABTest[]>({
    queryKey: ['ab-tests'],
    queryFn: async () => { const { data } = await api.get('/prompts/ab-tests'); return data.tests ?? [] },
    refetchInterval: 10_000,
  })

  const { data: prompts = [] } = useQuery<Prompt[]>({
    queryKey: ['prompts'],
    queryFn: async () => { const { data } = await api.get('/prompts'); return data.prompts ?? [] },
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/prompts/ab-tests', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ab-tests'] }); setShowCreate(false) },
  })

  const concludeMutation = useMutation({
    mutationFn: ({ id, winnerId }: { id: string; winnerId: string }) =>
      api.post(`/prompts/ab-tests/${id}/conclude`, { winner_id: winnerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-tests'] }),
  })

  const simulateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/prompts/ab-tests/${id}/simulate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-tests'] }),
  })

  const filtered = tests.filter(t => statusFilter === 'all' || t.status === statusFilter)
  const running = tests.filter(t => t.status === 'running').length
  const concluded = tests.filter(t => t.status === 'concluded').length
  const sigCount = tests.filter(t => t.significant).length

  return (
    <div className="space-y-5">
      {showCreate && (
        <CreateModal
          prompts={prompts}
          onClose={() => setShowCreate(false)}
          onCreate={data => createMutation.mutate(data)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Prompt A/B Testing</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare prompt variants with live traffic · statistical significance via Z-test
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium
            bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500
            text-white shadow-lg shadow-violet-900/30"
        >
          <Plus className="h-4 w-4" /> New Test
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Tests', value: tests.length, color: 'text-white' },
          { label: 'Running', value: running, color: running > 0 ? 'text-violet-400' : 'text-gray-500' },
          { label: 'Concluded', value: concluded, color: 'text-emerald-400' },
          { label: 'Significant Results', value: sigCount, color: sigCount > 0 ? 'text-amber-400' : 'text-gray-500' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1 w-fit">
        {(['all', 'running', 'concluded'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              statusFilter === tab ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'all' ? `All (${tests.length})` : tab === 'running' ? `Running (${running})` : `Concluded (${concluded})`}
          </button>
        ))}
      </div>

      {/* Test list */}
      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tests…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <FlaskConical className="h-10 w-10 text-gray-700 mx-auto mb-3" />
            <div className="text-gray-400 font-medium mb-1">No tests yet</div>
            <div className="text-sm text-gray-600 mb-4">Create a test to start comparing prompt variants</div>
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg"
            >
              Create first test
            </button>
          </div>
        )}
        {filtered.map(test => (
          <TestCard
            key={test.id}
            test={test}
            onConclude={(id, winnerId) => concludeMutation.mutate({ id, winnerId })}
            onSimulate={id => simulateMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  )
}
