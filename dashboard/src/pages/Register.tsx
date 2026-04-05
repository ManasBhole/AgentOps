import { useState, FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { isAuthenticated, register } = useAuth()

  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  if (isAuthenticated) return <Navigate to="/" replace />

  const passwordsMatch = password === confirm
  const passwordStrong = password.length >= 8

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password || !confirm) return
    if (!passwordsMatch) { setError('Passwords do not match'); return }
    if (!passwordStrong) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try { await register(name, email, password) }
    catch (err: any) {
      const body = err?.response?.data
      setError(body?.error ?? body?.message ?? `Registration failed (${err?.response?.status ?? 'network error'})`)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.35)' }}>
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3" r="1.5" fill="white" />
              <circle cx="4" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
              <circle cx="12" cy="9" r="1.2" fill="white" fillOpacity="0.8" />
              <circle cx="6" cy="13" r="0.9" fill="white" fillOpacity="0.5" />
              <circle cx="10" cy="13" r="0.9" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Orion</h1>
        </div>

        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Create your account</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start observing your AI agents today</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm mb-5 border"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Full name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Jane Smith" autoComplete="name" required
              className="w-full rounded-xl px-3.5 py-2.5 text-sm border transition-colors focus:outline-none"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required
              className="w-full rounded-xl px-3.5 py-2.5 text-sm border transition-colors focus:outline-none"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" required
                className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm border transition-colors focus:outline-none"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: password && !passwordStrong ? '#ef4444' : 'var(--border-default)',
                  color: 'var(--text-primary)',
                }} />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password && !passwordStrong && <p className="text-xs mt-1" style={{ color: '#f87171' }}>Must be at least 8 characters</p>}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm password</label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password" required
                className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm border transition-colors focus:outline-none"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: confirm && !passwordsMatch ? '#ef4444' : confirm && passwordsMatch ? '#34d399' : 'var(--border-default)',
                  color: 'var(--text-primary)',
                }} />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
                {confirm && passwordsMatch
                  ? <CheckCircle2 className="h-4 w-4" style={{ color: '#34d399' }} />
                  : showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirm && !passwordsMatch && <p className="text-xs mt-1" style={{ color: '#f87171' }}>Passwords don't match</p>}
          </div>

          <button type="submit"
            disabled={loading || !name || !email || !password || !confirm || !passwordsMatch || !passwordStrong}
            className="w-full flex items-center justify-center gap-2 text-white font-semibold text-sm py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold" style={{ color: '#818cf8' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
