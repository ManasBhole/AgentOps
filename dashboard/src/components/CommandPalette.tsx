import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bot, GitBranch, Siren, Loader2, ArrowRight } from 'lucide-react'
import api from '../services/api'

type SearchResult = {
  agents: { id: string; name: string; status: string }[]
  traces: { id: string; agent_id: string; status: string }[]
  incidents: { id: string; title: string; severity: string; status: string }[]
}

type FlatItem = { type: string; id: string; label: string; sub: string; path: string }

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query.trim())}`)
        setResults(data)
      } catch {
        setResults({ agents: [], traces: [], incidents: [] })
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const allItems: FlatItem[] = [
    ...(results?.agents ?? []).map(a => ({ type: 'agent', id: a.id, label: a.name || a.id, sub: a.status, path: '/agents' })),
    ...(results?.traces ?? []).map(t => ({ type: 'trace', id: t.id, label: t.id.slice(0, 8) + '…', sub: t.agent_id, path: '/traces' })),
    ...(results?.incidents ?? []).map(i => ({ type: 'incident', id: i.id, label: i.title, sub: i.severity, path: '/incidents' })),
  ]

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, allItems.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && allItems[cursor]) { navigate(allItems[cursor].path); onClose() }
    else if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  const iconFor = (type: string) => type === 'agent' ? Bot : type === 'trace' ? GitBranch : Siren

  const typeLabel: Record<string, string> = { agent: 'Agent', trace: 'Trace', incident: 'Incident' }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800">
          {loading
            ? <Loader2 className="h-4 w-4 text-indigo-400 animate-spin flex-shrink-0" />
            : <Search className="h-4 w-4 text-gray-500 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={handleKey}
            placeholder="Search agents, traces, incidents…"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <kbd className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!query && (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              Type to search agents, traces, or incidents
            </div>
          )}
          {query && !loading && allItems.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No results for <span className="text-gray-300">"{query}"</span>
            </div>
          )}
          {allItems.map((item, i) => {
            const Icon = iconFor(item.type)
            return (
              <button
                key={item.id}
                onClick={() => { navigate(item.path); onClose() }}
                onMouseEnter={() => setCursor(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2
                  ${i === cursor
                    ? 'bg-indigo-600/20 border-indigo-500'
                    : 'hover:bg-gray-800/60 border-transparent'
                  }`}
              >
                <Icon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{item.label}</div>
                  <div className="text-xs text-gray-500 truncate">
                    <span className="text-gray-600">{typeLabel[item.type]}</span> · {item.sub}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[11px] text-gray-600">
          <span><kbd className="bg-gray-800 border border-gray-700 px-1 rounded font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="bg-gray-800 border border-gray-700 px-1 rounded font-mono">↵</kbd> open</span>
          <span><kbd className="bg-gray-800 border border-gray-700 px-1 rounded font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
