import { useState, FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Bot, Eye, EyeOff, Loader2, AlertCircle, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname ?? '/'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showHint, setShowHint] = useState(false)

  if (isAuthenticated) return <Navigate to={from} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      await login(email, password)
    } catch (err: any) {
      const msg = err?.response?.data?.error
      setError(msg ?? 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-900/50">
            <Bot className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">AgentOps</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-950 border border-red-900 rounded-lg px-3 py-2.5 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* First-time setup hint */}
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowHint(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">First time here? Default credentials</span>
            {showHint ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showHint && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-400">
                A default <span className="text-yellow-400 font-medium">owner</span> account is auto-created when the database is empty.
              </p>
              <div className="bg-gray-800 rounded-lg px-3 py-2 font-mono text-xs text-gray-300 space-y-1">
                <div><span className="text-gray-500">email </span>admin@agentops.io</div>
                <div><span className="text-gray-500">pass  </span>agentops-admin</div>
              </div>
              <p className="text-xs text-gray-500">
                After logging in, go to <span className="text-gray-300">Settings → Profile</span> to change your name and password.
                To add teammates, go to <span className="text-gray-300">Settings → Users</span>.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-4">
          New accounts must be created by an admin · <span className="text-gray-600">AgentOps</span>
        </p>
      </div>
    </div>
  )
}
