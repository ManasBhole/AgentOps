import { useState, FormEvent, useEffect, useRef } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND = import.meta.env.VITE_API_URL ?? ''

/* ── Provider definitions ────────────────────────────────────────── */
const ALL_PROVIDERS = [
  {
    id: 'google', label: 'Continue with Google',
    bg: '#fff', color: '#1f2937', border: 'rgba(0,0,0,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: 'github', label: 'Continue with GitHub',
    bg: '#18181b', color: '#fff', border: 'rgba(255,255,255,0.1)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
  },
  {
    id: 'linkedin', label: 'Continue with LinkedIn',
    bg: '#0A66C2', color: '#fff', border: 'transparent',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    id: 'twitter', label: 'Continue with X',
    bg: '#000', color: '#fff', border: 'rgba(255,255,255,0.12)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 5.557zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    id: 'apple', label: 'Continue with Apple',
    bg: '#000', color: '#fff', border: 'rgba(255,255,255,0.12)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
      </svg>
    ),
  },
]

/* ── Animated orb rings ─────────────────────────────────────────── */
function OrbRings() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 28px' }}>
      {/* Outer pulsing ring */}
      <div style={{
        position: 'absolute', inset: -16,
        borderRadius: '50%',
        border: '1px solid rgba(59,130,246,0.2)',
        animation: 'orbPulse 3s ease-in-out infinite',
      }} />
      {/* Mid ring */}
      <div style={{
        position: 'absolute', inset: -8,
        borderRadius: '50%',
        border: '1px solid rgba(59,130,246,0.35)',
        animation: 'orbPulse 3s ease-in-out infinite 0.5s',
      }} />
      {/* Glow */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: 'radial-gradient(circle,rgba(59,130,246,0.35) 0%,transparent 70%)',
        filter: 'blur(12px)',
        animation: 'glowPulse 3s ease-in-out infinite',
      }} />
      {/* Logo tile */}
      <div style={{
        position: 'relative', width: 80, height: 80,
        borderRadius: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
        boxShadow: '0 0 32px rgba(59,130,246,0.45), 0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 1,
      }}>
        <svg width="36" height="36" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3.5" r="1.5" fill="white"/>
          <circle cx="4" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
          <circle cx="12" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
          <circle cx="6" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
          <circle cx="10" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
          <line x1="8" y1="5" x2="4" y2="8.3" stroke="white" strokeOpacity="0.5" strokeWidth="0.8"/>
          <line x1="8" y1="5" x2="12" y2="8.3" stroke="white" strokeOpacity="0.5" strokeWidth="0.8"/>
        </svg>
      </div>
    </div>
  )
}

/* ── Animated particle dots ──────────────────────────────────────── */
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.5,
      o: Math.random() * 0.4 + 0.1,
    }))
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(59,130,246,${p.o})`
        ctx.fill()
      })
      // draw connections
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 100) {
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(59,130,246,${0.08 * (1 - d / 100)})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

/* ── Fancy input ─────────────────────────────────────────────────── */
function FancyInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement> & { rightSlot?: React.ReactNode }) {
  const { rightSlot, ...inputProps } = props as any
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, color: focused ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', transition: 'color 0.2s' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          {...inputProps}
          onFocus={e => { setFocused(true); inputProps.onFocus?.(e) }}
          onBlur={e => { setFocused(false); inputProps.onBlur?.(e) }}
          style={{
            width: '100%', padding: '13px 16px', boxSizing: 'border-box',
            paddingRight: rightSlot ? 44 : 16,
            borderRadius: 12, fontSize: 14,
            background: focused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
            border: focused ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
            color: '#f8fafc', outline: 'none',
            boxShadow: focused ? '0 0 0 3px rgba(59,130,246,0.12), inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
            ...inputProps.style,
          }}
        />
        {rightSlot && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const [searchParams] = useSearchParams()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(searchParams.get('error') ?? '')
  const [configuredProviders, setConfiguredProviders] = useState<string[] | null>(null)

  // Fetch which OAuth providers are actually configured on the backend
  useEffect(() => {
    fetch(`${BACKEND}/auth/oauth/providers`)
      .then(r => r.json())
      .then(d => {
        const enabled = Object.entries(d.providers ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k)
        setConfiguredProviders(enabled)
      })
      .catch(() => setConfiguredProviders([]))
  }, [])

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

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

  const providers = configuredProviders === null
    ? []  // still loading
    : ALL_PROVIDERS.filter(p => configuredProviders.includes(p.id))

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050508',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Particle canvas */}
      <Particles />

      {/* Radial glow blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 800, height: 800, top: '-300px', left: '-200px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(29,78,216,0.18) 0%,transparent 60%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, bottom: '-200px', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 60%)', filter: 'blur(60px)' }} />
        {/* Dot grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Left panel — visible on wide screens */}
      <div style={{
        flex: '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 80px',
        position: 'relative',
        zIndex: 1,
      }} className="login-left-panel">
        {/* Stats floating cards */}
        <div style={{ maxWidth: 400, width: '100%' }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>Live monitoring</span>
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: '#fff', margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.03em' }}>
              Every AI agent,<br />under control.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.6 }}>
              Real-time observability, incident response, and performance insights for your AI stack.
            </p>
          </div>

          {/* Floating metric cards */}
          {[
            { label: 'Active Agents', value: '12', delta: '+2 today', color: '#60a5fa' },
            { label: 'LLM Calls / hr', value: '4.2k', delta: '+18% vs yesterday', color: '#34d399' },
            { label: 'Avg Latency', value: '38ms', delta: '↓12ms improved', color: '#34d399' },
          ].map((m, i) => (
            <div key={m.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderRadius: 14, marginBottom: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(12px)',
              animation: `slideInLeft 0.5s ease ${i * 100}ms both`,
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{m.value}</div>
              </div>
              <div style={{ fontSize: 11, color: m.color, fontWeight: 600, textAlign: 'right' }}>{m.delta}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flexShrink: 0,
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 40px',
        position: 'relative',
        zIndex: 1,
        borderLeft: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(24px)',
      }} className="login-right-panel">
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo + title */}
          <OrbRings />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: '0 0 6px', textAlign: 'center', letterSpacing: '-0.03em' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', margin: '0 0 32px', textAlign: 'center' }}>
            Sign in to your Orion workspace
          </p>

          {/* OAuth buttons */}
          {providers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {providers.map(p => (
                <a
                  key={p.id}
                  href={`${BACKEND}/auth/oauth/${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    padding: '13px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    background: p.bg, color: p.color,
                    border: `1px solid ${p.border}`,
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    transition: 'transform 0.15s, opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {p.icon}
                  {p.label}
                </a>
              ))}
            </div>
          )}

          {/* Divider */}
          {providers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 12, fontSize: 13, marginBottom: 20, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />{error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FancyInput
              label="Email address"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <FancyInput
              label="Password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              rightSlot={
                <button type="button" onClick={() => setShowPass(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', padding: 2, display: 'flex' }}>
                  {showPass ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                </button>
              }
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
              <a href="#" style={{ fontSize: 12, color: 'rgba(59,130,246,0.7)', textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(59,130,246,0.7)')}>
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading || !email || !password ? 'rgba(255,255,255,0.15)' : '#fff',
                boxShadow: loading ? 'none' : '0 0 24px rgba(255,255,255,0.15)',
                opacity: loading || !email || !password ? 0.5 : 1,
                transition: 'all 0.2s',
                marginTop: 4,
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              onMouseDown={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = 'scale(0.99)' }}
              onMouseUp={e => { if (!loading) (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
            >
              {loading && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', color: '#666' }} />}
              {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight style={{ width: 16, height: 16 }} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, marginTop: 24, color: 'rgba(255,255,255,0.25)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#60a5fa', fontWeight: 600, textDecoration: 'none' }}>
              Create one →
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .login-left-panel { display: none; }
        @media (min-width: 900px) {
          .login-left-panel { display: flex; }
          .login-right-panel { max-width: 480px !important; }
        }
      `}</style>
    </div>
  )
}
