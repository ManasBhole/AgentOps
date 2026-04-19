import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Copy, Check, Menu, X } from 'lucide-react'

/* ── Code block with copy ─────────────────────────────────────────── */
function Code({ children, lang = 'bash' }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', margin: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#1a1a1a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{lang}</span>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#22c55e' : 'rgba(255,255,255,0.35)', fontSize: 12, padding: '2px 6px', borderRadius: 6, transition: 'color 0.2s' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '18px 20px', background: '#111', overflowX: 'auto', fontSize: 13, lineHeight: 1.7, fontFamily: "'JetBrains Mono','Fira Code',monospace", color: '#e2e8f0' }}>
        <code>{children}</code>
      </pre>
    </div>
  )
}

/* ── Section heading ──────────────────────────────────────────────── */
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: '56px 0 16px', paddingTop: 8, scrollMarginTop: 80 }}>
      {children}
    </h2>
  )
}
function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: '36px 0 12px', scrollMarginTop: 80 }}>
      {children}
    </h3>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, margin: '0 0 16px' }}>{children}</p>
}

/* ── Inline badge ─────────────────────────────────────────────────── */
function Badge({ method }: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' }) {
  const colors: Record<string, string> = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#a78bfa' }
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: colors[method] + '22', color: colors[method], fontFamily: 'monospace', letterSpacing: '0.05em', marginRight: 8 }}>
      {method}
    </span>
  )
}

/* ── API endpoint row ─────────────────────────────────────────────── */
function Endpoint({ method, path, desc }: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; path: string; desc: string }) {
  return (
    <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: '#0d0d0d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Badge method={method} />
      <code style={{ fontSize: 13, color: '#93c5fd', fontFamily: 'monospace', flex: 1 }}>{path}</code>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{desc}</span>
    </div>
  )
}

/* ── Nav items ────────────────────────────────────────────────────── */
const NAV = [
  { id: 'quickstart',     label: 'Quick Start' },
  { id: 'install',        label: 'Installation' },
  { id: 'concepts',       label: 'Concepts' },
  { id: 'sdk-python',     label: 'Python SDK' },
  { id: 'sdk-node',       label: 'Node.js SDK' },
  { id: 'api-reference',  label: 'API Reference' },
  { id: 'api-agents',     label: '↳ Agents' },
  { id: 'api-traces',     label: '↳ Traces' },
  { id: 'api-slo',        label: '↳ SLOs' },
  { id: 'api-alerts',     label: '↳ Alerts' },
  { id: 'api-auth',       label: '↳ Auth' },
  { id: 'webhooks',       label: 'Webhooks' },
  { id: 'self-host',      label: 'Self-hosting' },
]

/* ── Active section tracker ───────────────────────────────────────── */
function useSectionObserver() {
  const [active, setActive] = useState('quickstart')
  useEffect(() => {
    const els = NAV.map(n => document.getElementById(n.id)).filter(Boolean) as HTMLElement[]
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id) })
    }, { rootMargin: '-20% 0px -70% 0px' })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return active
}

export default function Docs() {
  const active = useSectionObserver()
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 768); if (window.innerWidth >= 768) setNavOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (isMobile) setNavOpen(false)
  }

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif" }}>

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {isMobile && (
            <button onClick={() => setNavOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', borderRadius: 6 }}>
              {navOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="3.5" r="1.5" fill="#000"/>
                <circle cx="4" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
                <circle cx="12" cy="9.5" r="1.2" fill="#000" fillOpacity="0.7"/>
                <line x1="8" y1="5" x2="4" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
                <line x1="8" y1="5" x2="12" y2="8.3" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8"/>
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Orion</span>
          </Link>
          {!isMobile && <><span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>/</span><span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Docs</span></>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>Log in</Link>
          {!isMobile && <Link to="/register" style={{ fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 8, background: '#fff', color: '#000', textDecoration: 'none' }}>Get started</Link>}
        </div>
      </header>

      {/* ── Mobile nav drawer ──────────────────────────────────────── */}
      {isMobile && navOpen && (
        <>
          <div onClick={() => setNavOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: 60, left: 0, bottom: 0, width: 240, zIndex: 99, background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', padding: '16px 0' }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => scrollTo(n.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 24px', border: 'none', cursor: 'pointer',
                background: active === n.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                color: active === n.id ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 14, fontWeight: active === n.id ? 600 : 400,
                borderLeft: active === n.id ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                {n.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', paddingTop: 60 }}>

        {/* ── Sidebar — desktop only ────────────────────────────────── */}
        {!isMobile && (
          <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: 60, height: 'calc(100vh - 60px)', overflowY: 'auto', padding: '32px 0', borderRight: '1px solid rgba(255,255,255,0.06)', scrollbarWidth: 'none' }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => scrollTo(n.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 24px', border: 'none', cursor: 'pointer',
                background: active === n.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                color: active === n.id ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: active === n.id ? 600 : 400,
                borderRight: active === n.id ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                {n.label}
              </button>
            ))}
          </aside>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main style={{ flex: 1, maxWidth: 760, padding: isMobile ? '32px 20px 80px' : '48px 64px 120px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

          {/* Quick Start */}
          <H2 id="quickstart">Quick Start</H2>
          <P>Orion gives you full observability over your AI agents — traces, costs, SLOs, alerts, and anomaly detection — in under 5 minutes.</P>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, margin: '24px 0' }}>
            {[
              { n: '1', title: 'Install SDK', sub: 'One package, any framework' },
              { n: '2', title: 'Wrap your agent', sub: 'Two lines of code' },
              { n: '3', title: 'Open dashboard', sub: 'Instant live traces' },
            ].map(s => (
              <div key={s.n} style={{ padding: '18px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: '#0d0d0d' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', marginBottom: 8 }}>STEP {s.n}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Install */}
          <H2 id="install">Installation</H2>
          <H3 id="install-python">Python</H3>
          <Code lang="bash">pip install orion-sdk</Code>
          <H3 id="install-node">Node.js / TypeScript</H3>
          <Code lang="bash">npm install @orion-ai/sdk</Code>

          {/* Concepts */}
          <H2 id="concepts">Concepts</H2>
          <P>Orion is built around four primitives:</P>
          <div style={{ display: 'grid', gap: 10, margin: '16px 0 28px' }}>
            {[
              { t: 'Agent', d: 'A named, versioned AI process you want to monitor. Agents emit traces.' },
              { t: 'Trace', d: 'A single end-to-end execution of an agent — including every LLM call, tool use, and retrieval step.' },
              { t: 'SLO', d: 'A service-level objective. Define an availability or latency target; Orion tracks error budget burn.' },
              { t: 'Alert Rule', d: 'A threshold on any metric (error rate, cost/hr, latency). Fires to Slack or your webhook.' },
            ].map(c => (
              <div key={c.t} style={{ display: 'flex', gap: 16, padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
                <code style={{ fontSize: 13, color: '#60a5fa', fontFamily: 'monospace', whiteSpace: 'nowrap', paddingTop: 1 }}>{c.t}</code>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{c.d}</span>
              </div>
            ))}
          </div>

          {/* Python SDK */}
          <H2 id="sdk-python">Python SDK</H2>
          <H3 id="sdk-python-init">Initialize</H3>
          <Code lang="python">{`import orion

orion.init(
    api_key="ok_live_••••••••",   # from Settings → API Keys
    agent_name="my-agent",
    version="1.0.0",
)`}</Code>

          <H3 id="sdk-python-trace">Wrap a trace</H3>
          <Code lang="python">{`from orion import trace

@trace                          # decorator — zero config
def run(user_input: str) -> str:
    response = llm.chat(user_input)
    return response

# Or as a context manager:
with orion.span("retrieval"):
    docs = vector_db.query(query)`}</Code>

          <H3 id="sdk-python-llm">Auto-instrument LLM calls</H3>
          <Code lang="python">{`import orion
from openai import OpenAI

orion.instrument_openai()       # patches openai globally
client = OpenAI()
# All calls are now captured automatically`}</Code>

          {/* Node SDK */}
          <H2 id="sdk-node">Node.js SDK</H2>
          <Code lang="typescript">{`import { Orion } from '@orion-ai/sdk'

const orion = new Orion({
  apiKey: process.env.ORION_API_KEY,
  agentName: 'my-agent',
  version: '1.0.0',
})

// Wrap any async function
const result = await orion.trace('llm.call', async () => {
  return await openai.chat.completions.create({ ... })
})`}</Code>

          {/* API Reference */}
          <H2 id="api-reference">API Reference</H2>
          <P>Base URL: <code style={{ fontSize: 13, color: '#93c5fd', background: 'rgba(59,130,246,0.08)', padding: '2px 8px', borderRadius: 5 }}>https://api.orion.ai/api/v1</code></P>
          <P>All requests require an <code style={{ fontSize: 13, color: '#93c5fd', background: 'rgba(59,130,246,0.08)', padding: '2px 8px', borderRadius: 5 }}>Authorization: Bearer &lt;token&gt;</code> header.</P>

          <H3 id="api-agents">Agents</H3>
          <Endpoint method="GET"    path="/agents"            desc="List all agents" />
          <Endpoint method="POST"   path="/agents"            desc="Register a new agent" />
          <Endpoint method="GET"    path="/agents/:id"        desc="Get agent details" />
          <Endpoint method="PUT"    path="/agents/:id"        desc="Update agent metadata" />
          <Endpoint method="DELETE" path="/agents/:id"        desc="Delete agent" />
          <Endpoint method="GET"    path="/agents/:id/health" desc="Current health score" />

          <H3 id="api-traces">Traces</H3>
          <Endpoint method="GET"  path="/traces"             desc="List traces (paginated)" />
          <Endpoint method="POST" path="/traces"             desc="Ingest a trace" />
          <Endpoint method="GET"  path="/traces/:id"         desc="Get full trace tree" />
          <Endpoint method="GET"  path="/agents/:id/traces"  desc="Traces for one agent" />

          <H3 id="api-slo">SLOs</H3>
          <Endpoint method="GET"    path="/slo"            desc="List SLO definitions" />
          <Endpoint method="POST"   path="/slo"            desc="Create SLO" />
          <Endpoint method="GET"    path="/slo/:id"        desc="Get SLO + current budget" />
          <Endpoint method="PUT"    path="/slo/:id"        desc="Update SLO target" />
          <Endpoint method="DELETE" path="/slo/:id"        desc="Delete SLO" />

          <H3 id="api-alerts">Alerts</H3>
          <Endpoint method="GET"    path="/alert-rules"            desc="List alert rules" />
          <Endpoint method="POST"   path="/alert-rules"            desc="Create rule" />
          <Endpoint method="PUT"    path="/alert-rules/:id"        desc="Update rule" />
          <Endpoint method="DELETE" path="/alert-rules/:id"        desc="Delete rule" />
          <Endpoint method="GET"    path="/alert-rules/:id/firings" desc="Recent firings" />

          <H3 id="api-auth">Auth</H3>
          <Endpoint method="POST" path="/auth/login"           desc="Email + password login" />
          <Endpoint method="POST" path="/auth/register"        desc="Create account" />
          <Endpoint method="GET"  path="/auth/oauth/providers" desc="List configured OAuth providers" />
          <Endpoint method="GET"  path="/auth/me"             desc="Current user info" />

          <Code lang="json">{`// POST /auth/login
{
  "email": "you@company.com",
  "password": "••••••••"
}

// Response
{
  "token": "eyJhbGci...",
  "user": { "id": "u_...", "email": "you@company.com", "name": "..." }
}`}</Code>

          {/* Webhooks */}
          <H2 id="webhooks">Webhooks</H2>
          <P>Orion sends a signed <code style={{ fontSize: 13, color: '#93c5fd' }}>POST</code> to your endpoint for each event. Add your URL in <strong style={{ color: '#fff' }}>Settings → Integrations</strong>.</P>

          <Code lang="json">{`// alert.rule_fired
{
  "event": "alert.rule_fired",
  "rule_id": "ar_...",
  "rule_name": "High error rate",
  "agent_id": "ag_...",
  "metric": "error_rate",
  "current_value": 12.4,
  "threshold": 5.0,
  "operator": "gt",
  "fired_at": "2026-04-18T10:23:00Z"
}

// agent.incident_created
{
  "event": "agent.incident_created",
  "incident_id": "inc_...",
  "agent_id": "ag_...",
  "severity": "high",
  "title": "Latency spike detected"
}`}</Code>

          <P>Verify the request is from Orion by checking the <code style={{ fontSize: 13, color: '#93c5fd' }}>X-Orion-Signature</code> header (HMAC-SHA256 of the raw body with your webhook secret).</P>

          {/* Self-hosting */}
          <H2 id="self-host">Self-hosting</H2>
          <P>Orion is fully open-source. Run it on your own infrastructure with Docker Compose.</P>
          <Code lang="bash">{`git clone https://github.com/ManasBhole/AgentOps
cd AgentOps
cp .env.example .env
# Fill in POSTGRES_URL, JWT_SECRET, etc.
docker compose up -d`}</Code>
          <P>The stack is: <strong style={{ color: '#fff' }}>Go API</strong> (Gin + GORM) · <strong style={{ color: '#fff' }}>PostgreSQL</strong> · <strong style={{ color: '#fff' }}>React dashboard</strong> (Vite + Tailwind). Everything runs in three containers.</P>

          {/* Bottom CTA */}
          <div style={{ marginTop: 72, padding: '36px 40px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg,#0d0d0d,#111)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>Ready to get started?</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Create a free account and instrument your first agent in minutes.</div>
            <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '11px 28px', borderRadius: 10, background: '#fff', color: '#000', textDecoration: 'none' }}>
              Create free account <ArrowRight size={15} />
            </Link>
          </div>

        </main>

        {/* ── Right TOC spacer — desktop only ─────────────────────── */}
        {!isMobile && <div style={{ width: 180, flexShrink: 0 }} />}
      </div>
    </div>
  )
}
