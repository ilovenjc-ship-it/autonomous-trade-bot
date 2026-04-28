/**
 * Production proxy server for Railway deployment.
 *
 * Architecture:
 *   Browser → profound-expression (this server) → autonomous-trade-bot (Railway internal)
 *
 * Benefits:
 *   - No CORS issues (browser only talks to one origin)
 *   - Backend does not need to be publicly exposed
 *   - SSE / streaming responses pass through cleanly
 *
 * Environment variables:
 *   PORT                  — set automatically by Railway
 *   BACKEND_INTERNAL_URL  — backend's Railway private URL
 *                           e.g. http://autonomous-trade-bot.railway.internal:8080
 *                           Defaults to that value if not set.
 */

const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 3000

const BACKEND = process.env.BACKEND_INTERNAL_URL
  || 'http://autonomous-trade-bot.railway.internal:8080'

console.log(`[proxy] Backend target: ${BACKEND}`)

// ── Proxy all /api/* to backend ──────────────────────────────────────────────
app.use(
  '/api',
  createProxyMiddleware({
    target:      BACKEND,
    changeOrigin: true,
    // Keep streaming responses alive (SSE / chunked transfer)
    selfHandleResponse: false,
    on: {
      error: (err, req, res) => {
        console.error(`[proxy] Error ${req.method} ${req.url}: ${err.message}`)
        if (!res.headersSent) {
          res.status(502).json({ detail: 'Backend unavailable — proxy error' })
        }
      },
      proxyReq: (proxyReq) => {
        // Forward real client IP for logging
        proxyReq.setHeader('X-Forwarded-By', 'profound-expression-proxy')
      },
    },
  })
)

// ── Serve React static files ─────────────────────────────────────────────────
const DIST = path.join(__dirname, 'dist')
app.use(express.static(DIST))

// ── SPA fallback — all other routes serve index.html ────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] Listening on port ${PORT}`)
})