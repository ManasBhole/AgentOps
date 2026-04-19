import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

type StatusLevel = 'operational' | 'degraded' | 'outage'

const SERVICES: { name: string; status: StatusLevel; uptime: number }[] = [
  { name: 'API (REST)',           status: 'operational', uptime: 99.97 },
  { name: 'Dashboard',           status: 'operational', uptime: 99.99 },
  { name: 'Trace Ingestion',     status: 'operational', uptime: 99.95 },
  { name: 'Alert Engine',        status: 'operational', uptime: 99.91 },
  { name: 'SDK (Python)',        status: 'operational', uptime: 100.00 },
  { name: 'SDK (Node.js)',       status: 'operational', uptime: 100.00 },
  { name: 'Webhook Delivery',    status: 'operational', uptime: 99.88 },
  { name: 'Fingerprint Service', status: 'operational', uptime: 99.93 },
]

// Last 90 days — 1 = ok, 0 = incident, 0.5 = degraded
function generateBars(uptime: number): number[] {
  const bars: number[] = []
  for (let i = 0; i < 90; i++) {
    const r = Math.random()
    const incidentChance = (100 - uptime) / 100 * 3
    if (r < incidentChance * 0.3) bars.push(0)
    else if (r < incidentChance) bars.push(0.5)
    else bars.push(1)
  }
  return bars
}

const BAR_DATA = SERVICES.map(s => ({ ...s, bars: generateBars(s.uptime) }))

const INCIDENTS = [
  {
    date: 'Mar 12, 2026',
    title: 'Elevated latency on Trace Ingestion endpoint',
    severity: 'degraded' as StatusLevel,
    duration: '23 min',
    resolved: true,
    detail: 'A database connection pool exhaustion caused P99 latency to spike to 4.2s. Resolved by increasing pool size and adding circuit breakers.',
  },
  {
    date: 'Feb 28, 2026',
    title: 'Webhook delivery delays',
    severity: 'degraded' as StatusLevel,
    duration: '41 min',
    resolved: true,
    detail: 'A queue backup in the webhook worker caused up to 40-minute delays. No webhooks were lost. Resolved by scaling up worker replicas.',
  },
  {
    date: 'Jan 9, 2026',
    title: 'Dashboard login unavailable',
    severity: 'outage' as StatusLevel,
    duration: '8 min',
    resolved: true,
    detail: 'A bad deploy caused the auth service to crash. Rolled back within 8 minutes. All sessions remained valid.',
  },
]

function StatusBadge({ status }: { status: StatusLevel }) {
  const cfg = {
    operational: { label: 'Operational', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', Icon: CheckCircle },
    degraded:    { label: 'Degraded',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', Icon: AlertTriangle },
    outage:      { label: 'Outage',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  Icon: XCircle },
  }[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '3px 10px', borderRadius: 100 }}>
      <cfg.Icon size={11} />
      {cfg.label}
    </span>
  )
}

function UptimeBar({ bars }: { bars: number[] }) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 28 }}>
      {bars.map((v, i) => (
        <div key={i} title={v === 1 ? 'Operational' : v === 0.5 ? 'Degraded' : 'Outage'} style={{
          flex: 1, height: v === 1 ? 28 : v === 0.5 ? 18 : 10,
          borderRadius: 2,
          background: v === 1 ? '#22c55e' : v === 0.5 ? '#f59e0b' : '#ef4444',
          opacity: v === 1 ? 0.7 : 1,
          transition: 'height 0.2s',
          cursor: 'default',
        }} />
      ))}
    </div>
  )
}

export default function Status() {
  const [expanded, setExpanded] = useState<number | null>(null)
  const allOk = SERVICES.every(s => s.status === 'operational')

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
        <div style={{ display: 'flex', gap: 16 }}>
          <Link to="/docs" style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>Docs</Link>
          <Link to="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>Log in</Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 40px 120px' }}>

        {/* Overall status banner */}
        <div style={{
          padding: '24px 32px', borderRadius: 16, marginBottom: 56,
          background: allOk ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${allOk ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'}`,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: allOk ? '#22c55e' : '#f59e0b', boxShadow: `0 0 8px ${allOk ? '#22c55e' : '#f59e0b'}`, flexShrink: 0, animation: 'pulseDot 2s infinite' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
              {allOk ? 'All systems operational' : 'Some systems experiencing issues'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              Updated {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC
            </div>
          </div>
        </div>

        {/* Services */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Services</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
          {BAR_DATA.map((s, i) => (
            <div key={s.name} style={{ background: '#0a0a0a', padding: '16px 20px', borderBottom: i < BAR_DATA.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{s.uptime.toFixed(2)}% uptime</span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
              <UptimeBar bars={s.bars} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>90 days ago</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Today</span>
              </div>
            </div>
          ))}
        </div>

        {/* Incident history */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 56, marginBottom: 16 }}>Incident History</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {INCIDENTS.map((inc, i) => (
            <div key={i} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0a', overflow: 'hidden' }}>
              <button onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <StatusBadge status={inc.severity} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{inc.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{inc.date}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>~{inc.duration}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', transform: expanded === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                </div>
              </button>
              {expanded === i && (
                <div style={{ padding: '0 20px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                  <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{inc.detail}</p>
                  <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#22c55e' }}>
                    <CheckCircle size={12} /> Resolved · All systems normal
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 32, textAlign: 'center' }}>
          Subscribe to updates at <span style={{ color: '#60a5fa' }}>status@orion.ai</span>
        </p>

      </main>

      <style>{`@keyframes pulseDot { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>
    </div>
  )
}
