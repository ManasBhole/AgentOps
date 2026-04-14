import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bot, GitBranch, Siren, Layers, Brain, Settings,
  Bell, BellRing, BellOff, CheckCircle2, AlertTriangle,
  FlaskConical, BarChart3, Rocket, ScrollText, Cpu,
  LogOut, Shield, ShieldAlert, Target, Rewind, Radiation,
  Sparkles, Dna, Zap, Flame, DollarSign, GitMerge,
  Sun, Moon, Search, PanelLeftClose, PanelLeftOpen,
  FileText, ChevronDown, GitCompare,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CommandPalette from './CommandPalette'

interface LayoutProps { children: ReactNode }
type NavItem = { path: string; label: string; icon: React.ElementType; badge?: 'incidents' }
type NavSection = { label: string; colorHex: string; items: NavItem[] }

const NAV: NavSection[] = [
  { label: 'Observe', colorHex: '#fb7185', items: [
    { path: '/agents',    label: 'Agents',    icon: Bot },
    { path: '/traces',    label: 'Traces',    icon: GitBranch },
    { path: '/incidents', label: 'Incidents', icon: Siren, badge: 'incidents' },
    { path: '/security',  label: 'Security',  icon: Shield },
  ]},
  { label: 'Operate', colorHex: '#38bdf8', items: [
    { path: '/orchestration', label: 'Orchestration', icon: Layers },
    { path: '/deployments',   label: 'Deployments',   icon: Rocket },
    { path: '/slo',           label: 'SLO',           icon: Target },
  ]},
  { label: 'Analyze', colorHex: '#a78bfa', items: [
    { path: '/analytics',    label: 'Analytics',    icon: BarChart3 },
    { path: '/intelligence', label: 'Intelligence', icon: Brain },
    { path: '/nexus',        label: 'NEXUS',        icon: Cpu },
    { path: '/nlq',          label: 'NL Query',     icon: Sparkles },
  ]},
  { label: 'Resilience', colorHex: '#fbbf24', items: [
    { path: '/chaos',       label: 'Chaos',             icon: Zap },
    { path: '/blast-radius',label: 'Blast Radius',      icon: Radiation },
    { path: '/timetravel',  label: 'Time-Travel',       icon: Rewind },
    { path: '/alerts',      label: 'Alert Correlation', icon: GitMerge },
    { path: '/alert-rules', label: 'Alert Rules',       icon: Bell },
  ]},
  { label: 'Insights', colorHex: '#34d399', items: [
    { path: '/genome', label: 'Genome Drift', icon: Dna },
    { path: '/flame',  label: 'Flame Graph',  icon: Flame },
    { path: '/cost',   label: 'Cost',         icon: DollarSign },
    { path: '/audit',  label: 'Audit Log',    icon: ScrollText },
  ]},
  { label: 'Dev', colorHex: '#fb923c', items: [
    { path: '/playground',   label: 'Playground',     icon: FlaskConical },
    { path: '/prompts',      label: 'Prompts',        icon: FileText },
    { path: '/evals',        label: 'Evals',          icon: FlaskConical },
    { path: '/abtesting',    label: 'A/B Testing',    icon: GitBranch },
    { path: '/compare',      label: 'Compare Agents', icon: GitCompare },
    { path: '/integrations', label: 'Integrations',   icon: Zap },
    { path: '/redteam',      label: 'Red Team',       icon: ShieldAlert },
  ]},
]

const ROLE_COLOR: Record<string, string> = {
  owner: '#fbbf24', admin: '#818cf8', 'agent-runner': '#34d399', viewer: '#94a3b8',
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [collapsed, setCollapsed]   = useState(false)
  const [notifOpen, setNotifOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen]  = useState(false)
  const notifRef    = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(v => !v) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/stats'); return data },
    refetchInterval: 15_000,
  })

  const { permission, pushEnabled, requestPermission, enablePush, disablePush, events, unread, markRead } = useNotifications()
  const activeIncidents: number = stats?.active_incidents ?? 0

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))    setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleBellClick = () => { setNotifOpen(v => !v); if (!notifOpen) markRead() }
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const W = collapsed ? 56 : 232

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: W, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          height: 56, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          padding: collapsed ? 0 : '0 14px',
          gap: 10,
        }}>
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6366f1', borderRadius: 0, transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <PanelLeftOpen style={{ width: 18, height: 18 }} />
            </button>
          ) : (
            <>
              <div style={{
                flexShrink: 0, width: 30, height: 30, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                boxShadow: '0 0 16px rgba(99,102,241,0.45)',
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="3.5" r="1.5" fill="white"/>
                  <circle cx="4" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
                  <circle cx="12" cy="9.5" r="1.2" fill="white" fillOpacity="0.8"/>
                  <circle cx="6" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
                  <circle cx="10" cy="13.5" r="0.9" fill="white" fillOpacity="0.5"/>
                  <line x1="8" y1="5" x2="4" y2="8.3" stroke="white" strokeOpacity="0.35" strokeWidth="0.8"/>
                  <line x1="8" y1="5" x2="12" y2="8.3" stroke="white" strokeOpacity="0.35" strokeWidth="0.8"/>
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.02em', flex: 1, color: 'var(--text-primary)' }}>Orion</span>
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
              >
                <PanelLeftClose style={{ width: 14, height: 14 }} />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}>
          {/* Dashboard */}
          <div style={{ padding: '0 8px', marginBottom: 6 }}>
            <SideLink path="/" label="Dashboard" icon={LayoutDashboard}
              active={isActive('/') && location.pathname === '/'} collapsed={collapsed} accent="#6366f1" />
          </div>

          {NAV.map(section => (
            <div key={section.label} style={{ marginBottom: 2 }}>
              {/* Section header */}
              {collapsed ? (
                <div style={{ margin: '6px 10px', height: 1, background: 'var(--border-subtle)' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px 4px' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: section.colorHex, boxShadow: `0 0 6px ${section.colorHex}80`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                    {section.label}
                  </span>
                </div>
              )}
              <div style={{ padding: '0 8px' }}>
                {section.items.map(({ path, label, icon, badge }) => (
                  <SideLink
                    key={path} path={path} label={label} icon={icon}
                    active={isActive(path)} collapsed={collapsed} accent={section.colorHex}
                    badgeCount={badge === 'incidents' ? activeIncidents : 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings + user */}
        <div style={{ padding: '6px 8px 10px', borderTop: '1px solid var(--border-subtle)' }}>
          <SideLink path="/settings" label="Settings" icon={Settings}
            active={isActive('/settings')} collapsed={collapsed} accent="#6366f1" />
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <header style={{
          height: 56, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
          background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(20px) saturate(180%)',
        }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#34d399', opacity: 0.6, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', display: 'block' }} />
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 2 }}>Live</span>
            </div>
            {activeIncidents > 0 && (
              <Link to="/incidents" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, padding: '3px 10px', borderRadius: 100,
                color: '#f87171', background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                textDecoration: 'none', animation: 'pulse 2s infinite',
              }}>
                <Siren style={{ width: 11, height: 11 }} />
                {activeIncidents} incident{activeIncidents !== 1 ? 's' : ''}
              </Link>
            )}
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Search */}
            <button
              onClick={openPalette}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, padding: '5px 12px', borderRadius: 10,
                color: 'var(--text-muted)', background: 'var(--bg-input)',
                border: '1px solid var(--border-default)', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)')}
            >
              <Search style={{ width: 13, height: 13 }} />
              <span>Search…</span>
              <kbd style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', color: 'var(--text-faint)', background: 'var(--bg-kbd)', border: '1px solid var(--border-default)' }}>⌘K</kbd>
            </button>

            {/* Theme */}
            <HeaderBtn onClick={toggleTheme} title={theme === 'dark' ? 'Light' : 'Dark'}>
              {theme === 'dark' ? <Sun style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
            </HeaderBtn>

            {/* Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <HeaderBtn onClick={handleBellClick}>
                {unread > 0
                  ? <><BellRing style={{ width: 15, height: 15, color: '#818cf8' }} /><span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1px solid var(--bg-header)' }} /></>
                  : <Bell style={{ width: 15, height: 15 }} />
                }
              </HeaderBtn>
              {notifOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 44,
                  width: 320, borderRadius: 16, zIndex: 50, overflow: 'hidden',
                  background: 'var(--bg-popover)', border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Notifications</span>
                    {permission !== 'granted' ? (
                      <button onClick={requestPermission} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 8, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                        <BellRing style={{ width: 11, height: 11 }} /> Enable push
                      </button>
                    ) : pushEnabled ? (
                      <button onClick={disablePush} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, color: 'var(--text-muted)', background: 'var(--bg-input)', border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BellOff style={{ width: 11, height: 11 }} /> Turn off
                      </button>
                    ) : (
                      <button onClick={enablePush} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 8, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                        <BellRing style={{ width: 11, height: 11 }} /> Turn on
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {events.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                        No notifications yet.
                        <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-faint)' }}>Incidents appear here in real-time.</div>
                      </div>
                    ) : events.map((evt, i) => (
                      <div key={`${evt.id}-${i}`} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', opacity: evt.type === 'incident.resolved' ? 0.6 : 1 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: evt.type === 'incident.resolved' ? '#34d399' : '#f87171' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.title}</div>
                          <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                            {evt.type === 'incident.resolved'
                              ? <><CheckCircle2 style={{ width: 11, height: 11, color: '#34d399' }} /> Resolved</>
                              : <><AlertTriangle style={{ width: 11, height: 11, color: '#fb923c' }} /> {evt.severity} · {evt.agent_id}</>}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 2, color: 'var(--text-faint)' }}>{new Date(evt.timestamp).toLocaleTimeString()}</div>
                        </div>
                        {evt.type !== 'incident.resolved' && (
                          <Link to="/incidents" onClick={() => setNotifOpen(false)} style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', flexShrink: 0 }}>View →</Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 4px' }} />

            {/* User */}
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-input)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'none')}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: 'white', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }}>
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                <div style={{ textAlign: 'left', display: 'none' }} className="sm-show">
                  <div style={{ fontSize: 12, fontWeight: 600, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', lineHeight: 1.2 }}>{user?.name}</div>
                  <div style={{ fontSize: 10, marginTop: 1, fontWeight: 600, color: ROLE_COLOR[user?.role ?? 'viewer'] ?? '#94a3b8' }}>{user?.role}</div>
                </div>
                <ChevronDown style={{ width: 12, height: 12, color: 'var(--text-faint)' }} />
              </button>

              {userMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 46,
                  width: 220, borderRadius: 14, zIndex: 50, overflow: 'hidden',
                  background: 'var(--bg-popover)', border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-input)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'white', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }}>
                        {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{user?.name}</div>
                        <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{user?.email}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: ROLE_COLOR[user?.role ?? 'viewer'] }}>
                      <Shield style={{ width: 10, height: 10 }} />{user?.role}
                    </div>
                  </div>
                  <div style={{ padding: 6 }}>
                    <Link to="/settings" onClick={() => setUserMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', transition: 'background 0.15s' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-input)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                    >
                      <Settings style={{ width: 14, height: 14 }} /> Settings
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout() }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                    >
                      <LogOut style={{ width: 14, height: 14 }} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
          <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

/* ── Header icon button ─────────────────────────────────────────────────── */
function HeaderBtn({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', position: 'relative', transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

/* ── Sidebar nav link ───────────────────────────────────────────────────── */
function SideLink({ path, label, icon: Icon, active, collapsed, accent, badgeCount = 0 }:
  { path: string; label: string; icon: React.ElementType; active: boolean; collapsed: boolean; accent: string; badgeCount?: number }) {
  return (
    <Link
      to={path}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : undefined,
        gap: 9,
        padding: collapsed ? '8px 0' : '6px 10px',
        borderRadius: 9,
        marginBottom: 1,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        textDecoration: 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        background: active ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent',
        borderLeft: active && !collapsed ? `2px solid ${accent}` : '2px solid transparent',
        boxShadow: active ? `inset 0 0 0 1px ${accent}18` : 'none',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <Icon style={{ width: 15, height: 15, flexShrink: 0, color: active ? accent : undefined, transition: 'color 0.15s' }} />
      {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      {badgeCount > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'white',
          background: '#ef4444',
          borderRadius: 100, minWidth: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
          position: collapsed ? 'absolute' : 'relative',
          top: collapsed ? 4 : undefined, right: collapsed ? 4 : undefined,
          flexShrink: 0,
        }}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  )
}
