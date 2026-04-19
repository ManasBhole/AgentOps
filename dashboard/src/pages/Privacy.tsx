import { Link } from 'react-router-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 14, letterSpacing: '-0.01em' }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}

export default function Privacy() {
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

      <main style={{ maxWidth: 740, margin: '0 auto', padding: '72px 40px 120px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 16 }}>Legal</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 12px', color: '#fff' }}>Privacy Policy</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Last updated: April 18, 2026</p>
        </div>

        <Section title="Overview">
          Orion ("we", "us", "our") is committed to protecting your personal information. This Privacy Policy describes how we collect, use, and share data when you use our AI agent observability platform and related services.
        </Section>

        <Section title="Information We Collect">
          <p style={{ margin: '0 0 12px' }}><strong style={{ color: 'rgba(255,255,255,0.8)' }}>Account data:</strong> When you register, we collect your name, email address, and password (hashed with bcrypt — we never store plaintext passwords).</p>
          <p style={{ margin: '0 0 12px' }}><strong style={{ color: 'rgba(255,255,255,0.8)' }}>Usage data:</strong> We collect agent traces, LLM call metadata, cost estimates, and performance metrics that you send via the Orion SDK. This is the core product data.</p>
          <p style={{ margin: '0 0 12px' }}><strong style={{ color: 'rgba(255,255,255,0.8)' }}>Log data:</strong> IP addresses, browser type, pages visited, and timestamps when you access the dashboard.</p>
          <p style={{ margin: 0 }}><strong style={{ color: 'rgba(255,255,255,0.8)' }}>Cookies:</strong> We use a single session cookie for authentication. We do not use advertising or tracking cookies.</p>
        </Section>

        <Section title="How We Use Your Data">
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>To operate, maintain, and improve the Orion platform</li>
            <li>To authenticate you and secure your account</li>
            <li>To compute metrics, alerts, and SLO reports on your behalf</li>
            <li>To send transactional emails (account confirmation, password reset)</li>
            <li>To respond to support requests</li>
            <li>To detect and prevent abuse or security incidents</li>
          </ul>
        </Section>

        <Section title="Data Sharing">
          <p style={{ margin: '0 0 12px' }}>We do not sell your data. We do not share your agent traces or LLM call data with third parties for advertising.</p>
          <p style={{ margin: '0 0 12px' }}>We use the following sub-processors to operate the service:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'AWS / Railway', purpose: 'Cloud infrastructure and database hosting' },
              { name: 'Vercel',        purpose: 'Dashboard frontend hosting' },
              { name: 'Postmark',      purpose: 'Transactional email delivery' },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', gap: 16, padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: '#0d0d0d' }}>
                <span style={{ color: '#60a5fa', fontWeight: 600, minWidth: 120 }}>{s.name}</span>
                <span>{s.purpose}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Data Retention">
          Trace data is retained for 90 days on the Free plan and 1 year on Pro/Enterprise. You can delete your account and all associated data at any time from Settings → Account. Deletion is permanent and processed within 30 days.
        </Section>

        <Section title="Security">
          All data is encrypted in transit (TLS 1.3) and at rest (AES-256). API keys are hashed before storage. We conduct regular security reviews and follow OWASP guidelines in our development process.
        </Section>

        <Section title="Your Rights">
          <p style={{ margin: '0 0 12px' }}>Depending on your location, you may have the right to:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing</li>
          </ul>
          <p style={{ margin: '16px 0 0' }}>To exercise these rights, email <span style={{ color: '#60a5fa' }}>privacy@orion.ai</span>.</p>
        </Section>

        <Section title="Contact">
          Questions about this policy? Contact us at <span style={{ color: '#60a5fa' }}>privacy@orion.ai</span> or write to Orion AI Inc., 2261 Market Street #4081, San Francisco, CA 94114.
        </Section>

        <div style={{ display: 'flex', gap: 20, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Link to="/terms" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Terms of Service →</Link>
          <Link to="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Back to Home →</Link>
        </div>
      </main>
    </div>
  )
}
