import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Loader2, Sparkles, X } from 'lucide-react'
import api from '../services/api'

export default function SeedBanner() {
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['seed-status'],
    queryFn: async () => {
      const { data } = await api.get('/seed/status')
      return data as { seeded: boolean; agents: number; incidents: number; traces: number }
    },
    refetchInterval: false,
    staleTime: 60_000,
  })

  const seed = useMutation({
    mutationFn: () => api.post('/seed'),
    onSuccess: () => {
      // Invalidate everything so all pages reload with real data
      qc.invalidateQueries()
    },
  })

  if (dismissed || status?.seeded) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-950 border-b border-indigo-900/60 text-sm">
      <Database className="h-4 w-4 text-indigo-400 flex-shrink-0" />
      <span className="text-indigo-200 flex-1">
        No data yet — load realistic demo data to populate every page instantly.
      </span>
      <button
        onClick={() => seed.mutate()}
        disabled={seed.isPending}
        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
      >
        {seed.isPending
          ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
          : <><Sparkles className="h-3 w-3" /> Load Demo Data</>
        }
      </button>
      {seed.isSuccess && (
        <span className="text-xs text-emerald-400 flex-shrink-0">✓ Done! Refreshing…</span>
      )}
      <button onClick={() => setDismissed(true)} className="text-indigo-500 hover:text-indigo-300 flex-shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
