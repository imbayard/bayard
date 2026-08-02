import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@bench': fileURLToPath(new URL('./src/bench', import.meta.url)),
    },
  },
  server: {
    // Local dev only: route the bench API to the standalone Hono server
    // (`pnpm --filter @benchpoints/api dev`). In production the Netlify Function
    // serves /api/bench/* on the same origin, so no proxy is needed there.
    proxy: {
      '/api/bench': 'http://localhost:3001',
    },
  },
  worker: {
    format: 'es',
  },
})
