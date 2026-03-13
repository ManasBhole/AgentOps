import axios from 'axios'

// Base instance for /api/v1/* routes
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

export default api

// Separate instance for /auth/* routes (login, logout, refresh, me)
export const authApi = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
})
