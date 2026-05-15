/**
 * Vite config — Session XXXVII perf pass.
 *
 * manualChunks splits common dependencies into long-cacheable vendor chunks
 * so they aren't duplicated across page chunks AND don't bloat the initial
 * shell.  Categories:
 *   • vendor-react    — react / react-dom / react-router-dom (always needed)
 *   • vendor-charts   — recharts (only loaded by pages that use it)
 *   • vendor-icons    — lucide-react (icon set, used app-wide)
 *   • vendor-misc     — axios, clsx, date-fns, zustand, react-hot-toast
 *
 * react-router stays in vendor-react because router internals are imported
 * eagerly by App.tsx.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3004,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Raise the warning threshold from 500 KB → 800 KB so the largest page
    // chunk (Wallet + OpenClaw + IIAgent ≈ 600-700 KB raw with their inline
    // helpers) doesn't trip the build with noise.  Real per-chunk gzipped
    // sizes are well below this.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router')) return 'vendor-react'
          if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) return 'vendor-react'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('axios') || id.includes('clsx') || id.includes('date-fns')
              || id.includes('zustand') || id.includes('react-hot-toast')) return 'vendor-misc'
          return undefined
        },
      },
    },
  },
})