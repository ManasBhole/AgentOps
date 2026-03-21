import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FlaskConical, Plus, Play, Trash2, CheckCircle2, XCircle,
  RefreshCw, ChevronRight, BarChart3, Clock, DollarSign,
  Target,
} from 'lucide-react'
import api from '../services/api'

type Suite = {
  id: string; name: string; description: string; agent_id: string
  created_by: string; created_at: string; case_count: number
  last_run_at?: string; last_score?: number
}
type EvalCase = {
  id: string; suite_id: string; input: string
  expected_output: string; tags: string; created_at: string
}
type EvalRun = {
  id: string; suite_id: string; status: string
  total_cases: number; passed: number; failed: number
  avg_score: number; total_cost_usd: number; avg_latency_ms: number
  started_at: string; completed_at?: string
}
type EvalResult = {
  id: string; run_id: string; case_id: string
  actual_output: string; score: number; passed: boolean
  latency_ms: number; cost_usd: number; error?: string
  input: string; expected_output: string
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'text-emerald-400 bg-emerald-950 border-emerald-900'
    : pct >= 60 ? 'text-yellow-400 bg-yellow-950 border-yellow-900'
    : 'text-red-400 bg-red-950 border-red-900'
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-mono font-medium ${color}`}>{pct}%</span>
}

export default function EvalFramework() {
  const qc = useQueryClient()
  const [selectedSuite, setSelectedSuite] = useState<Suite | null>(null)
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null)
  const [newSuiteName, setNewSuiteName] = useState('')
  const [newSuiteDesc, setNewSuiteDesc] = useState('')
  const [showNewSuite, setShowNewSuite] = useState(false)
  const [newCaseInput, setNewCaseInput] = useState('')
  const [newCaseExpected, setNewCaseExpected] = useState('')
  const [showAddCase, setShowAddCase] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState('')

  // Suites list
  const { data: suitesData, isFetching: suitesFetching, refetch: refetchSuites } = useQuery({
    queryKey: ['eval-suites'],
    queryFn: async () => { const { data } = await api.get('/evals/suites'); return data },
  })
  const suites: Suite[] = suitesData?.suites ?? []

  // Selected suite detail (cases)
  const { data: suiteDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['eval-suite', selectedSuite?.id],
    queryFn: async () => { const { data } = await api.get(`/evals/suites/${selectedSuite!.id}`); return data },
    enabled: !!selectedSuite,
  })
  const cases: EvalCase[] = suiteDetail?.cases ?? []

  // Runs for selected suite
  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['eval-runs', selectedSuite?.id],
    queryFn: async () => { const { data } = await api.get(`/evals/suites/${selectedSuite!.id}/runs`); return data },
    enabled: !!selectedSuite,
    refetchInterval: selectedRun?.status === 'running' ? 2000 : false,
  })
  const runs: EvalRun[] = runsData?.runs ?? []

  // Run results
  const { data: runDetail } = useQuery({
    queryKey: ['eval-run-detail', selectedRun?.id],
    queryFn: async () => { const { data } = await api.get(`/evals/runs/${selectedRun!.id}`); return data },
    enabled: !!selectedRun,
    refetchInterval: selectedRun?.status === 'running' ? 2000 : false,
  })
  const results: EvalResult[] = runDetail?.results ?? []
  const liveRun: EvalRun | undefined = runDetail?.run

  const createSuiteMutation = useMutation({
    mutationFn: async () => api.post('/evals/suites', { name: newSuiteName, description: newSuiteDesc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eval-suites'] }); setShowNewSuite(false); setNewSuiteName(''); setNewSuiteDesc(''); setMutationError('') },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to create suite'),
  })

  const deleteSuiteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/evals/suites/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eval-suites'] }); setSelectedSuite(null); setDeleteConfirm(null) },
  })

  const addCaseMutation = useMutation({
    mutationFn: async () => api.post(`/evals/suites/${selectedSuite!.id}/cases`, { input: newCaseInput, expected_output: newCaseExpected }),
    onSuccess: () => { refetchDetail(); setNewCaseInput(''); setNewCaseExpected(''); setShowAddCase(false); setMutationError('') },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to add case'),
  })

  const deleteCaseMutation = useMutation({
    mutationFn: async (caseID: string) => api.delete(`/evals/suites/${selectedSuite!.id}/cases/${caseID}`),
    onSuccess: () => refetchDetail(),
  })

  const runMutation = useMutation({
    mutationFn: async () => { const { data } = await api.post(`/evals/suites/${selectedSuite!.id}/run`); return data },
    onSuccess: (run) => { setSelectedRun(run); refetchRuns(); setMutationError('') },
    onError: (e: any) => setMutationError(e?.response?.data?.error ?? 'Failed to start run'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-purple-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Eval Framework</h1>
            <p className="text-sm text-gray-500">Define test suites · run evals · track quality over time</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetchSuites()} className="p-1.5 rounded-lg text-gray-500 hover:text-white bg-gray-800 border border-gray-700">
            <RefreshCw className={`h-3.5 w-3.5 ${suitesFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewSuite(true)}
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> New Suite
          </button>
        </div>
      </div>

      {/* Error banner */}
      {mutationError && (
        <div className="flex items-center justify-between gap-2 bg-red-950 border border-red-900 rounded-lg px-4 py-2.5 text-sm text-red-400">
          <span>{mutationError}</span>
          <button onClick={() => setMutationError('')} className="text-red-500 hover:text-red-300 flex-shrink-0 text-xs">✕</button>
        </div>
      )}

      {/* New suite form */}
      {showNewSuite && (
        <div className="bg-gray-900 border border-purple-900 rounded-xl p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Suite Name</label>
            <input value={newSuiteName} onChange={e => setNewSuiteName(e.target.value)}
              placeholder="e.g. RAG quality suite"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Description</label>
            <input value={newSuiteDesc} onChange={e => setNewSuiteDesc(e.target.value)}
              placeholder="Optional"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
          </div>
          <button onClick={() => createSuiteMutation.mutate()}
            disabled={!newSuiteName.trim() || createSuiteMutation.isPending}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg">
            Create
          </button>
          <button onClick={() => setShowNewSuite(false)} className="px-3 py-2 text-gray-400 hover:text-white text-sm bg-gray-800 rounded-lg">Cancel</button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Suite list */}
        <div className="col-span-3 space-y-2">
          {suites.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <FlaskConical className="h-8 w-8 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No suites yet. Create one to start evaluating.</p>
            </div>
          )}
          {suites.map(s => (
            <div key={s.id}
              onClick={() => { setSelectedSuite(s); setSelectedRun(null) }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedSuite?.id === s.id ? 'border-purple-500 bg-purple-950/20' : 'border-gray-800 hover:border-gray-700 bg-gray-900'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-white">{s.name}</span>
                {s.last_score != null && s.last_score > 0 && <ScoreBadge score={s.last_score} />}
              </div>
              {s.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{s.description}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                <span>{s.case_count} cases</span>
                {s.last_run_at && <span>{new Date(s.last_run_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Main: cases + runs */}
        <div className="col-span-9 space-y-4">
          {!selectedSuite ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 flex items-center justify-center">
              <div className="text-center">
                <Target className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a suite to view cases and run evals</p>
              </div>
            </div>
          ) : (
            <>
              {/* Suite header */}
              <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">{selectedSuite.name}</h2>
                  <p className="text-xs text-gray-500">{cases.length} cases</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddCase(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 px-3 py-1.5 rounded-lg">
                    <Plus className="h-3.5 w-3.5" /> Add Case
                  </button>
                  <button onClick={() => runMutation.mutate()}
                    disabled={cases.length === 0 || runMutation.isPending}
                    className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg">
                    {runMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {runMutation.isPending ? 'Running…' : 'Run Suite'}
                  </button>
                  <button onClick={() => setDeleteConfirm(selectedSuite.id)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 bg-gray-800">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Add case form */}
              {showAddCase && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">New Test Case</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Input</label>
                      <textarea rows={3} value={newCaseInput} onChange={e => setNewCaseInput(e.target.value)}
                        placeholder="What the agent receives as input…"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Expected Output <span className="text-gray-600">(optional)</span></label>
                      <textarea rows={3} value={newCaseExpected} onChange={e => setNewCaseExpected(e.target.value)}
                        placeholder="What the ideal response looks like…"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addCaseMutation.mutate()}
                      disabled={!newCaseInput.trim() || addCaseMutation.isPending}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs rounded-lg">
                      Add Case
                    </button>
                    <button onClick={() => setShowAddCase(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs bg-gray-800 rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {/* Cases table */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Test Cases
                </div>
                {cases.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No cases yet. Add one above.</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {cases.map((ec, i) => (
                      <div key={ec.id} className="flex items-start gap-4 px-4 py-3 hover:bg-gray-800/30">
                        <span className="text-xs text-gray-600 font-mono mt-0.5 w-5">{i + 1}</span>
                        <div className="flex-1 grid grid-cols-2 gap-4 min-w-0">
                          <div>
                            <div className="text-xs text-gray-500 mb-0.5">Input</div>
                            <p className="text-xs text-gray-300 font-mono line-clamp-2">{ec.input}</p>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-0.5">Expected</div>
                            <p className="text-xs text-gray-400 font-mono line-clamp-2">
                              {ec.expected_output || <span className="text-gray-600 italic">any output</span>}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => deleteCaseMutation.mutate(ec.id)}
                          className="text-gray-600 hover:text-red-400 flex-shrink-0 p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Runs history + results */}
              {runs.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Run History
                  </div>
                  <div className="divide-y divide-gray-800">
                    {runs.map(run => (
                      <button key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors ${selectedRun?.id === run.id ? 'bg-gray-800/50' : ''}`}>
                        <div className="flex items-center gap-2">
                          {run.status === 'completed'
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : run.status === 'running'
                            ? <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" />
                            : <XCircle className="h-4 w-4 text-red-400" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-mono">{run.id}</span>
                            {run.status === 'completed' && <ScoreBadge score={run.avg_score} />}
                            <span className="text-xs text-gray-600">{run.passed}/{run.total_cases} passed</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-600">
                            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{Math.round(run.avg_latency_ms)}ms avg</span>
                            <span className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" />${run.total_cost_usd.toFixed(4)}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-600">{new Date(run.started_at).toLocaleString()}</span>
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-case results */}
              {selectedRun && results.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-4 w-4 text-purple-400" />
                      <span className="text-sm font-medium text-white">Results — {selectedRun.id}</span>
                      {liveRun?.status === 'running' && (
                        <span className="text-xs text-yellow-400 flex items-center gap-1 animate-pulse">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Running…
                        </span>
                      )}
                    </div>
                    {liveRun && liveRun.status === 'completed' && (
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="text-emerald-400 font-medium">{liveRun.passed} passed</span>
                        <span className="text-red-400">{liveRun.failed} failed</span>
                        <ScoreBadge score={liveRun.avg_score} />
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-gray-800">
                    {results.map((r, i) => (
                      <div key={r.id} className={`px-4 py-3 ${r.passed ? '' : 'bg-red-950/10'}`}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {r.passed
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              : <XCircle className="h-4 w-4 text-red-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-gray-500 font-mono">#{i + 1}</span>
                              <ScoreBadge score={r.score} />
                              <span className="text-xs text-gray-600">{r.latency_ms}ms · ${r.cost_usd.toFixed(5)}</span>
                            </div>
                            {/* Score bar */}
                            <div className="w-full h-1 bg-gray-800 rounded-full mb-2">
                              <div className={`h-1 rounded-full transition-all ${r.score >= 0.8 ? 'bg-emerald-500' : r.score >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${r.score * 100}%` }} />
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <div className="text-gray-500 mb-0.5">Input</div>
                                <p className="text-gray-400 font-mono line-clamp-2">{r.input}</p>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Expected</div>
                                <p className="text-gray-400 font-mono line-clamp-2">
                                  {r.expected_output || <span className="italic text-gray-600">any</span>}
                                </p>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Actual</div>
                                <p className={`font-mono line-clamp-2 ${r.passed ? 'text-emerald-300' : 'text-red-300'}`}>{r.actual_output}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80">
            <h3 className="text-white font-medium mb-2">Delete suite?</h3>
            <p className="text-sm text-gray-400 mb-4">This will permanently delete the suite and all its test cases.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700">Cancel</button>
              <button onClick={() => deleteSuiteMutation.mutate(deleteConfirm)} className="flex-1 py-2 text-sm text-white bg-red-700 rounded-lg hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
