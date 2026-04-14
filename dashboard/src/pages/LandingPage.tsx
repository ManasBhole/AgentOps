import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Zap, Shield, BarChart3, GitBranch, Activity, Sparkles } from 'lucide-react'

/* ─── Scroll reveal ─────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = '', style }: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect() } }, { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{
      opacity: on ? 1 : 0,
      transform: on ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(0.23,1,0.32,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  )
}

/* ─── Counter ───────────────────────────────────────────────────── */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true
        const t0 = performance.now()
        const d = 1600
        const tick = (now: number) => {
          const p = Math.min((now - t0) / d, 1)
          setN(Math.floor((1 - Math.pow(1 - p, 3)) * to))
          if (p < 1) requestAnimationFrame(tick); else setN(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{n}{suffix}</span>
}

/* ─── Mouse-tracked 3D card tilt ────────────────────────────────── */
function Tilt3D({ children, className = '', strength = 8 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2
    el.style.transform = `perspective(800px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) scale(1.02)`
    el.style.transition = 'transform 0.08s linear'
  }, [strength])
  const onLeave = useCallback(() => {
    if (ref.current) {
      ref.current.style.transform = 'perspective(800px) rotateY(0) rotateX(0) scale(1)'
      ref.current.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)'
    }
  }, [])
  return <div ref={ref} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>
}

/* ─── Navbar ────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 40px',
      background: scrolled ? 'rgba(0,0,0,0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="3.5" r="1.5" fill="#000"/>
            <circle cx="4" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            <circle cx="12" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            <circle cx="6" cy="13.5" r="0.9" fill="#000" fillOpacity="0.4"/>
            <circle cx="10" cy="13.5" r="0.9" fill="#000" fillOpacity="0.4"/>
            <line x1="8" y1="5" x2="4" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
            <line x1="8" y1="5" x2="12" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: '-0.01em' }}>Orion</span>
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: 32 }}>
        {['Features', 'Docs', 'Pricing', 'Blog'].map(l => (
          <a key={l} href="#" style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
            {l}
          </a>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/login" style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
          Sign in
        </Link>
        <Link to="/register" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 600,
          padding: '8px 18px', borderRadius: 10,
          background: '#fff', color: '#000',
          textDecoration: 'none',
          transition: 'opacity 0.15s, transform 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'}
          onMouseUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'}
        >
          Get started <ArrowRight style={{ width: 14, height: 14 }} />
        </Link>
      </div>
    </nav>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────── */
function HeroDashboard() {
  const bars = [42,58,45,72,64,88,70,92,60,95,78,86,68,90,80,96,82,88,74,98,85,92,88,95]
  return (
    <div style={{
      width: '100%', maxWidth: 840,
      margin: '0 auto',
      borderRadius: 16,
      overflow: 'hidden',
      background: '#0a0a0f',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 60px 120px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)',
      transform: 'perspective(1200px) rotateX(10deg) rotateY(-3deg)',
      transformOrigin: 'center top',
      animation: 'floatTilt 6s ease-in-out infinite',
      willChange: 'transform',
    }}>
      {/* Chrome bar */}
      <div style={{ height: 36, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 14px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57','#ffbd2e','#28ca41'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>orion.ai · dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          <span style={{ fontSize: 10, color: '#22c55e' }}>Live</span>
        </div>
      </div>

      {/* Dashboard body */}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { l: 'Active Agents', v: '12', d: '+2', c: '#60a5fa' },
            { l: 'LLM Calls/hr', v: '4.2k', d: '+18%', c: '#34d399' },
            { l: 'Avg Latency', v: '38ms', d: '-12%', c: '#34d399' },
            { l: 'Error Rate', v: '0.3%', d: '-0.1', c: '#34d399' },
          ].map(s => (
            <div key={s.l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>{s.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>{s.v}</span>
                <span style={{ fontSize: 11, color: s.c }}>{s.d}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart + agents */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          {/* Bar chart */}
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>LLM Call Volume</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Last 24h</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: `${h}%`,
                  borderRadius: '2px 2px 0 0',
                  background: i >= 20
                    ? 'linear-gradient(to top, #60a5fa, #93c5fd)'
                    : 'rgba(96,165,250,0.2)',
                  boxShadow: i >= 20 ? '0 0 8px rgba(96,165,250,0.3)' : undefined,
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>
          </div>

          {/* Agent list */}
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 2 }}>Agents</span>
            {[
              { n: 'gpt-researcher', s: 'healthy', c: '#34d399' },
              { n: 'claude-classifier', s: 'active', c: '#60a5fa' },
              { n: 'gemini-analyzer', s: 'idle', c: '#6b7280' },
            ].map(a => (
              <div key={a.n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.c, boxShadow: `0 0 5px ${a.c}` }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>{a.n}</span>
                </div>
                <span style={{ fontSize: 10, color: a.c }}>{a.s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trace feed row */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Live Traces</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>View all →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { name: 'generate_report(quarterly_summary)', status: 'ok', ms: '212ms', ago: '2s ago' },
              { name: 'search_web(market trends 2025)', status: 'ok', ms: '88ms', ago: '5s ago' },
              { name: 'classify_intent(user_query_831)', status: 'error', ms: '1.2s', ago: '9s ago' },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.status === 'ok' ? '#34d399' : '#f87171', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{t.ms}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>{t.ago}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom fade to black */}
      <div style={{ height: 80, marginTop: -80, background: 'linear-gradient(to top, #000 0%, transparent 100%)', position: 'relative', zIndex: 2, pointerEvents: 'none' }} />
    </div>
  )
}

function Hero() {
  return (
    <section style={{ background: '#000', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 60px', overflow: 'hidden', position: 'relative' }}>
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black 0%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black 0%, transparent 100%)',
      }} />

      {/* Glow orb behind headline */}
      <div style={{
        position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 560, height: 280,
        background: 'radial-gradient(ellipse, rgba(96,165,250,0.12) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 760, marginBottom: 56 }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 14px', borderRadius: 100, marginBottom: 28,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          fontSize: 12, color: 'rgba(255,255,255,0.6)',
          animation: 'heroBadge 0.6s ease both',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s ease-in-out infinite' }} />
          Now in public beta
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(44px, 7vw, 80px)',
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          color: '#fff',
          margin: '0 0 20px',
          animation: 'heroFade 0.8s ease 0.1s both',
        }}>
          Observe every agent.{' '}
          <br />
          <span style={{
            background: 'linear-gradient(90deg, rgba(255,255,255,0.7) 0%, #fff 50%, rgba(255,255,255,0.7) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Ship with confidence.
          </span>
        </h1>

        <p style={{
          fontSize: 18,
          lineHeight: 1.65,
          color: 'rgba(255,255,255,0.4)',
          maxWidth: 520,
          margin: '0 auto 36px',
          animation: 'heroFade 0.8s ease 0.2s both',
        }}>
          Real-time traces, anomaly detection, cost analytics, and time-travel
          debugging — everything your AI team needs in one place.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'heroFade 0.8s ease 0.3s both' }}>
          <Link to="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 28px', borderRadius: 12,
            background: '#fff', color: '#000',
            fontSize: 14, fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)',
            transition: 'opacity 0.15s, transform 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
            onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
            onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          >
            Start free — no card <ArrowRight style={{ width: 15, height: 15 }} />
          </Link>
          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '12px 22px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            fontSize: 14, color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
          >
            View dashboard →
          </Link>
        </div>
      </div>

      {/* 3D hero dashboard */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', animation: 'heroFade 0.8s ease 0.4s both' }}>
        <HeroDashboard />
      </div>

      {/* Trust strip */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 32, marginTop: 48, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: Shield, label: 'SOC 2 Type II' },
          { icon: Zap, label: '99.9% uptime SLA' },
          { icon: Activity, label: '<50ms trace latency' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            <Icon style={{ width: 13, height: 13 }} />
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─── Logos strip ───────────────────────────────────────────────── */
function Logos() {
  const items = ['OpenAI','Anthropic','Gemini','LangChain','Pinecone','Mistral','Cohere','CrewAI']
  return (
    <section style={{ background: '#000', padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 24 }}>
        Works with every model and framework
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 36px' }}>
        {items.map(i => (
          <span key={i} style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.22)', transition: 'color 0.2s', cursor: 'default' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}>
            {i}
          </span>
        ))}
      </div>
    </section>
  )
}

/* ─── Features ──────────────────────────────────────────────────── */
const FEATS = [
  { icon: Activity, title: 'Real-time Traces', desc: 'Stream every LLM call, tool invocation, and agent decision as it happens. Full span context — latency, tokens, cost — per call.', big: true },
  { icon: Shield, title: 'Anomaly Detection', desc: 'Behavioral fingerprints catch regressions before they become incidents.', big: false },
  { icon: BarChart3, title: 'Cost Analytics', desc: 'Per-agent cost burn, projected daily spend, budget threshold alerts.', big: false },
  { icon: GitBranch, title: 'Time-Travel Debug', desc: 'Replay any execution, branch at any decision, compare outcomes.', big: false },
  { icon: Zap, title: 'Alert Rules', desc: 'Set thresholds on error rate, latency, cost. Deliver to Slack or webhooks instantly.', big: false },
  { icon: Sparkles, title: 'NL Query', desc: 'Ask "which agents had error spikes yesterday?" Get instant SQL-backed answers.', big: true },
]

function Features() {
  return (
    <section style={{ background: '#000', padding: '100px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal className="text-center" style={{ textAlign: 'center', marginBottom: 60 } as any}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>Platform</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 14px' }}>
            Everything AI ops demands
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.35)', maxWidth: 480, margin: '0 auto' }}>
            One platform for observability, resilience, and continuous improvement.
          </p>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {FEATS.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className={f.big ? 'feat-big' : ''}>
              <Tilt3D>
                <div style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16, padding: '28px 24px',
                  height: '100%', boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  cursor: 'default',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(0,0,0,0.6)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <f.icon style={{ width: 18, height: 18, color: '#fff' }} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.35)', margin: 0 }}>{f.desc}</p>
                </div>
              </Tilt3D>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Stats ─────────────────────────────────────────────────────── */
function Stats() {
  return (
    <section style={{ background: '#0a0a0f', padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        {[
          { to: 999, suffix: 'M+', label: 'Traces processed' },
          { to: 50,  suffix: 'ms', label: 'Median latency', prefix: '<' },
          { to: 99,  suffix: '.9%', label: 'Uptime SLA' },
          { to: 40,  suffix: '+', label: 'Integrations' },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 80}>
            <div style={{ background: '#0a0a0f', padding: '40px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', marginBottom: 8 }}>
                {s.prefix}<Counter to={s.to} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{s.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ─── Testimonials ──────────────────────────────────────────────── */
const TESTIMONIALS = [
  { q: 'Orion cut our mean-time-to-debug from 40 minutes to under 3. The time-travel debugger paid for itself in week one.', name: 'Sarah Chen', role: 'Head of AI · Vercel', init: 'SC' },
  { q: 'We were flying blind with 12 agents in prod. Now I see every token, every tool call, every anomaly the moment it happens.', name: 'Marcus Rivera', role: 'CTO · Loom AI', init: 'MR' },
  { q: "The NLQ feature is wild — I just ask 'which agents are burning money?' and get a ranked list instantly.", name: 'Priya Patel', role: 'Staff Engineer · Scale AI', init: 'PP' },
]

function Testimonials() {
  return (
    <section style={{ background: '#000', padding: '100px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 56 } as any}>
          <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>
            Loved by AI engineering teams
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
            Teams shipping production agents trust Orion to keep them in control.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100}>
              <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '28px 24px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 16, display: 'flex', gap: 2 }}>
                  {[0,1,2,3,4].map(j => <span key={j} style={{ fontSize: 14, color: '#fff' }}>★</span>)}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', flex: 1 }}>"{t.q}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {t.init}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{t.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA ───────────────────────────────────────────────────────── */
function CTA() {
  const perks = ['1M traces/mo free', 'Real-time alerts', 'NL query engine', 'Time-travel debugger', 'SOC 2 compliant', 'No credit card']
  return (
    <section style={{ background: '#000', padding: '100px 24px 120px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <Reveal>
          <div style={{
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24, padding: '64px 48px',
            background: 'rgba(255,255,255,0.025)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Glow */}
            <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, background: 'radial-gradient(ellipse, rgba(96,165,250,0.15) 0%, transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Free to start</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 14px', lineHeight: 1.1 }}>
                Start monitoring in<br />60 seconds
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', margin: '0 auto 32px', maxWidth: 400 }}>
                Full-featured free tier. No credit card. Deploy your first agent trace in minutes.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px', maxWidth: 440, margin: '0 auto 36px', textAlign: 'left' }}>
                {perks.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                    <Check style={{ width: 13, height: 13, color: '#22c55e', flexShrink: 0 }} />{p}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <Link to="/register" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '13px 32px', borderRadius: 12,
                  background: '#fff', color: '#000',
                  fontSize: 15, fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'opacity 0.15s, transform 0.15s',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
                  onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                >
                  Create free account <ArrowRight style={{ width: 16, height: 16 }} />
                </Link>
                <Link to="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                  Already have an account? Sign in →
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─── Footer ────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#000', padding: '36px 40px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.5" fill="#000"/>
              <circle cx="4" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
              <circle cx="12" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Orion</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>© 2025 Orion AI Inc.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          <span style={{ marginLeft: 4 }}>All systems operational</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy','Terms','Status','Docs'].map(l => (
            <a key={l} href="#" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}>
              {l}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

/* ─── Page ──────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ background: '#000', minHeight: '100vh', overflowX: 'hidden' }}>
      <Navbar />
      <Hero />
      <Logos />
      <Features />
      <Stats />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  )
}
