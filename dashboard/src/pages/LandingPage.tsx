import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Activity, Zap, Shield, GitBranch, BarChart3, Terminal,
  ChevronRight, Check, Sparkles, Clock, TrendingUp } from 'lucide-react'

/* ─── 3D card tilt hook ─────────────────────────────────────────── */
function useTilt(maxDeg = 10) {
  const ref = useRef<HTMLDivElement>(null)
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2
    el.style.transform = `perspective(900px) rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg) scale3d(1.02,1.02,1.02)`
    el.style.transition = 'transform 0.08s linear'
  }, [maxDeg])
  const onMouseLeave = useCallback(() => {
    if (ref.current) {
      ref.current.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) scale3d(1,1,1)'
      ref.current.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)'
    }
  }, [])
  return { ref, onMouseMove, onMouseLeave }
}

/* ─── Animated counter ──────────────────────────────────────────── */
function Counter({ to, suffix = '', prefix = '', duration = 2000 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1)
          const ease = 1 - Math.pow(1 - p, 4)
          setCount(Math.floor(ease * to))
          if (p < 1) requestAnimationFrame(tick); else setCount(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [to, duration])
  return <span ref={ref}>{prefix}{count}{suffix}</span>
}

/* ─── Scroll fade-in ────────────────────────────────────────────── */
function Reveal({ children, delay = 0, from = 'bottom', className = '', style = {} }:
  { children: React.ReactNode; delay?: number; from?: 'bottom' | 'left' | 'right'; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.05 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const initial = from === 'left' ? 'translateX(-32px)' : from === 'right' ? 'translateX(32px)' : 'translateY(32px)'
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate(0,0)' : initial,
      transition: `opacity 0.75s ease ${delay}ms, transform 0.75s cubic-bezier(0.23,1,0.32,1) ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

/* ─── Navbar ────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav className="fixed top-0 inset-x-0 z-50 transition-all duration-500"
      style={{
        background: scrolled ? 'rgba(3,3,8,0.8)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.5)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.5" fill="white"/>
              <circle cx="4" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
              <circle cx="12" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
              <circle cx="6" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
              <circle cx="10" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
              <line x1="8" y1="5" x2="4" y2="8.3" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
              <line x1="8" y1="5" x2="12" y2="8.3" stroke="white" strokeOpacity="0.4" strokeWidth="0.8"/>
            </svg>
          </div>
          <span className="font-bold text-sm tracking-wide text-white">Orion</span>
          <span className="hidden sm:inline text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
            BETA
          </span>
        </div>

        <div className="hidden md:flex items-center gap-7">
          {['Features', 'Docs', 'Pricing', 'Blog'].map(l => (
            <a key={l} href="#" className="text-sm transition-all duration-200 hover:text-white"
              style={{ color: 'rgba(148,163,184,0.7)' }}>{l}</a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium transition-colors hover:text-white"
            style={{ color: 'rgba(148,163,184,0.6)' }}>
            Sign in
          </Link>
          <Link to="/register"
            className="relative flex items-center gap-1.5 text-sm font-semibold text-white px-5 py-2 rounded-xl overflow-hidden transition-all duration-300 hover:scale-105"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 24px rgba(99,102,241,0.4)' }}>
            <span>Get started</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ─── Aurora background ─────────────────────────────────────────── */
function Aurora() {
  return (
    <div className="aurora-root" aria-hidden>
      <div className="aurora-blob aurora-1" />
      <div className="aurora-blob aurora-2" />
      <div className="aurora-blob aurora-3" />
      <div className="aurora-blob aurora-4" />
      <div className="aurora-blob aurora-5" />
      <div className="aurora-grid" />
      <div className="aurora-vignette" />
    </div>
  )
}

/* ─── Mini dashboard preview ────────────────────────────────────── */
function DashPreview() {
  const { ref, onMouseMove, onMouseLeave } = useTilt(6)
  const bars = [45, 65, 50, 80, 70, 95, 75, 88, 60, 92, 78, 85, 72, 90, 68, 95, 80, 88, 75, 98, 82, 90, 85, 92]
  return (
    <div ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
      className="dash-preview-shell" style={{ cursor: 'default' }}>
      {/* Window chrome */}
      <div className="dash-chrome">
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57','#ffbd2e','#28ca41'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          orion.ai · dashboard
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
          <span style={{ fontSize: 10, color: '#34d399' }}>Live</span>
        </div>
      </div>

      {/* Body */}
      <div className="dash-body">
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'Active Agents', v: '12', c: '#818cf8', delta: '+2' },
            { l: 'Calls / hr', v: '4.2k', c: '#34d399', delta: '+12%' },
            { l: 'Error rate', v: '0.3%', c: '#fb923c', delta: '-0.1%' },
          ].map(s => (
            <div key={s.l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{s.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: 10, color: s.c, opacity: 0.7 }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>LLM call volume · 24 h</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: '2px 2px 0 0',
                height: `${h}%`,
                background: i >= bars.length - 4 ? 'linear-gradient(to top,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.25)',
                boxShadow: i >= bars.length - 4 ? '0 0 8px rgba(99,102,241,0.4)' : undefined,
              }} />
            ))}
          </div>
        </div>

        {/* Agent list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { n: 'gpt-researcher', s: 'healthy', c: '#34d399', l: '22ms' },
            { n: 'claude-classifier', s: 'active', c: '#818cf8', l: '45ms' },
            { n: 'gemini-analyzer', s: 'idle', c: '#94a3b8', l: '--' },
          ].map(a => (
            <div key={a.n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.c, boxShadow: `0 0 6px ${a.c}` }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)' }}>{a.n}</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 10, color: a.c }}>{a.s}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{a.l}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Glow reflection */}
      <div className="dash-glow" />
    </div>
  )
}

/* ─── Hero ──────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero-section">
      <Aurora />
      <div className="hero-content">
        {/* Badge */}
        <div className="hero-badge-wrap">
          <div className="hero-badge">
            <span className="badge-dot" />
            AI observability, reimagined
            <ChevronRight style={{ width: 13, height: 13, opacity: 0.6 }} />
          </div>
        </div>

        {/* Headline */}
        <h1 className="hero-h1">
          The command center<br />
          <span className="hero-gradient">for your AI fleet</span>
        </h1>

        <p className="hero-sub">
          Real-time traces. Anomaly detection. Cost analytics. Time-travel debugging.<br />
          Everything your team needs to ship AI with confidence.
        </p>

        {/* CTAs */}
        <div className="hero-ctas">
          <Link to="/register" className="cta-primary">
            Start for free — no card needed
            <ArrowRight style={{ width: 16, height: 16 }} />
          </Link>
          <Link to="/login" className="cta-ghost">
            View dashboard →
          </Link>
        </div>

        {/* Dashboard preview */}
        <DashPreview />

        {/* Trust strip */}
        <div className="hero-trust">
          <div className="trust-item">
            <Shield style={{ width: 13, height: 13, color: '#34d399' }} />
            SOC 2 Type II
          </div>
          <div className="trust-sep" />
          <div className="trust-item">
            <Activity style={{ width: 13, height: 13, color: '#818cf8' }} />
            99.9% uptime SLA
          </div>
          <div className="trust-sep" />
          <div className="trust-item">
            <Clock style={{ width: 13, height: 13, color: '#fb923c' }} />
            &lt;50 ms trace latency
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Features ──────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Activity, color: '#818cf8', glow: 'rgba(129,140,248,0.15)',
    tag: 'Live', title: 'Real-time Traces',
    desc: 'Stream every LLM call, tool use, and agent decision as it happens. Full span context with token counts, latency, and cost — per call.',
    big: true,
    preview: (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, marginTop: 12 }}>
        {[40,55,45,70,60,85,72,90,65,95,80,88,75,92,85,98,90,82,95,88].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '2px 2px 0 0',
            background: i >= 16 ? 'linear-gradient(to top,#818cf8,#a5b4fc)' : 'rgba(129,140,248,0.2)',
            boxShadow: i >= 16 ? '0 0 6px rgba(129,140,248,0.3)' : undefined }} />
        ))}
      </div>
    ),
  },
  {
    icon: Shield, color: '#34d399', glow: 'rgba(52,211,153,0.12)',
    tag: null, title: 'Anomaly Detection',
    desc: 'Behavioral fingerprints catch regression patterns before they become incidents. 3am pages become yesterday\'s problem.',
    big: false, preview: null,
  },
  {
    icon: BarChart3, color: '#fb923c', glow: 'rgba(251,146,60,0.12)',
    tag: null, title: 'Cost Analytics',
    desc: 'Per-agent cost burn, projected daily spend, and budget alerts. Know exactly where every dollar goes.',
    big: false, preview: null,
  },
  {
    icon: GitBranch, color: '#c084fc', glow: 'rgba(192,132,252,0.12)',
    tag: 'New', title: 'Time-Travel Debugger',
    desc: 'Replay any execution, branch at any decision point, and compare counterfactual outcomes side-by-side.',
    big: false, preview: null,
  },
  {
    icon: Zap, color: '#38bdf8', glow: 'rgba(56,189,248,0.12)',
    tag: null, title: 'Alert Rules',
    desc: 'Set thresholds on error rate, p99 latency, cost/hour. Deliver to Slack, PagerDuty, or any webhook.',
    big: false, preview: null,
  },
  {
    icon: Sparkles, color: '#f472b6', glow: 'rgba(244,114,182,0.12)',
    tag: 'AI', title: 'Natural Language Query',
    desc: 'Ask "which agents had error spikes yesterday?" and get instant SQL-backed answers in plain English.',
    big: true, preview: (
      <div style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 11 }}>
        {['> which agents cost >$0.50 last hour?', '  → gemini-analyzer: $0.83', '  → gpt-researcher: $0.61'].map((l, i) => (
          <div key={i} style={{ color: i === 0 ? '#f472b6' : 'rgba(255,255,255,0.4)', padding: '1px 0' }}>{l}</div>
        ))}
      </div>
    ),
  },
  {
    icon: Terminal, color: '#4ade80', glow: 'rgba(74,222,128,0.12)',
    tag: null, title: 'Chaos Engineering',
    desc: 'Inject failures, simulate network partitions, and validate your agents\' resilience before production.',
    big: false, preview: null,
  },
  {
    icon: TrendingUp, color: '#fbbf24', glow: 'rgba(251,191,36,0.12)',
    tag: null, title: 'Evals & A/B Testing',
    desc: 'Compare prompt variants, model versions, and agent configs with statistical significance tracking.',
    big: false, preview: null,
  },
]

function FeatureCard({ f, delay }: { f: typeof FEATURES[0]; delay: number }) {
  const { ref, onMouseMove, onMouseLeave } = useTilt(6)
  return (
    <Reveal delay={delay} className={f.big ? 'feat-col-span-2' : ''}>
      <div ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} className="feat-card">
        {/* Hover glow */}
        <div className="feat-glow" style={{ background: `radial-gradient(ellipse at top left, ${f.glow} 0%, transparent 65%)` }} />
        {/* Inner border glow on hover */}
        <div className="feat-border-glow" style={{ boxShadow: `inset 0 0 0 1px ${f.color}22` }} />

        <div className="feat-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="feat-icon" style={{ background: f.glow, border: `1px solid ${f.color}30` }}>
              <f.icon style={{ width: 18, height: 18, color: f.color }} />
            </div>
            {f.tag && (
              <span className="feat-tag" style={{ background: f.glow, color: f.color, border: `1px solid ${f.color}30` }}>
                {f.tag}
              </span>
            )}
          </div>
          <h3 className="feat-title">{f.title}</h3>
          <p className="feat-desc">{f.desc}</p>
          {f.preview}
        </div>
      </div>
    </Reveal>
  )
}

function Features() {
  return (
    <section className="features-section">
      <div className="section-inner">
        <Reveal className="text-center" style={{ marginBottom: 64 }}>
          <p className="section-label">Platform</p>
          <h2 className="section-h2">Everything AI ops demands</h2>
          <p className="section-sub">One platform for observability, resilience, and continuous improvement of your agent fleet.</p>
        </Reveal>

        <div className="feat-grid">
          {FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} delay={i * 60} />)}
        </div>
      </div>
    </section>
  )
}

/* ─── Stats ─────────────────────────────────────────────────────── */
function Stats() {
  const items = [
    { prefix: '', to: 999, suffix: 'M+', label: 'Traces processed', sub: 'and counting' },
    { prefix: '<', to: 50, suffix: 'ms', label: 'Median trace latency', sub: 'p50 globally' },
    { prefix: '', to: 99, suffix: '.9%', label: 'Platform uptime', sub: '30-day rolling' },
    { prefix: '', to: 40, suffix: '+', label: 'Integrations', sub: 'models & frameworks' },
  ]
  return (
    <section className="stats-section">
      <div className="section-inner">
        <div className="stats-grid">
          {items.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="stat-card">
                <div className="stat-value">
                  <Counter to={s.to} suffix={s.suffix} prefix={s.prefix} />
                </div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Integrations ──────────────────────────────────────────────── */
const INTEGRATIONS = [
  { name: 'OpenAI', sym: 'Ø' }, { name: 'Anthropic', sym: '◈' },
  { name: 'Gemini', sym: '◇' }, { name: 'LangChain', sym: '⬡' },
  { name: 'Pinecone', sym: '△' }, { name: 'Weaviate', sym: '⬢' },
  { name: 'Cohere', sym: '◉' }, { name: 'Mistral', sym: '⊛' },
  { name: 'LlamaIndex', sym: '◬' }, { name: 'CrewAI', sym: '⊕' },
]

function Integrations() {
  return (
    <section style={{ padding: '48px 0', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="section-inner">
        <p className="section-label" style={{ textAlign: 'center', marginBottom: 24 }}>Works with every stack</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 24px' }}>
          {INTEGRATIONS.map(i => (
            <div key={i.name} className="integ-chip">
              <span style={{ fontSize: 15 }}>{i.sym}</span>
              <span>{i.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Testimonials ──────────────────────────────────────────────── */
const TESTIMONIALS = [
  { quote: 'Orion cut our mean-time-to-debug from 40 minutes to under 3. The time-travel debugger alone paid for itself in week one.', author: 'Sarah Chen', role: 'Head of AI · Vercel', avatar: 'SC', color: '#818cf8' },
  { quote: 'We were flying blind with 12 agents in prod. Now I see every token, every tool call, and every anomaly the moment it happens.', author: 'Marcus Rivera', role: 'CTO · Loom AI', avatar: 'MR', color: '#34d399' },
  { quote: "The NLQ feature is wild — I just ask 'which agents are burning money?' and get a ranked list instantly.", author: 'Priya Patel', role: 'Staff Engineer · Scale AI', avatar: 'PP', color: '#fb923c' },
]

function Testimonials() {
  return (
    <section className="features-section">
      <div className="section-inner">
        <Reveal className="text-center" style={{ marginBottom: 56 }}>
          <h2 className="section-h2">Loved by AI engineering teams</h2>
          <p className="section-sub">Teams shipping production agents trust Orion to keep them in control.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.author} delay={i * 120}>
              <div className="testimonial-card">
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {Array(5).fill(0).map((_, j) => <span key={j} style={{ color: '#fbbf24', fontSize: 14 }}>★</span>)}
                </div>
                <p className="testimonial-quote">"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white', background: `linear-gradient(135deg,${t.color},${t.color}80)`, flexShrink: 0 }}>
                    {t.avatar}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{t.author}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{t.role}</div>
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
  const perks = ['Unlimited traces (1M/mo free)', 'Real-time alerts', 'NLQ query engine', 'Time-travel debugger', 'SOC 2 compliant', 'No credit card required']
  return (
    <section className="cta-section">
      <div className="section-inner">
        <Reveal>
          <div className="cta-card">
            <div className="cta-orb" />
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <span className="cta-badge">Free to start · forever</span>
              <h2 className="cta-h2">Ship AI with confidence,<br /><span className="hero-gradient">starting today</span></h2>
              <p className="section-sub" style={{ marginBottom: 32 }}>Deploy in 60 seconds. Full-featured free tier, no card needed.</p>
              <div className="cta-perks">
                {perks.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <Check style={{ width: 14, height: 14, color: '#34d399', flexShrink: 0 }} />{p}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <Link to="/register" className="cta-primary" style={{ fontSize: 15, padding: '14px 36px' }}>
                  Create free account <ArrowRight style={{ width: 17, height: 17 }} />
                </Link>
                <Link to="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
                  className="hover:text-white transition-colors">
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
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '40px 0' }}>
      <div className="section-inner" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.5" r="1.5" fill="white"/>
              <circle cx="4" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
              <circle cx="12" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Orion</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>© 2025 Orion AI Inc.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 6px #34d399' }} />
          <span style={{ marginLeft: 4 }}>All systems operational</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Privacy', 'Terms', 'Status', 'Docs', 'GitHub'].map(l => (
            <a key={l} href="#" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
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
    <div style={{ background: '#030308', minHeight: '100vh', overflowX: 'hidden' }}>
      <Navbar />
      <Hero />
      <Integrations />
      <Features />
      <Stats />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  )
}
