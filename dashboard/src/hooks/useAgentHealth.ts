import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

export type HealthScore = {
  agent_id: string
  score: number
  grade: string
  status: string
  trend: string
  breakdown: {
    error_rate:       { score: number; label: string; value: string; weight: number }
    latency:          { score: number; label: string; value: string; weight: number }
    incident_rate:    { score: number; label: string; value: string; weight: number }
    cost_efficiency:  { score: number; label: string; value: string; weight: number }
  }
  computed_at: string
}

export function useAgentHealth(agentId: string) {
  return useQuery<HealthScore>({
    queryKey: ['health', agentId],
    queryFn: async () => {
      const { data } = await api.get(`/agents/${agentId}/health`)
      return data.health as HealthScore
    },
    enabled: !!agentId,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

export function useFleetHealth() {
  return useQuery<HealthScore[]>({
    queryKey: ['health', 'fleet'],
    queryFn: async () => {
      const { data } = await api.get('/health/fleet')
      return data.health as HealthScore[]
    },
    refetchInterval: 30_000,
  })
}

export function scoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 80) return 'text-green-400'
  if (score >= 65) return 'text-yellow-400'
  if (score >= 50) return 'text-orange-400'
  return 'text-red-400'
}

export function scoreBg(score: number) {
  if (score >= 90) return 'bg-emerald-900/60 border-emerald-800'
  if (score >= 80) return 'bg-green-900/60 border-green-800'
  if (score >= 65) return 'bg-yellow-900/60 border-yellow-800'
  if (score >= 50) return 'bg-orange-900/60 border-orange-800'
  return 'bg-red-900/60 border-red-800'
}

export function trendIcon(trend: string) {
  if (trend === 'up')   return '↑'
  if (trend === 'down') return '↓'
  return '→'
}
