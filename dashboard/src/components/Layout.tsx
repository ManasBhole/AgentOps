import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bot, GitBranch, Siren, Layers, Brain, Settings,
  Bell, BellRing, BellOff, CheckCircle2, AlertTriangle,
  FlaskConical, BarChart3, Rocket, ScrollText, Cpu,
  LogOut, Shield, Target, Rewind, Radiation,
  Sparkles, Dna, Zap, Flame, DollarSign, GitMerge,
  ChevronDown, ChevronRight, Sun, Moon, Search, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CommandPalette from './CommandPalette'

interface LayoutProps { children: ReactNode }

type NavItem = { path: string; label: string; icon: React.ElementType; badge?: 'incidents' }
type NavSection = { label: string; items: NavItem[]; defaultOpen?: boolean }

const navSections: NavSection[] = [
  {
    label: 'Observe',
    defaultOpen: true,
    items: [
      { path: '/agents', label: 'Agents', icon: Bot },
      { path: '/traces', label: 'Traces', icon: GitBranch },
      { path: '/incidents', label: 'Incidents', icon: Siren, badge: 'incidents' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { path: '/orchestration', label: 'Orchestration', icon: Layers },
      { path: '/deployments', label: 'Deployments', icon: Rocket },
      { path: '/slo', label: 'SLO', icon: Target },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/intelligence', label: 'Intelligence', icon: Brain },
      { path: '/nexus', label: 'NEXUS', icon: Cpu },
      { path: '/nlq', label: 'NL Query', icon: Sparkles },
    ],
  },
  {
    label: 'Resilience',
    items: [
      { path: '/chaos', label: 'Chaos', icon: Zap },
      { path: '/blast-radius', label: 'Blast Radius', icon: Radiation },
      { path: '/timetravel', label: 'Time-Travel', icon: Rewind },
      { path: '/alerts', label: 'Alert Correlation', icon: GitMerge },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '/genome', label: 'Genome Drift', icon: Dna },
      { path: '/flame', label: 'Flame Graph', icon: Flame },
      { path: '/cost', label: 'Cost', icon: DollarSign },
      { path: '/audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
  {
    label: 'Dev',
    items: [
      { path: '/playground', label: 'Playground', icon: FlaskConical },
    ],
  },
]

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-blue-400',
}
const ROLE_COLOR: Record<string, string> = {
  owner: 'text-yellow-400', admin: 'text-indigo-400', 'agent-runner': 'text-emerald-400', viewer: 'text-gray-400',
}
const ROLE_BG: Record<string, string> = {
  owner: 'bg-yellow-950 border-yellow-900', admin: 'bg-indigo-950 border-indigo-900',
  'agent-runner': 'bg-emerald-950 border-emerald-900', viewer: 'bg-gray-800 border-gray-700',
}

function sectionContainsPath(section: NavSection, pathname: string) {
  return section.items.some(item =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  )
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

  // Collapsible sections: open if defaultOpen OR contains the active route
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of navSections) {
      init[s.label] = s.defaultOpen === true || sectionContainsPath(s, location.pathname)
    }
    return init
  })

  // Auto-expand section when navigating into it
  useEffect(() => {
    for (const s of navSections) {
      if (sectionContainsPath(s, location.pathname)) {
        setOpenSections(prev => prev[s.label] ? prev : { ...prev, [s.label]: true })
      }
    }
  }, [location.pathname])

  const toggleSection = (label: string) =>
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }))

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
    <div className="flex h-screen bg-gray-950 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`flex flex-col bg-gray-900 border-r border-gray-800/60 transition-all duration-200 flex-shrink-0
        ${collapsed ? 'w-[56px]' : 'w-52'}`}>

        {/* Logo + collapse button */}
        <div className={`flex items-center h-14 border-b border-gray-800/60 flex-shrink-0 px-3 gap-2`}>
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Bot className="h-4 w-4 text-white" />
          </div>
          {!collapsed && <span className="text-white font-bold text-sm tracking-wide flex-1">AgentOps</span>}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex-shrink-0 p-1 rounded-md text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen className="h-3.5 w-3.5" />
              : <PanelLeftClose className="h-3.5 w-3.5" />
            }
          </button>
        </div>

        {/* Nav — scrolls when all sections are expanded */}
        <nav className="flex-1 py-2 px-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>

          {/* Dashboard — always visible, no section header */}
          <Link
            to="/"
            title={collapsed ? 'Dashboard' : undefined}
            className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all mb-1
              ${isActive('/') && location.pathname === '/'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/70'
              }
              ${collapsed ? 'justify-center' : ''}`}
          >
            <LayoutDashboard className={`h-[15px] w-[15px] flex-shrink-0 ${isActive('/') && location.pathname === '/' ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* Collapsible sections */}
          {navSections.map(section => {
            const isOpen = openSections[section.label] ?? false
            const hasActive = sectionContainsPath(section, location.pathname)

            return (
              <div key={section.label} className="flex flex-col">

                {/* Section header — click to expand/collapse */}
                {!collapsed ? (
                  <button
                    onClick={() => toggleSection(section.label)}
                    className={`group flex items-center justify-between w-full px-2 py-1 rounded-md transition-colors mb-0.5
                      ${hasActive ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest">{section.label}</span>
                    <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                ) : (
                  /* In collapsed mode: show a thin divider between groups */
                  <div className="border-t border-gray-800/50 my-1 mx-1" />
                )}

                {/* Items — shown when open (or always in collapsed mode) */}
                {(isOpen || collapsed) && (
                  <div className="space-y-0.5">
                    {section.items.map(({ path, label, icon: Icon, badge }) => {
                      const active = isActive(path)
                      const badgeCount = badge === 'incidents' ? activeIncidents : 0
                      return (
                        <Link
                          key={path}
                          to={path}
                          title={collapsed ? label : undefined}
                          className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all relative
                            ${active
                              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                              : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/70'
                            }
                            ${collapsed ? 'justify-center' : ''}`}
                        >
                          <Icon className={`h-[15px] w-[15px] flex-shrink-0 ${active ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} />
                          {!collapsed && <span className="truncate flex-1">{label}</span>}
                          {badgeCount > 0 && (
                            <span className={`bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 flex-shrink-0
                              ${collapsed ? 'absolute -top-0.5 -right-0.5' : ''}`}>
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Settings pinned at bottom */}
        <div className="px-2 pb-3 flex-shrink-0 border-t border-gray-800/60 pt-2">
          <Link
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all
              ${isActive('/settings') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/70'}
              ${collapsed ? 'justify-center' : ''}`}
          >
            <Settings className={`h-[15px] w-[15px] flex-shrink-0 ${isActive('/settings') ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {!collapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between px-5 h-14 bg-gray-900/80 border-b border-gray-800/60 backdrop-blur-sm flex-shrink-0">

          {/* Left: status + active incidents pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </div>
              <span className="text-xs text-gray-500">API live</span>
            </div>

            {activeIncidents > 0 && (
              <Link to="/incidents"
                className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/70 border border-red-900/60 px-2.5 py-1 rounded-full hover:bg-red-900/50 transition-colors animate-pulse">
                <Siren className="h-3 w-3" />
                {activeIncidents} active incident{activeIncidents !== 1 ? 's' : ''}
              </Link>
            )}
          </div>

          {/* Right: search + theme + bell + user */}
          <div className="flex items-center gap-2">

            {/* Search trigger */}
            <button
              onClick={openPalette}
              className="hidden sm:flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 bg-gray-800/70 hover:bg-gray-800 border border-gray-700/60 rounded-lg pl-2.5 pr-3 py-1.5 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search…</span>
              <kbd className="ml-1 text-[10px] text-gray-600 bg-gray-700 border border-gray-600 px-1 rounded font-mono">⌘K</kbd>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={handleBellClick}
                className="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                {unread > 0 ? <BellRing className="h-4 w-4 text-indigo-400" /> : <Bell className="h-4 w-4" />}
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl shadow-black/40 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
                    <span className="text-sm font-semibold text-white">Notifications</span>
                    <div className="flex items-center gap-2">
                      {permission !== 'granted' ? (
                        <button onClick={requestPermission}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950 border border-indigo-900 px-2 py-1 rounded-lg">
                          <BellRing className="h-3 w-3" /> Enable push
                        </button>
                      ) : pushEnabled ? (
                        <button onClick={disablePush}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 bg-gray-800 border border-gray-700 px-2 py-1 rounded-lg transition-colors">
                          <BellOff className="h-3 w-3" /> Turn off
                        </button>
                      ) : (
                        <button onClick={enablePush}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950 border border-indigo-900 px-2 py-1 rounded-lg">
                          <BellRing className="h-3 w-3" /> Turn on
                        </button>
                      )}
                    </div>
                  </div>

                  {permission === 'denied' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-950 border-b border-red-900 text-xs text-red-400">
                      <BellOff className="h-3 w-3" /> Browser notifications blocked.
                    </div>
                  )}

                  <div className="max-h-72 overflow-y-auto">
                    {events.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-gray-500">
                        No notifications yet.
                        <div className="text-xs text-gray-600 mt-1">Incidents will appear here in real-time.</div>
                      </div>
                    )}
                    {events.map((evt, i) => (
                      <div key={`${evt.id}-${i}`}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/60 last:border-0
                          ${evt.type === 'incident.resolved' ? 'opacity-60' : ''}`}>
                        <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          evt.type === 'incident.resolved' ? 'bg-emerald-400' : SEV_DOT[evt.severity ?? ''] ?? 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-200 truncate">{evt.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            {evt.type === 'incident.resolved'
                              ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Resolved</>
                              : <><AlertTriangle className="h-3 w-3 text-orange-400" /> {evt.severity} · {evt.agent_id}</>}
                          </div>
                          <div className="text-[10px] text-gray-600 mt-0.5">{new Date(evt.timestamp).toLocaleTimeString()}</div>
                        </div>
                        {evt.type !== 'incident.resolved' && (
                          <Link to="/incidents" onClick={() => setNotifOpen(false)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0">
                            View →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-800" />

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 hover:bg-gray-800 rounded-lg px-2 py-1.5 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium text-gray-200 max-w-[90px] truncate leading-none">{user?.name}</div>
                  <div className={`text-[10px] mt-0.5 font-medium ${ROLE_COLOR[user?.role ?? 'viewer']}`}>{user?.role}</div>
                </div>
                <ChevronDown className="h-3 w-3 text-gray-500 hidden sm:block" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-11 w-52 bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-800/50">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{user?.name}</div>
                        <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-2.5 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_BG[user?.role ?? 'viewer']} ${ROLE_COLOR[user?.role ?? 'viewer']}`}>
                      <Shield className="h-2.5 w-2.5" />
                      {user?.role}
                    </div>
                  </div>
                  <div className="p-1.5">
                    <Link to="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                      <Settings className="h-3.5 w-3.5" /> Settings
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-950">
          <div className="p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
