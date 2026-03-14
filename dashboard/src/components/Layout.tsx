import { ReactNode, useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bot, GitBranch, Siren, Layers, Brain, Settings,
  ChevronLeft, ChevronRight, Bell, Circle, BellRing, BellOff,
  CheckCircle2, AlertTriangle, FlaskConical, BarChart3, Rocket, ScrollText, Cpu,
  LogOut, User, Shield, Target, Rewind, Radiation,
  Sparkles, Dna, Zap, Flame, DollarSign, GitMerge,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../context/AuthContext'

interface LayoutProps { children: ReactNode }

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/traces', label: 'Traces', icon: GitBranch },
  { path: '/incidents', label: 'Incidents', icon: Siren },
  { path: '/orchestration', label: 'Orchestration', icon: Layers },
  { path: '/intelligence', label: 'Intelligence', icon: Brain },
  { path: '/nexus', label: 'NEXUS', icon: Cpu },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/playground', label: 'Playground', icon: FlaskConical },
  { path: '/deployments', label: 'Deployments', icon: Rocket },
  { path: '/audit', label: 'Audit Log', icon: ScrollText },
  { path: '/slo', label: 'SLO', icon: Target },
  { path: '/timetravel', label: 'Time-Travel', icon: Rewind },
  { path: '/blast-radius', label: 'Blast Radius', icon: Radiation },
  { path: '/nlq', label: 'NLQ', icon: Sparkles },
  { path: '/genome', label: 'Genome Drift', icon: Dna },
  { path: '/chaos', label: 'Chaos', icon: Zap },
  { path: '/flame', label: 'Flame Graph', icon: Flame },
  { path: '/cost', label: 'Cost', icon: DollarSign },
  { path: '/alerts', label: 'Alert Correlation', icon: GitMerge },
  { path: '/settings', label: 'Settings', icon: Settings },
]

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-blue-400',
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'text-yellow-400',
  admin: 'text-indigo-400',
  'agent-runner': 'text-emerald-400',
  viewer: 'text-gray-400',
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/stats'); return data },
    refetchInterval: 15_000,
  })

  const { permission, pushEnabled, requestPermission, enablePush, disablePush, events, unread, markRead } = useNotifications()
  const activeIncidents: number = stats?.active_incidents ?? 0

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBellClick = () => {
    setNotifOpen(v => !v)
    if (!notifOpen) markRead()
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800">
          {collapsed ? (
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center mx-auto">
              <Bot className="h-4 w-4 text-white" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="text-white font-bold text-sm tracking-wide">AgentOps</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
            const badge = path === '/incidents' && activeIncidents > 0 ? activeIncidents : null
            return (
              <Link key={path} to={path} title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors relative
                  ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
                {badge && (
                  <span className={`bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1
                    ${collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'}`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-2 pb-4">
          <button onClick={() => setCollapsed(v => !v)}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 text-xs transition-colors">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-6 h-14 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
            <span className="text-xs text-gray-400">API live · localhost:8080</span>
          </div>

          <div className="flex items-center gap-4">
            {activeIncidents > 0 && (
              <Link to="/incidents"
                className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950 border border-red-900 px-3 py-1 rounded-full hover:bg-red-900 transition-colors">
                <Siren className="h-3 w-3" />
                {activeIncidents} active incident{activeIncidents !== 1 ? 's' : ''}
              </Link>
            )}

            {/* ── Notification bell ────────────────────────────── */}
            <div className="relative" ref={notifRef}>
              <button onClick={handleBellClick}
                className="relative text-gray-400 hover:text-white transition-colors p-1">
                {unread > 0 ? <BellRing className="h-4 w-4 text-indigo-400 animate-pulse" /> : <Bell className="h-4 w-4" />}
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-8 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <span className="text-sm font-semibold text-white">Notifications</span>
                    <div className="flex items-center gap-2">
                      {permission !== 'granted' ? (
                        <button onClick={requestPermission}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950 border border-indigo-900 px-2 py-1 rounded-lg">
                          <BellRing className="h-3 w-3" /> Enable push
                        </button>
                      ) : pushEnabled ? (
                        <button onClick={disablePush}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 bg-gray-800 border border-gray-700 hover:border-red-900 px-2 py-1 rounded-lg transition-colors">
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

                  {/* Permission hint */}
                  {permission === 'denied' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-950 border-b border-red-900 text-xs text-red-400">
                      <BellOff className="h-3 w-3" />
                      Browser notifications blocked. Allow in browser settings.
                    </div>
                  )}

                  {/* Event list */}
                  <div className="max-h-72 overflow-y-auto">
                    {events.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">
                        No notifications yet.<br />
                        <span className="text-xs text-gray-600">New incidents will appear here in real-time.</span>
                      </div>
                    )}
                    {events.map((evt, i) => (
                      <div key={`${evt.id}-${i}`}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800 last:border-0
                          ${evt.type === 'incident.resolved' ? 'opacity-60' : ''}`}
                      >
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                          evt.type === 'incident.resolved' ? 'bg-emerald-400' :
                          SEV_DOT[evt.severity ?? ''] ?? 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-200 truncate">{evt.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            {evt.type === 'incident.resolved'
                              ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Resolved</>
                              : <><AlertTriangle className="h-3 w-3 text-orange-400" /> {evt.severity} · {evt.agent_id}</>}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </div>
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

            {/* ── User menu ────────────────────────────────── */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 hover:bg-gray-800 rounded-lg px-2 py-1 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                {!collapsed && <span className="text-xs text-gray-300 max-w-[80px] truncate hidden sm:block">{user?.name}</span>}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-10 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm font-medium text-white truncate">{user?.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                    <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${ROLE_COLOR[user?.role ?? 'viewer']}`}>
                      <Shield className="h-3 w-3" />
                      {user?.role}
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); logout() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950 rounded-lg transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-950">{children}</main>
      </div>
    </div>
  )
}
