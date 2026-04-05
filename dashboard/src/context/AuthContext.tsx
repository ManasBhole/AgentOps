import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import api, { authApi } from '../services/api'

export type UserRole = 'owner' | 'admin' | 'viewer' | 'agent-runner'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatar_url: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAccess: (resource: string, action: string) => boolean
}

const RBAC: Record<UserRole, Record<string, string[]>> = {
  owner:          { '*': ['*'] },
  admin:          { agents: ['read','write','delete'], traces: ['read','write'], incidents: ['read','write','resolve'], nexus: ['read','write'], deployments: ['read','write','delete'], analytics: ['read'], audit: ['read'], users: ['read'] },
  'agent-runner': { agents: ['read'], traces: ['read','write'], incidents: ['read'], deployments: ['read','write'], nexus: ['read'] },
  viewer:         { agents: ['read'], traces: ['read'], incidents: ['read'], nexus: ['read'], deployments: ['read'], analytics: ['read'], audit: ['read'] },
}

function hasAccess(role: UserRole, resource: string, action: string): boolean {
  const perms = RBAC[role]
  if (!perms) return false
  if (perms['*']?.includes('*')) return true
  const actions = perms[resource]
  if (!actions) return false
  return actions.includes(action) || actions.includes('*')
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ACCESS_TOKEN_KEY = 'orion_access_token'
const REFRESH_TOKEN_KEY = 'orion_refresh_token'
const USER_KEY = 'orion_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  })

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const userStr = localStorage.getItem(USER_KEY)
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setState({ user, accessToken: token, isLoading: false, isAuthenticated: true })
        return
      } catch {
        // fall through to clear
      }
    }
    // Try to use refresh token
    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (refresh) {
      authApi.post('/auth/refresh', { refresh_token: refresh })
        .then(({ data }) => {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
          api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          authApi.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          return authApi.get('/auth/me')
        })
        .then(({ data }) => {
          localStorage.setItem(USER_KEY, JSON.stringify(data))
          setState({ user: data, accessToken: localStorage.getItem(ACCESS_TOKEN_KEY), isLoading: false, isAuthenticated: true })
        })
        .catch(() => {
          clearStorage()
          setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false })
        })
    } else {
      setState(s => ({ ...s, isLoading: false }))
    }
  }, [])

  const storeSession = useCallback((data: { access_token: string; refresh_token: string; user: AuthUser }) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
    authApi.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
    setState({ user: data.user, accessToken: data.access_token, isLoading: false, isAuthenticated: true })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.post('/auth/login', { email, password })
    storeSession(data)
  }, [storeSession])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await authApi.post('/auth/register', { name, email, password })
    storeSession(data)
  }, [storeSession])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    try { await authApi.post('/auth/logout', { refresh_token: refresh }) } catch { /* ignore */ }
    clearStorage()
    delete api.defaults.headers.common['Authorization']
    delete authApi.defaults.headers.common['Authorization']
    setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false })
  }, [])

  const checkAccess = useCallback((resource: string, action: string) => {
    if (!state.user) return false
    return hasAccess(state.user.role, resource, action)
  }, [state.user])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, checkAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

function clearStorage() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
