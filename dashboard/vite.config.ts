import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Overridden to '/<repo>/' for the GitHub Pages build, since it's served
  // from a subpath instead of the domain root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // Required for SSE (Server-Sent Events) — disables response buffering
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/events')) {
              proxyRes.headers['cache-control'] = 'no-cache'
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
      // Auth routes must also proxy to the Go backend
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
