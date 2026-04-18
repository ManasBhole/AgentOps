import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Play, Pause, SkipBack, SkipForward, GitFork,
  ChevronRight, DollarSign, Zap, AlertTriangle, CheckCircle2,
  Search, RefreshCw,
} from 'lucide-react'
import api from '../services/api'

interface Snapshot {
  id: string
  trace_id: string
  span_id: string
  agent_id: string
  run_id: string
  seq_num: number
  span_name: string
  state: string
  tokens_used: number
  cost_usd: number
  duration_ms: number
  status: string
  recorded_at: string
}

interface Fork {
  id: string
  original_trace_id: string
  fork_snapshot_id: string
  fork_seq_num: number
  label: string
  notes: string
  created_by: string
  created_at: string
}

interface Timeline {
  trace_id: string
  agent_id: string
  run_id: string
  snapshots: Snapshot[]
  forks: Fork[]
  total_cost_usd: number
  total_tokens: number
  duration_ms: number
}

interface TraceListItem {
  trace_id: string
  agent_id: string
  run_id: string
  span_count: number
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  ok:      'text-emerald-400',
  error:   'text-red-400',
  running: 'text-yellow-400',
}
const STATUS_DOT: Record<string, string> = {
  ok:      'bg-emerald-500',
  error:   'bg-red-500',
  running: 'bg-yellow-500 animate-pulse',
}

function parseState(raw: string): Record<string, any> {
  try { return JSON.parse(raw) } catch { return {} }
}

export default function TimeTravelDebugger() {
  const qc = useQueryClient()
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [search, setSearch] = useState('')
  const [forkLabel, setForkLabel] = useState('')
  const [forkNotes, setForkNotes] = useState('')
  const [showForkModal, setShowForkModal] = useState(false)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: listData, isFetching: listFetching } = useQuery({
    queryKey: ['tt-list'],
    queryFn: async () => {
      const { data } = await api.get('/timetravel/timelines')
      return data as { timelines: TraceListItem[] }
    },
    refetchInterval: 30_000,
  })

  const timelines: TraceListItem[] = Array.isArray(listData?.timelines) ? listData!.timelines : []
  const filtered = search
    ? timelines.filter(t => t.trace_id.includes(search) || t.run_id.includes(search))
    : timelines

  const { data: timelineData } = useQuery({
    queryKey: ['tt-timeline', selectedTrace],
    queryFn: async () => {
      const { data } = await api.get(`/timetravel/timelines/${selectedTrace}`)
      return data as { timeline: Timeline }
    },
    enabled: !!selectedTrace,
  })

  const timeline = timelineData?.timeline
  const snapshots: Snapshot[] = Array.isArray(timeline?.snapshots) ? timeline!.snapshots : []
  const currentSnap = snapshots[currentStep] ?? null

  // Auto-play
  useEffect(() => {
    if (playing && snapshots.length > 0) {
      playRef.current = setInterval(() => {
        setCurrentStep(s => {
          if (s >= snapshots.length - 1) { setPlaying(false); return s }
          return s + 1
        })
      }, 800)
    } else if (playRef.current) {
      clearInterval(playRef.current)
    }
    return () => { if (playRef.current) clearInterval(playRef.current) }
  }, [playing, snapshots.length])

  // Reset step when trace changes
  useEffect(() => { setCurrentStep(0); setPlaying(false) }, [selectedTrace])

  const forkMutation = useMutation({
    mutationFn: async () => api.post('/timetravel/fork', {
      trace_id: selectedTrace,
      snapshot_id: currentSnap?.id,
      label: forkLabel,
      notes: forkNotes,
    }),
    onSuccess: () => {
      setShowForkModal(false); setForkLabel(''); setForkNotes('')
      qc.invalidateQueries({ queryKey: ['tt-timeline', selectedTrace] })
    },
  })

  const state = currentSnap ? parseState(currentSnap.state) : {}
  const cumulativeCost = (state.cumulative_cost as number) ?? 0
  const cumulativeTokens = (state.cumulative_tokens as number) ?? 0
  const totalSteps = snapshots.length

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left: trace list */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Executions</span>
            {listFetching && <RefreshCw className="h-3 w-3 text-gray-500 animate-spin ml-auto" />}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search trace ID…"
              className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-500">
              No executions yet — ingest some traces first
            </div>
          )}
          {filtered.map(t => (
            <button key={t.trace_id} onClick={() => setSelectedTrace(t.trace_id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors ${selectedTrace === t.trace_id ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : ''}`}>
              <div className="text-xs font-mono text-gray-300 truncate">{t.trace_id.slice(0, 16)}…</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">{t.span_count} steps</span>
                <span className="text-xs text-gray-600">·</span>
                <span className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: debugger */}
      {!selectedTrace ? (
        <div className="flex-1 flex items-center justify-center bg-gray-900 border border-gray-800 rounded-xl">
          <div className="text-center">
            <Clock className="h-12 w-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">Select an execution to debug</p>
            <p className="text-gray-600 text-xs mt-1">Scrub through every step like a video player</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Timeline header */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-mono text-gray-300 truncate">{selectedTrace}</span>
                  {timeline && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {totalSteps} steps · ${timeline.total_cost_usd.toFixed(5)} · {timeline.total_tokens.toLocaleString()} tokens
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowForkModal(true)}
                disabled={!currentSnap}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950 border border-blue-800 hover:border-blue-600 text-blue-300 text-xs rounded-lg disabled:opacity-50 transition-colors">
                <GitFork className="h-3.5 w-3.5" /> Fork from here
              </button>
            </div>

            {/* Scrubber */}
            <div className="space-y-2">
              <input type="range" min={0} max={Math.max(0, totalSteps - 1)}
                value={currentStep}
                onChange={e => { setPlaying(false); setCurrentStep(Number(e.target.value)) }}
                className="w-full accent-blue-500 cursor-pointer"
              />

              {/* Step markers */}
              <div className="flex gap-0.5 h-4 overflow-hidden">
                {snapshots.map((snap, i) => (
                  <button key={snap.id}
                    onClick={() => { setPlaying(false); setCurrentStep(i) }}
                    className={`flex-1 rounded-sm transition-colors ${i === currentStep ? 'bg-blue-500' : snap.status === 'error' ? 'bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title={snap.span_name}
                  />
                ))}
              </div>

              {/* Playback controls */}
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => { setPlaying(false); setCurrentStep(0) }}
                  className="p-1.5 text-gray-400 hover:text-white"><SkipBack className="h-4 w-4" /></button>
                <button onClick={() => { setPlaying(false); setCurrentStep(s => Math.max(0, s - 1)) }}
                  className="p-1.5 text-gray-400 hover:text-white"><ChevronRight className="h-4 w-4 rotate-180" /></button>
                <button onClick={() => setPlaying(v => !v)}
                  className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button onClick={() => { setPlaying(false); setCurrentStep(s => Math.min(totalSteps - 1, s + 1)) }}
                  className="p-1.5 text-gray-400 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                <button onClick={() => { setPlaying(false); setCurrentStep(totalSteps - 1) }}
                  className="p-1.5 text-gray-400 hover:text-white"><SkipForward className="h-4 w-4" /></button>
                <span className="text-xs text-gray-500 ml-2">Step {currentStep + 1} / {totalSteps}</span>
              </div>
            </div>
          </div>

          {/* Step detail */}
          {currentSnap && (
            <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
              {/* Span info */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[currentSnap.status] ?? 'bg-gray-500'}`} />
                  <span className="text-sm font-semibold text-white truncate">{currentSnap.span_name}</span>
                  <span className={`text-xs ml-auto flex-shrink-0 ${STATUS_COLOR[currentSnap.status] ?? 'text-gray-400'}`}>
                    {currentSnap.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Duration', value: `${currentSnap.duration_ms}ms`, icon: Clock },
                    { label: 'Tokens', value: currentSnap.tokens_used.toLocaleString(), icon: Zap },
                    { label: 'Cost', value: `$${currentSnap.cost_usd.toFixed(6)}`, icon: DollarSign },
                    { label: 'Seq', value: `#${currentSnap.seq_num + 1}`, icon: ChevronRight },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-gray-800 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3 w-3 text-gray-500" />
                        <span className="text-xs text-gray-500">{label}</span>
                      </div>
                      <div className="text-sm font-medium text-white">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Cumulative progress */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-medium">Cumulative at this step</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Cost so far</span>
                    <span className="text-blue-300">${cumulativeCost.toFixed(5)}</span>
                  </div>
                  {timeline && timeline.total_cost_usd > 0 && (
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(cumulativeCost / timeline.total_cost_usd) * 100}%` }} />
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Tokens so far</span>
                    <span className="text-blue-300">{cumulativeTokens.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* State inspector */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto">
                <div className="text-xs font-medium text-gray-400 mb-3">Agent State at Step {currentStep + 1}</div>
                {currentSnap.status === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5" /> Error occurred at this step
                  </div>
                )}
                {currentSnap.status === 'ok' && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 rounded-lg px-3 py-2 mb-3">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Step completed successfully
                  </div>
                )}
                <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Forks strip */}
          {timeline && timeline.forks.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <GitFork className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-medium text-gray-300">Forks from this execution</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {timeline.forks.map(f => (
                  <div key={f.id} className="text-xs bg-blue-950 border border-blue-900 rounded-lg px-3 py-1.5">
                    <span className="text-blue-300 font-medium">{f.label}</span>
                    <span className="text-gray-500 ml-2">at step #{f.fork_seq_num + 1}</span>
                    {f.notes && <span className="text-gray-600 ml-2">· {f.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fork modal */}
      {showForkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowForkModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <GitFork className="h-4 w-4 text-blue-400" /> Fork from Step {currentStep + 1}
            </h3>
            <p className="text-xs text-gray-500 mb-4">Mark this as a branch point for comparison or replay</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fork Label</label>
                <input value={forkLabel} onChange={e => setForkLabel(e.target.value)}
                  placeholder="e.g. retry-with-gpt4"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                <textarea value={forkNotes} onChange={e => setForkNotes(e.target.value)}
                  placeholder="What are you changing in this branch?"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => forkMutation.mutate()}
                disabled={!forkLabel || forkMutation.isPending}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg">
                {forkMutation.isPending ? 'Creating…' : 'Create Fork'}
              </button>
              <button onClick={() => setShowForkModal(false)}
                className="px-4 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
