import { useState, FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND = import.meta.env.VITE_API_URL ?? ''

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )},
  { id: 'github', label: 'GitHub', icon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )},
  { id: 'linkedin', label: 'LinkedIn', icon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )},
  { id: 'twitter', label: 'X', icon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 5.557zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )},
  { id: 'apple', label: 'Apple', icon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
  )},
]

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = (location.state as any)?.from?.pathname ?? '/'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(searchParams.get('error') ?? '')

  if (isAuthenticated) return <Navigate to={from} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')
    try { await login(email, password) }
    catch (err: any) {
      if (err?.response?.data?.error) setError(err.response.data.error)
      else if (err?.code === 'ERR_NETWORK' || !err?.response) setError('Cannot reach server — check your connection')
      else setError(`Error ${err?.response?.status ?? ''}: ${err?.message ?? 'Login failed'}`)
    }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030308', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>

      {/* Aurora background */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 600, height: 600, top: '-150px', left: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(76,29,149,0.5) 0%,transparent 65%)', filter: 'blur(100px)', animation: 'auroraFloat1 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, bottom: '-100px', right: '-80px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(30,58,138,0.45) 0%,transparent 65%)', filter: 'blur(100px)', animation: 'auroraFloat2 22s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.045) 1px,transparent 1px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)' }} />
      </div>

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400,
        margin: '24px',
        padding: '40px 36px',
        borderRadius: 24,
        background: 'rgba(10,15,30,0.75)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(32px) saturate(200%)',
        boxShadow: '0 40px 100px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.1)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 28px rgba(99,102,241,0.5)' }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.5" fill="white"/>
              <circle cx="4" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
              <circle cx="12" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
              <circle cx="6" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
              <circle cx="10" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
              <line x1="8" y1="5" x2="4" y2="8.3" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
              <line x1="8" y1="5" x2="12" y2="8.3" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Welcome back</h1>
          <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)', margin: 0 }}>Sign in to your Orion workspace</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 13, marginBottom: 20, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />{error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'rgba(148,163,184,0.6)' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 14,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'rgba(148,163,184,0.6)' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" required
                style={{
                  width: '100%', padding: '10px 40px 10px 14px', borderRadius: 12, fontSize: 14,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', padding: 2 }}>
                {showPass ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              boxShadow: loading ? 'none' : '0 0 28px rgba(99,102,241,0.4)',
              opacity: loading || !email || !password ? 0.6 : 1,
              transition: 'opacity 0.2s, transform 0.2s, box-shadow 0.2s',
              marginTop: 4,
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          >
            {loading && <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />}
            {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight style={{ width: 15, height: 15 }} /></>}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)' }}>or continue with</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* Social */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {PROVIDERS.map(p => (
            <a
              key={p.id}
              href={`${BACKEND}/auth/oauth/${p.id}`}
              title={p.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '9px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'all 0.2s', textDecoration: 'none',
                color: 'rgba(148,163,184,0.7)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
            >
              {p.icon}
            </a>
          ))}
        </div>

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 22, color: 'rgba(148,163,184,0.4)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#818cf8', fontWeight: 600, textDecoration: 'none' }}>
            Create one →
          </Link>
        </p>
      </div>
    </div>
  )
}
