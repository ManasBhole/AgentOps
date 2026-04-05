import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Orion crash]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--bg-page)' }}>
        <div className="max-w-md w-full bg-gray-900 border border-red-900/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-900 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Something went wrong</div>
              <div className="text-xs text-gray-500 mt-0.5">A component crashed — details below</div>
            </div>
          </div>

          <pre className="text-xs font-mono text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-3 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
            {error.message}
          </pre>

          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            className="w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl font-medium text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <RefreshCw className="h-4 w-4" /> Reload app
          </button>
        </div>
      </div>
    )
  }
}
