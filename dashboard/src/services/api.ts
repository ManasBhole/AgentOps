import axios from 'axios'

// Base instance for /api/v1/* routes
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach token on every request — reads from localStorage so it works
// even on first render before AuthProvider's useEffect has run.
api.interceptors.request.use(config => {
  const token = localStorage.getItem('agentops_access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('agentops_access_token')
      localStorage.removeItem('agentops_refresh_token')
      localStorage.removeItem('agentops_user')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// Separate instance for /auth/* routes (login, logout, refresh, me)
export const authApi = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
})
