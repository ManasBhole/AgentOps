import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Zap, Shield, Activity, GitBranch, AlertTriangle, TrendingUp } from 'lucide-react'

/* ─── Scroll reveal ──────────────────────────────────────────────── */
function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect() } }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{
      opacity: on ? 1 : 0, transform: on ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.23,1,0.32,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  )
}

/* ─── Animated counter ───────────────────────────────────────────── */
function Counter({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true
        const t0 = performance.now(), d = 2000
        const tick = (now: number) => {
          const p = Math.min((now - t0) / d, 1)
          setN(Math.floor((1 - Math.pow(1 - p, 3)) * to))
          if (p < 1) requestAnimationFrame(tick); else setN(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el); return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{prefix}{n.toLocaleString()}{suffix}</span>
}

/* ─── Mouse-tracked glow card ────────────────────────────────────── */
function GlowCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [glow, setGlow] = useState({ x: 50, y: 50 })
  const onMove = useCallback((e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect()
    setGlow({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }, [])
  return (
    <div ref={ref} onMouseMove={onMove}
      style={{
        position: 'relative', overflow: 'hidden',
        background: '#111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 20, padding: 28,
        transition: 'border-color 0.3s',
        ...style,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
    >
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.07, pointerEvents: 'none',
        background: `radial-gradient(200px circle at ${glow.x}% ${glow.y}%, rgba(255,255,255,0.8), transparent)`,
        transition: 'opacity 0.3s',
      }} />
      {children}
    </div>
  )
}

/* ─── Live trace feed ────────────────────────────────────────────── */
const FEED_ITEMS = [
  { id: 'llm.call', agent: 'research-agent', ms: 342, status: 'ok', tokens: 1240 },
  { id: 'tool.execute', agent: 'code-assistant', ms: 88, status: 'ok', tokens: 320 },
  { id: 'agent.run', agent: 'rag-pipeline', ms: 1820, status: 'error', tokens: 2810 },
  { id: 'memory.retrieve', agent: 'orchestrator', ms: 24, status: 'ok', tokens: 140 },
  { id: 'llm.call', agent: 'data-analyzer', ms: 560, status: 'ok', tokens: 890 },
  { id: 'tool.execute', agent: 'research-agent', ms: 210, status: 'ok', tokens: 440 },
  { id: 'agent.run', agent: 'code-assistant', ms: 670, status: 'ok', tokens: 1560 },
  { id: 'llm.call', agent: 'rag-pipeline', ms: 430, status: 'ok', tokens: 720 },
]

function TraceFeed() {
  const [items, setItems] = useState(FEED_ITEMS.slice(0, 5))
  useEffect(() => {
    const iv = setInterval(() => {
      setItems(prev => {
        const next = FEED_ITEMS[(FEED_ITEMS.indexOf(prev[0]) + 1) % FEED_ITEMS.length]
        return [next, ...prev.slice(0, 4)]
      })
    }, 1800)
    return () => clearInterval(iv)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((t, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 8,
          background: i === 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: i === 0 ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
          opacity: 1 - i * 0.15,
          transition: 'all 0.4s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'ok' ? '#22c55e' : '#ef4444', flexShrink: 0, boxShadow: t.status === 'ok' ? '0 0 5px #22c55e' : '0 0 5px #ef4444' }} />
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)' }}>{t.id}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{t.agent}</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 10, color: t.ms > 1000 ? '#fb923c' : 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{t.ms}ms</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{t.tokens}tok</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Hero product mockup ────────────────────────────────────────── */
function HeroMockup() {
  const bars = [38,52,41,68,60,82,66,88,56,92,74,84,64,88,76,94,78,86,70,96,82,90,86,93]
  return (
    <div style={{
      width: '100%', borderRadius: 16, overflow: 'hidden',
      background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 80px 140px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.04)',
      transform: 'perspective(1400px) rotateX(8deg) rotateY(-4deg)',
      transformOrigin: 'center top',
      animation: 'floatTilt 7s ease-in-out infinite',
      willChange: 'transform',
    }}>
      {/* Chrome */}
      <div style={{ height: 38, background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 14px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {['#ff5f57','#ffbd2e','#28ca41'].map(c => <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>orion.ai/dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulseDot 2s infinite' }} />
          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Live</span>
        </div>
      </div>
      {/* Content */}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { l: 'Active Agents', v: '12', d: '+2', c: '#60a5fa' },
            { l: 'LLM Calls/hr', v: '4.2k', d: '+18%', c: '#34d399' },
            { l: 'Avg Latency', v: '38ms', d: '↓12%', c: '#34d399' },
            { l: 'Error Rate', v: '0.3%', d: '↓0.1', c: '#34d399' },
          ].map(s => (
            <div key={s.l} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>{s.v}</span>
                <span style={{ fontSize: 10, color: s.c, fontWeight: 600 }}>{s.d}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Chart + trace */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>LLM Call Volume</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Last 24h</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '2px 2px 0 0', background: i >= 20 ? 'linear-gradient(to top,#3b82f6,#60a5fa)' : 'rgba(59,130,246,0.15)', boxShadow: i >= 20 ? '0 0 8px rgba(59,130,246,0.35)' : undefined }} />
              ))}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>Live Traces</span>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { n: 'llm.call', ok: true, ms: 342 },
                { n: 'tool.exec', ok: true, ms: 88 },
                { n: 'agent.run', ok: false, ms: 1820 },
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.ok ? '#22c55e' : '#ef4444' }} />
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>{t.n}</span>
                  </div>
                  <span style={{ fontSize: 9, color: t.ms > 1000 ? '#fb923c' : 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{t.ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Navbar ─────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 48px',
      background: scrolled ? 'rgba(0,0,0,0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.05)' : 'none',
      transition: 'all 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="3.5" r="1.5" fill="#000"/>
            <circle cx="4" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            <circle cx="12" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            <circle cx="6" cy="13.5" r="0.9" fill="#000" fillOpacity="0.4"/>
            <circle cx="10" cy="13.5" r="0.9" fill="#000" fillOpacity="0.4"/>
            <line x1="8" y1="5" x2="4" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
            <line x1="8" y1="5" x2="12" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
          </svg>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Orion</span>
      </div>

      <div style={{ display: 'flex', gap: 36 }}>
        {['Platform', 'Features', 'Pricing', 'Docs'].map(l => (
          <a key={l} href="#" style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
            {l}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link to="/login" style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
          Log in
        </Link>
        <Link to="/register" style={{
          fontSize: 14, fontWeight: 700, padding: '9px 22px', borderRadius: 10,
          background: '#fff', color: '#000', textDecoration: 'none',
          transition: 'opacity 0.15s, transform 0.15s',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
          onMouseUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}>
          Get a Demo
        </Link>
      </div>
    </nav>
  )
}

/* ─── Main ───────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif", overflowX: 'hidden' }}>
      <Navbar />

      {/* ── Announcement bar ───────────────────────────────────────── */}
      <div style={{ paddingTop: 64, background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', padding: '10px 20px', marginTop: 64 }}>
        <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 100, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa', fontWeight: 600 }}>New</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Real-time AI agent observability — now with GenomeDrift anomaly detection</span>
          <span style={{ fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>Learn more <ArrowRight style={{ width: 13, height: 13 }} /></span>
        </a>
      </div>

      {/* ── Hero split ─────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '88vh', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Left — product mockup */}
        <div style={{
          padding: '80px 48px 80px 80px',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle grid */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulseDot 2s infinite' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Monitoring 50M+ agent calls per month</span>
            </div>

            <h1 style={{ fontSize: 'clamp(36px,4vw,54px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.04em', margin: '0 0 20px', color: '#fff' }}>
              Observe every AI<br />agent in real-time.
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.4)', margin: '0 0 40px', lineHeight: 1.65, maxWidth: 460 }}>
              Production-grade monitoring for LLM agents. Catch incidents before users do. Reduce costs. Ship with confidence.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* CTA form */}
              <div style={{ display: 'flex', gap: 10, maxWidth: 440 }}>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your work email"
                  style={{
                    flex: 1, padding: '13px 16px', borderRadius: 12, fontSize: 14,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <button
                  onClick={() => { if (email) { setSubmitted(true) } }}
                  style={{
                    padding: '13px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: '#fff', color: '#000', border: 'none', cursor: 'pointer',
                    whiteSpace: 'nowrap', transition: 'opacity 0.15s, transform 0.15s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {submitted ? '✓ We\'ll be in touch' : 'Get started free →'}
                </button>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>No credit card required · 5-minute setup</span>
            </div>

            {/* Check list */}
            <div style={{ display: 'flex', gap: 20, marginTop: 36, flexWrap: 'wrap' }}>
              {['Real-time traces', 'Auto incident detection', 'Cost control'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Check style={{ width: 14, height: 14, color: '#22c55e' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — live demo + floating cards */}
        <div style={{
          padding: '80px 80px 80px 48px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', gap: 16,
          background: 'rgba(255,255,255,0.01)',
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 4 }}>Live trace monitor</div>
          <div style={{
            background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulseDot 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Streaming traces</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>4,218 calls/hr</span>
            </div>
            <TraceFeed />
          </div>

          {/* Floating alert card */}
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            animation: 'slideInRight 0.6s ease 0.3s both',
          }}>
            <AlertTriangle style={{ width: 18, height: 18, color: '#f87171', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Incident detected · rag-pipeline</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>p99 latency spiked to 1820ms · auto-correlating root cause</div>
            </div>
            <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600, whiteSpace: 'nowrap' }}>Just now</div>
          </div>

          {/* Floating budget card */}
          <div style={{
            background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            animation: 'slideInRight 0.6s ease 0.5s both',
          }}>
            <TrendingUp style={{ width: 18, height: 18, color: '#34d399', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Cost down 23% this week</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>ModelRouter shifted traffic to claude-haiku · $140 saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof logos ─────────────────────────────────────── */}
      <section style={{ padding: '48px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 28, fontWeight: 600 }}>
          Trusted by AI teams at
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
          {['Acme AI', 'DeepLayer', 'Veridian', 'Axon Labs', 'NovaCorp', 'Proxima'].map(c => (
            <span key={c} style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.15)', letterSpacing: '-0.02em', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.15)')}>
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden' }}>
            {[
              { n: 50, s: 'M+', label: 'Traces processed monthly', sub: 'Across all agent types' },
              { n: 99, s: '.9%', label: 'Platform uptime', sub: 'SLA-backed reliability' },
              { n: 5, s: 'min', label: 'Time to first insight', sub: 'No config needed' },
              { n: 40, s: '%', label: 'Average cost reduction', sub: 'Via intelligent routing' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '48px 36px', background: '#060606', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ fontSize: 'clamp(36px,3vw,52px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', marginBottom: 8 }}>
                  <Counter to={s.n} suffix={s.s} />
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section style={{ padding: '96px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: 16 }}>Platform</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#fff' }}>
              Everything your AI team needs.
            </h2>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: Activity, color: '#60a5fa', title: 'Real-time Observability', desc: 'Every LLM call, tool execution, and memory operation traced end-to-end. Sub-millisecond overhead with full context.' },
            { icon: AlertTriangle, color: '#f87171', title: 'Instant Incident Detection', desc: 'ML-powered anomaly detection fires before your users notice. Auto root-cause with correlated traces.' },
            { icon: Zap, color: '#34d399', title: 'Cost Intelligence', desc: 'ModelRouter automatically shifts traffic to cheaper models. Track spend per agent, per run, per user.' },
            { icon: Shield, color: '#fbbf24', title: 'Security & Compliance', desc: 'Red team testing, prompt injection detection, and audit logs. Built for regulated industries.' },
            { icon: GitBranch, color: '#fb923c', title: 'A/B Testing for Agents', desc: 'Compare prompts, models, and architectures with statistical significance. Ship with confidence.' },
            { icon: TrendingUp, color: '#a78bfa', title: 'Predictive Health', desc: 'Health scores and drift detection alert you before degradation impacts production.' },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <GlowCard>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${f.color}14`, border: `1px solid ${f.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <f.icon style={{ width: 20, height: 20, color: f.color }} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0, lineHeight: 1.7 }}>{f.desc}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Big demo section ───────────────────────────────────────── */}
      <section style={{ padding: '96px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: 16 }}>Product</div>
          <h2 style={{ fontSize: 'clamp(28px,3vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#fff' }}>
            See your agents clearly.
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.35)', marginTop: 16, lineHeight: 1.6 }}>
            One dashboard. Every agent. Zero blind spots.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <HeroMockup />
        </Reveal>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────── */}
      <section style={{ padding: '96px 80px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 'clamp(24px,2.5vw,38px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#fff' }}>
            Loved by AI engineers.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { quote: "Orion caught a prompt injection attack on our customer-facing agent before we even knew it was possible. It's become a non-negotiable part of our stack.", name: 'Sarah K.', role: 'Head of AI, DeepLayer' },
            { quote: "We reduced our OpenAI bill by 38% in the first week by letting ModelRouter move traffic to Haiku. The ROI is immediate.", name: 'Marcus T.', role: 'ML Platform Lead, Veridian' },
            { quote: "The incident detection is scary good. It correlated a latency spike with a retrieval index rebuild we had forgotten about. Saved us hours of debugging.", name: 'Priya N.', role: 'AI Reliability Eng, Axon Labs' },
          ].map((t, i) => (
            <Reveal key={i} delay={i * 100}>
              <GlowCard style={{ height: '100%', boxSizing: 'border-box' }}>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 22px', fontStyle: 'italic' }}>"{t.quote}"</p>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{t.role}</div>
                </div>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section style={{ padding: '120px 80px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(59,130,246,0.08), transparent)', pointerEvents: 'none' }} />
        <Reveal>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontSize: 'clamp(36px,4vw,60px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 20px', color: '#fff' }}>
              Start monitoring in<br />5 minutes.
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.35)', margin: '0 auto 44px', maxWidth: 480, lineHeight: 1.6 }}>
              No infrastructure to set up. One SDK import. Instant visibility into every agent call.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Link to="/register" style={{
                fontSize: 15, fontWeight: 700, padding: '14px 32px', borderRadius: 12,
                background: '#fff', color: '#000', textDecoration: 'none',
                transition: 'opacity 0.15s, transform 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                onMouseUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}>
                Get started for free →
              </Link>
              <Link to="/login" style={{
                fontSize: 15, fontWeight: 600, padding: '14px 32px', borderRadius: 12,
                background: 'transparent', color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}>
                Sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{ padding: '40px 80px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.5" fill="#000"/>
              <circle cx="4" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
              <circle cx="12" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>Orion</span>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {['Privacy', 'Terms', 'Docs', 'Status'].map(l => (
            <a key={l} href="#" style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
              {l}
            </a>
          ))}
        </div>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>© 2026 Orion. All rights reserved.</span>
      </footer>

      <style>{`
        @keyframes floatTilt {
          0%,100% { transform: perspective(1400px) rotateX(8deg) rotateY(-4deg) translateY(0); }
          50% { transform: perspective(1400px) rotateX(6deg) rotateY(-2deg) translateY(-8px); }
        }
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.6; transform:scale(1.3); }
        }
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(20px); }
          to { opacity:1; transform:translateX(0); }
        }
        @media (max-width: 900px) {
          section[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          section[style*="grid-template-columns: repeat(3"] { grid-template-columns: 1fr !important; }
          section[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
          nav { padding: 0 24px !important; }
          section { padding-left: 24px !important; padding-right: 24px !important; }
        }
      `}</style>
    </div>
  )
}
