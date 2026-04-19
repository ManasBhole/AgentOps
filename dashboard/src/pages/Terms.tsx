import { Link } from 'react-router-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 14, letterSpacing: '-0.01em' }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}

export default function Terms() {
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
          <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 12px', color: '#fff' }}>Terms of Service</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Last updated: April 18, 2026</p>
        </div>

        <Section title="Acceptance of Terms">
          By accessing or using Orion ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service. These Terms form a binding agreement between you (or your organization) and Orion AI Inc.
        </Section>

        <Section title="Description of Service">
          Orion is an AI agent observability platform that collects, processes, and displays operational data from your AI agents — including traces, latency metrics, cost data, SLO tracking, and alerting. The Service is provided as a cloud-hosted SaaS or as a self-hosted open-source deployment.
        </Section>

        <Section title="Account Registration">
          <p style={{ margin: '0 0 12px' }}>You must provide accurate information when creating an account. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.</p>
          <p style={{ margin: 0 }}>You must be at least 18 years old and authorized to enter into contracts on behalf of your organization to use the Service.</p>
        </Section>

        <Section title="Acceptable Use">
          <p style={{ margin: '0 0 12px' }}>You agree not to:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Use the Service for illegal activities or to violate any applicable law</li>
            <li>Attempt to gain unauthorized access to our systems or other users' data</li>
            <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
            <li>Send malicious code, spam, or abuse our APIs</li>
            <li>Resell or sublicense access to the Service without written permission</li>
            <li>Misrepresent your identity or affiliation</li>
          </ul>
        </Section>

        <Section title="Data and Privacy">
          Your use of the Service is also governed by our <Link to="/privacy" style={{ color: '#60a5fa' }}>Privacy Policy</Link>. You retain ownership of all data you send to Orion. By using the Service, you grant us a limited license to process that data solely to provide and improve the Service.
        </Section>

        <Section title="Intellectual Property">
          The Orion platform, dashboard, brand, and documentation are owned by Orion AI Inc. The core server and SDK code is open-source under the MIT License. You may not use our trademarks, logos, or brand assets without written permission.
        </Section>

        <Section title="Pricing and Payment">
          <p style={{ margin: '0 0 12px' }}>Free plan usage is subject to fair-use limits. Paid plans are billed monthly or annually as described on the pricing page. All fees are non-refundable except as required by law.</p>
          <p style={{ margin: 0 }}>We reserve the right to change pricing with 30 days' notice to active subscribers.</p>
        </Section>

        <Section title="Service Availability">
          We target 99.9% monthly uptime for paid plans. Scheduled maintenance will be communicated at least 24 hours in advance via the <Link to="/status" style={{ color: '#60a5fa' }}>Status page</Link>. We are not liable for downtime caused by third-party infrastructure (cloud providers, network outages).
        </Section>

        <Section title="Limitation of Liability">
          To the maximum extent permitted by law, Orion AI Inc. shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the fees you paid in the 12 months preceding the claim.
        </Section>

        <Section title="Termination">
          You may cancel your account at any time from Settings. We may suspend or terminate your account for violations of these Terms, with or without notice. Upon termination, your data will be retained for 30 days before permanent deletion.
        </Section>

        <Section title="Changes to Terms">
          We may update these Terms at any time. Material changes will be communicated by email or in-app notification at least 14 days before taking effect. Continued use of the Service constitutes acceptance of the updated Terms.
        </Section>

        <Section title="Contact">
          Questions about these Terms? Contact us at <span style={{ color: '#60a5fa' }}>legal@orion.ai</span> or write to Orion AI Inc., 2261 Market Street #4081, San Francisco, CA 94114.
        </Section>

        <div style={{ display: 'flex', gap: 20, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Link to="/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Privacy Policy →</Link>
          <Link to="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Back to Home →</Link>
        </div>
      </main>
    </div>
  )
}
