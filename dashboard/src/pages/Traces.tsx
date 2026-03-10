import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

type Trace = {
  id: string
  agent_id: string
  run_id: string
  trace_id: string
  name: string
  status: string
  duration_ms: number
  start_time: string
  end_time?: string | null
}

type TracesResponse = {
  traces: Trace[]
}

async function fetchTraces(): Promise<Trace[]> {
  const { data } = await api.get<TracesResponse>('/traces', {
    params: { limit: 50 },
  })
  return data.traces ?? []
}

export default function Traces() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['traces'],
    queryFn: fetchTraces,
    refetchInterval: 10_000,
  })

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Traces</h2>
      <p className="mt-1 text-sm text-gray-500">View and analyze agent execution traces</p>

      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Recent Traces</h3>
          <span className="text-xs text-gray-500">
            {data?.length ?? 0} results
          </span>
        </div>

        <div className="p-4">
          {isLoading && <p className="text-gray-500 text-sm">Loading traces...</p>}
          {isError && (
            <p className="text-red-500 text-sm">
              Failed to load traces. Check API and try again.
            </p>
          )}

          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <p className="text-gray-500 text-sm">No traces yet. Run an instrumented agent to see data.</p>
          )}

          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Run ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data?.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {t.agent_id || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        <span className="font-mono text-xs">
                          {t.run_id?.slice(0, 8) || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {t.name}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            t.status === 'error'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {t.duration_ms ? `${t.duration_ms} ms` : '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {t.start_time
                          ? new Date(t.start_time).toLocaleString()
                          : '-'}
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
