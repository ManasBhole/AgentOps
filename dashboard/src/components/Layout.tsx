import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bot, GitBranch, Siren, Layers, Brain, Settings,
  Bell, BellRing, BellOff, CheckCircle2, AlertTriangle,
  FlaskConical, BarChart3, Rocket, ScrollText, Cpu,
  LogOut, Shield, Target, Rewind, Radiation,
  Sparkles, Dna, Zap, Flame, DollarSign, GitMerge,
  Sun, Moon, Search, PanelLeftClose, PanelLeftOpen,
  FileText, ChevronDown,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CommandPalette from './CommandPalette'

interface LayoutProps { children: ReactNode }

type NavItem = { path: string; label: string; icon: React.ElementType; badge?: 'incidents' }
type NavSection = {
  label: string
  color: string        // accent color class
  colorHex: string     // for inline styles
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'Observe',
    color: 'text-rose-400',
    colorHex: '#fb7185',
    items: [
      { path: '/agents',   label: 'Agents',   icon: Bot },
      { path: '/traces',   label: 'Traces',   icon: GitBranch },
      { path: '/incidents',label: 'Incidents',icon: Siren, badge: 'incidents' },
      { path: '/security', label: 'Security', icon: Shield },
    ],
  },
  {
    label: 'Operate',
    color: 'text-sky-400',
    colorHex: '#38bdf8',
    items: [
      { path: '/orchestration', label: 'Orchestration', icon: Layers },
      { path: '/deployments',   label: 'Deployments',   icon: Rocket },
      { path: '/slo',           label: 'SLO',           icon: Target },
    ],
  },
  {
    label: 'Analyze',
    color: 'text-violet-400',
    colorHex: '#a78bfa',
    items: [
      { path: '/analytics',   label: 'Analytics',  icon: BarChart3 },
      { path: '/intelligence',label: 'Intelligence',icon: Brain },
      { path: '/nexus',       label: 'NEXUS',      icon: Cpu },
      { path: '/nlq',         label: 'NL Query',   icon: Sparkles },
    ],
  },
  {
    label: 'Resilience',
    color: 'text-amber-400',
    colorHex: '#fbbf24',
    items: [
      { path: '/chaos',       label: 'Chaos',           icon: Zap },
      { path: '/blast-radius',label: 'Blast Radius',    icon: Radiation },
      { path: '/timetravel',  label: 'Time-Travel',     icon: Rewind },
      { path: '/alerts',      label: 'Alert Correlation',icon: GitMerge },
    ],
  },
  {
    label: 'Insights',
    color: 'text-emerald-400',
    colorHex: '#34d399',
    items: [
      { path: '/genome', label: 'Genome Drift', icon: Dna },
      { path: '/flame',  label: 'Flame Graph',  icon: Flame },
      { path: '/cost',   label: 'Cost',         icon: DollarSign },
      { path: '/audit',  label: 'Audit Log',    icon: ScrollText },
    ],
  },
  {
    label: 'Dev',
    color: 'text-orange-400',
    colorHex: '#fb923c',
    items: [
      { path: '/playground', label: 'Playground', icon: FlaskConical },
      { path: '/prompts',    label: 'Prompts',    icon: FileText },
      { path: '/evals',      label: 'Evals',      icon: FlaskConical },
    ],
  },
]

const ROLE_COLOR: Record<string, string> = {
  owner: 'text-amber-400', admin: 'text-indigo-400',
  'agent-runner': 'text-emerald-400', viewer: 'text-slate-400',
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(v => !v) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/stats'); return data },
    refetchInterval: 15_000,
  })

  const { permission, pushEnabled, requestPermission, enablePush, disablePush, events, unread, markRead } = useNotifications()
  const activeIncidents: number = stats?.active_incidents ?? 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBellClick = () => { setNotifOpen(v => !v); if (!notifOpen) markRead() }
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)


  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col flex-shrink-0 transition-all duration-200 ease-out border-r`}
        style={{
          width: collapsed ? 56 : 220,
          background: 'var(--bg-sidebar)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center h-14 px-3 gap-2.5 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Orion logo mark — 3-star constellation */}
          <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3" r="1.5" fill="white" fillOpacity="0.95" />
              <circle cx="4" cy="9" r="1.2" fill="white" fillOpacity="0.75" />
              <circle cx="12" cy="9" r="1.2" fill="white" fillOpacity="0.75" />
              <circle cx="6" cy="13" r="0.9" fill="white" fillOpacity="0.5" />
              <circle cx="10" cy="13" r="0.9" fill="white" fillOpacity="0.5" />
              <line x1="8" y1="3" x2="4" y2="9" stroke="white" strokeOpacity="0.3" strokeWidth="0.7" />
              <line x1="8" y1="3" x2="12" y2="9" stroke="white" strokeOpacity="0.3" strokeWidth="0.7" />
              <line x1="4" y1="9" x2="6" y2="13" stroke="white" strokeOpacity="0.2" strokeWidth="0.7" />
              <line x1="12" y1="9" x2="10" y2="13" stroke="white" strokeOpacity="0.2" strokeWidth="0.7" />
            </svg>
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-wide flex-1" style={{ color: 'var(--text-primary)' }}>
              Orion
            </span>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed
              ? <PanelLeftOpen className="h-3.5 w-3.5" />
              : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-3"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}
        >
          {/* Dashboard */}
          <div className="px-2 mb-2">
            <NavLink path="/" label="Dashboard" icon={LayoutDashboard} active={isActive('/') && location.pathname === '/'} collapsed={collapsed} accentHex="#6366f1" />
          </div>

          {/* Sections */}
          {navSections.map(section => (
            <div key={section.label} className="mb-1">
              {/* Section label */}
              {!collapsed ? (
                <div className="flex items-center gap-1.5 px-3.5 pt-2 pb-1">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: section.colorHex, boxShadow: `0 0 4px ${section.colorHex}` }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                    {section.label}
                  </span>
                </div>
              ) : (
                <div className="mx-3 my-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
              )}

              {/* Items */}
              <div className="px-2 space-y-0.5">
                {section.items.map(({ path, label, icon: Icon, badge }) => {
                  const active = isActive(path)
                  const badgeCount = badge === 'incidents' ? activeIncidents : 0
                  return (
                    <NavLink
                      key={path}
                      path={path}
                      label={label}
                      icon={Icon}
                      active={active}
                      collapsed={collapsed}
                      accentHex={section.colorHex}
                      badgeCount={badgeCount}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings bottom */}
        <div className="px-2 pb-3 pt-2 flex-shrink-0 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <NavLink path="/settings" label="Settings" icon={Settings} active={isActive('/settings')} collapsed={collapsed} accentHex="#6366f1" />
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex items-center justify-between px-5 h-14 flex-shrink-0 border-b backdrop-blur-sm"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border-subtle)' }}
        >
          {/* Left */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#34d399' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#34d399' }} />
              </span>
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Live</span>
            </div>

            {activeIncidents > 0 && (
              <Link to="/incidents"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors animate-pulse"
                style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
              >
                <Siren className="h-3 w-3" />
                {activeIncidents} active incident{activeIncidents !== 1 ? 's' : ''}
              </Link>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-1.5">
            {/* Search */}
            <button
              onClick={openPalette}
              className="hidden sm:flex items-center gap-2 text-xs rounded-lg pl-3 pr-3 py-1.5 border transition-colors"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search…</span>
              <kbd className="ml-1 text-[10px] px-1 rounded font-mono" style={{ color: 'var(--text-faint)', background: 'var(--bg-kbd)', border: '1px solid var(--border-default)' }}>⌘K</kbd>
            </button>

            {/* Theme */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={handleBellClick}
                className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {unread > 0 ? <BellRing className="h-4 w-4" style={{ color: '#818cf8' }} /> : <Bell className="h-4 w-4" />}
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style={{ background: '#ef4444' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 border overflow-hidden"
                  style={{ background: 'var(--bg-popover)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                    <div className="flex items-center gap-2">
                      {permission !== 'granted' ? (
                        <button onClick={requestPermission} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.2)' }}>
                          <BellRing className="h-3 w-3" /> Enable push
                        </button>
                      ) : pushEnabled ? (
                        <button onClick={disablePush} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ color: 'var(--text-muted)', background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}>
                          <BellOff className="h-3 w-3" /> Turn off
                        </button>
                      ) : (
                        <button onClick={enablePush} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.2)' }}>
                          <BellRing className="h-3 w-3" /> Turn on
                        </button>
                      )}
                    </div>
                  </div>
                  {permission === 'denied' && (
                    <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                      <BellOff className="h-3 w-3" /> Browser notifications blocked.
                    </div>
                  )}
                  <div className="max-h-72 overflow-y-auto">
                    {events.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No notifications yet.
                        <div className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Incidents will appear here in real-time.</div>
                      </div>
                    )}
                    {events.map((evt, i) => (
                      <div key={`${evt.id}-${i}`} className="flex items-start gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)', opacity: evt.type === 'incident.resolved' ? 0.6 : 1 }}>
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: evt.type === 'incident.resolved' ? '#34d399' : '#f87171' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{evt.title}</div>
                          <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                            {evt.type === 'incident.resolved'
                              ? <><CheckCircle2 className="h-3 w-3" style={{ color: '#34d399' }} /> Resolved</>
                              : <><AlertTriangle className="h-3 w-3" style={{ color: '#fb923c' }} /> {evt.severity} · {evt.agent_id}</>}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{new Date(evt.timestamp).toLocaleTimeString()}</div>
                        </div>
                        {evt.type !== 'incident.resolved' && (
                          <Link to="/incidents" onClick={() => setNotifOpen(false)} className="text-xs flex-shrink-0" style={{ color: '#818cf8' }}>View →</Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 mx-0.5" style={{ background: 'var(--border-default)' }} />

            {/* User */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium max-w-[80px] truncate leading-none" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                  <div className={`text-[10px] mt-0.5 font-medium ${ROLE_COLOR[user?.role ?? 'viewer']}`}>{user?.role}</div>
                </div>
                <ChevronDown className="h-3 w-3 hidden sm:block" style={{ color: 'var(--text-faint)' }} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-11 w-52 rounded-xl border z-50 overflow-hidden"
                  style={{ background: 'var(--bg-popover)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
                  <div className="px-4 py-3 border-b" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLOR[user?.role ?? 'viewer']}`}
                      style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)' }}>
                      <Shield className="h-2.5 w-2.5" />
                      {user?.role}
                    </div>
                  </div>
                  <div className="p-1.5">
                    <Link to="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}>
                      <Settings className="h-3.5 w-3.5" /> Settings
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors"
                      style={{ color: '#f87171' }}>
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
          <div className="p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

// ── Reusable nav link ──────────────────────────────────────────────────────────
function NavLink({
  path, label, icon: Icon, active, collapsed, accentHex, badgeCount = 0,
}: {
  path: string; label: string; icon: React.ElementType
  active: boolean; collapsed: boolean; accentHex: string; badgeCount?: number
}) {
  return (
    <Link
      to={path}
      title={collapsed ? label : undefined}
      className="group relative flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        background: active ? `color-mix(in srgb, ${accentHex} 12%, transparent)` : 'transparent',
        boxShadow: active ? `inset 2px 0 0 ${accentHex}` : undefined,
        justifyContent: collapsed ? 'center' : undefined,
      }}
    >
      <Icon
        className="flex-shrink-0 transition-colors"
        style={{
          width: 15, height: 15,
          color: active ? accentHex : undefined,
        }}
      />
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {badgeCount > 0 && (
        <span
          className="text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 flex-shrink-0"
          style={{
            background: '#ef4444',
            position: collapsed ? 'absolute' : 'relative',
            top: collapsed ? -2 : undefined,
            right: collapsed ? -2 : undefined,
          }}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  )
}
