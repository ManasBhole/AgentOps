import { useState, FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import OrionIllustration from '../components/OrionIllustration'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname ?? '/'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  if (isAuthenticated) return <Navigate to={from} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')
    try { await login(email, password) }
    catch (err: any) {
      if (err?.response?.data?.error) {
        setError(err.response.data.error)
      } else if (err?.code === 'ERR_NETWORK' || !err?.response) {
        setError('Cannot reach server — check your connection or try again in a moment')
      } else {
        setError(`Error ${err?.response?.status ?? ''}: ${err?.message ?? 'Login failed'}`)
      }
    }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)' }}>
      {/* Left panel — illustration */}
      <div className="hidden lg:flex flex-col w-[460px] flex-shrink-0 relative overflow-hidden"
        style={{ borderRight: '1px solid var(--border-subtle)' }}>
        <OrionIllustration />

        {/* Overlay text at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-8"
          style={{ background: 'linear-gradient(to top, rgba(6,11,24,0.95) 0%, rgba(6,11,24,0.6) 60%, transparent 100%)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="3" r="1.5" fill="white" />
                <circle cx="4" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
                <circle cx="12" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
              </svg>
            </div>
            <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>ORION</span>
          </div>
          <h2 className="text-2xl font-bold leading-snug mb-2" style={{ color: '#e2e8f0' }}>
            Your AI operations<br />command center.
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
            Observe every agent, debug in real-time, and ship with confidence.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.35)' }}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="3" r="1.5" fill="white" />
                <circle cx="4" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
                <circle cx="12" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
              </svg>
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Orion</h1>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Welcome back</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sign in to your workspace</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm mb-5 border"
              style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" required
                className="w-full rounded-xl px-3.5 py-2.5 text-sm border transition-colors focus:outline-none"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" required
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm border transition-colors focus:outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold text-sm py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-center mt-6" style={{ color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold" style={{ color: '#818cf8' }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
