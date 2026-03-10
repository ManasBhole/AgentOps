import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

type Incident = {
  id: string
  title: string
  severity: string
  status: string
  agent_id: string
  trace_id: string
  root_cause: string
  confidence: number
  created_at: string
  resolved_at?: string | null
}

type IncidentsResponse = {
  incidents: Incident[]
}

async function fetchIncidents(): Promise<Incident[]> {
  const { data } = await api.get<IncidentsResponse>('/incidents', {
    params: { limit: 50 },
  })
  return data.incidents ?? []
}

async function resolveIncident(id: string): Promise<Incident> {
  const { data } = await api.post<{ incident: Incident }>(`/incidents/${id}/resolve`)
  return data.incident
}

export default function Incidents() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
    refetchInterval: 10_000,
  })

  const resolveMutation = useMutation({
    mutationFn: resolveIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
    },
  })

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Incidents</h2>
      <p className="mt-1 text-sm text-gray-500">Monitor and resolve agent incidents</p>

      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Recent Incidents</h3>
          <span className="text-xs text-gray-500">
            {data?.length ?? 0} results
          </span>
        </div>

        <div className="p-4">
          {isLoading && <p className="text-gray-500 text-sm">Loading incidents...</p>}
          {isError && (
            <p className="text-red-500 text-sm">
              Failed to load incidents. Check API and try again.
            </p>
          )}

          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <p className="text-gray-500 text-sm">
              No incidents yet. Trigger an error trace to see auto-created incidents.
            </p>
          )}

          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Root Cause
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created At
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data?.map((inc) => (
                    <tr key={inc.id}>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            inc.severity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            inc.status === 'resolved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {inc.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {inc.agent_id || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {inc.title}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 max-w-xs truncate">
                        {inc.root_cause}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(inc.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {inc.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => resolveMutation.mutate(inc.id)}
                            disabled={resolveMutation.isPending}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
