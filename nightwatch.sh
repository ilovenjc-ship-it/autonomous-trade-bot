#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# nightwatch.sh — Keeps the TAO Bot app alive all night.
#
# What it does (every 20 seconds):
#   1. Checks if uvicorn is up        → restarts backend if it crashed
#   2. Checks if vite process is up   → restarts frontend if it crashed
#   3. Checks cloudflared tunnels     → restarts if dropped, logs new URLs
#   4. Pings both tunnel URLs         → keeps Cloudflare connections warm
#   5. Heartbeat log every 5 min      → proof of life
#
# Run:  bash nightwatch.sh &
#       (runs silently in background, logs to nightwatch.log)
# ─────────────────────────────────────────────────────────────────────────────

FRONTEND_PORT=3004
BACKEND_PORT=8001
LOG="/workspace/autonomous-trade-bot/nightwatch.log"
FRONTEND_DIR="/workspace/autonomous-trade-bot/frontend"
BACKEND_DIR="/workspace/autonomous-trade-bot/backend"
TUNNEL_FE_LOG="/workspace/autonomous-trade-bot/tunnel-frontend.log"
TUNNEL_BE_LOG="/workspace/autonomous-trade-bot/tunnel-backend.log"

# Rotate log if it gets large (> 2 MB)
rotate_log() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 2097152 ]; then
    mv "$LOG" "${LOG}.old"
    echo "[$(date '+%H:%M:%S ET')] Log rotated." > "$LOG"
  fi
}

start_backend() {
  echo "[$(date '+%H:%M:%S ET')] ⚙️  Restarting backend on :${BACKEND_PORT}…" >> "$LOG"
  pkill -f "uvicorn main:app" 2>/dev/null || true
  sleep 1
  cd "$BACKEND_DIR"
  nohup python -m uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" \
    >> "$LOG" 2>&1 &
  echo "[$(date '+%H:%M:%S ET')] ✅ Backend restarted (PID $!)" >> "$LOG"
}

start_frontend() {
  echo "[$(date '+%H:%M:%S ET')] ⚙️  Restarting frontend on :${FRONTEND_PORT}…" >> "$LOG"
  pkill -f "vite" 2>/dev/null || true
  sleep 1
  cd "$FRONTEND_DIR"
  nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" \
    >> "$LOG" 2>&1 &
  echo "[$(date '+%H:%M:%S ET')] ✅ Frontend restarted (PID $!)" >> "$LOG"
}

start_tunnel_frontend() {
  echo "[$(date '+%H:%M:%S ET')] 🌐 Restarting Cloudflare frontend tunnel…" >> "$LOG"
  pkill -f "cloudflared tunnel --url http://localhost:${FRONTEND_PORT}" 2>/dev/null || true
  sleep 2
  > "$TUNNEL_FE_LOG"
  nohup cloudflared tunnel --url "http://localhost:${FRONTEND_PORT}" \
    --no-autoupdate >> "$TUNNEL_FE_LOG" 2>&1 &
  sleep 12
  NEW_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_FE_LOG" | head -1)
  if [ -n "$NEW_URL" ]; then
    echo "[$(date '+%H:%M:%S ET')] ✅ Frontend tunnel URL: $NEW_URL" >> "$LOG"
  else
    echo "[$(date '+%H:%M:%S ET')] ⚠️  Frontend tunnel started — URL pending" >> "$LOG"
  fi
}

start_tunnel_backend() {
  echo "[$(date '+%H:%M:%S ET')] 🌐 Restarting Cloudflare backend tunnel…" >> "$LOG"
  pkill -f "cloudflared tunnel --url http://localhost:${BACKEND_PORT}" 2>/dev/null || true
  sleep 2
  > "$TUNNEL_BE_LOG"
  nohup cloudflared tunnel --url "http://localhost:${BACKEND_PORT}" \
    --no-autoupdate >> "$TUNNEL_BE_LOG" 2>&1 &
  sleep 12
  NEW_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_BE_LOG" | head -1)
  if [ -n "$NEW_URL" ]; then
    echo "[$(date '+%H:%M:%S ET')] ✅ Backend tunnel URL: $NEW_URL" >> "$LOG"
  else
    echo "[$(date '+%H:%M:%S ET')] ⚠️  Backend tunnel started — URL pending" >> "$LOG"
  fi
}

echo "[$(date '+%H:%M:%S ET')] 🌙 NightWatch started — keeping app alive all night." >> "$LOG"
echo "[$(date '+%H:%M:%S ET')] Frontend local: http://localhost:${FRONTEND_PORT}" >> "$LOG"
echo "[$(date '+%H:%M:%S ET')] Backend  local: http://localhost:${BACKEND_PORT}" >> "$LOG"
# Print current tunnel URLs if available
FE_URL_INIT=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_FE_LOG" 2>/dev/null | tail -1)
BE_URL_INIT=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_BE_LOG" 2>/dev/null | tail -1)
[ -n "$FE_URL_INIT" ] && echo "[$(date '+%H:%M:%S ET')] 🌐 Frontend tunnel: $FE_URL_INIT" >> "$LOG"
[ -n "$BE_URL_INIT" ] && echo "[$(date '+%H:%M:%S ET')] 🌐 Backend  tunnel: $BE_URL_INIT" >> "$LOG"

while true; do
  rotate_log

  # ── 1. Ping backend health (keeps sandbox warm + checks process) ──────────
  BACKEND_OK=false
  if curl -sf --max-time 4 "http://localhost:${BACKEND_PORT}/api/bot/status" \
       -o /dev/null 2>/dev/null; then
    BACKEND_OK=true
  fi

  if [ "$BACKEND_OK" = false ]; then
    # Double-check: maybe the process is running but slow
    if ! pgrep -f "uvicorn main:app" > /dev/null 2>&1; then
      echo "[$(date '+%H:%M:%S ET')] ❌ Backend down — restarting…" >> "$LOG"
      start_backend
      sleep 5
    else
      echo "[$(date '+%H:%M:%S ET')] ⏳ Backend process up but not responding yet." >> "$LOG"
    fi
  fi

  # ── 2. Check frontend vite process ───────────────────────────────────────
  if ! pgrep -f "vite" > /dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S ET')] ❌ Frontend (vite) down — restarting…" >> "$LOG"
    start_frontend
    sleep 5
  fi

  # ── 3. Check Cloudflare frontend tunnel ──────────────────────────────────
  if ! pgrep -f "cloudflared tunnel --url http://localhost:${FRONTEND_PORT}" > /dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S ET')] ❌ Frontend tunnel down — restarting…" >> "$LOG"
    start_tunnel_frontend
  fi

  # ── 4. Check Cloudflare backend tunnel ───────────────────────────────────
  if ! pgrep -f "cloudflared tunnel --url http://localhost:${BACKEND_PORT}" > /dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S ET')] ❌ Backend tunnel down — restarting…" >> "$LOG"
    start_tunnel_backend
  fi

  # ── 5. Ping tunnel URLs to keep them warm ────────────────────────────────
  FE_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_FE_LOG" 2>/dev/null | tail -1)
  BE_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_BE_LOG" 2>/dev/null | tail -1)
  [ -n "$FE_URL" ] && curl -sf --max-time 8 "$FE_URL" -o /dev/null 2>/dev/null || true
  [ -n "$BE_URL" ] && curl -sf --max-time 8 "$BE_URL/api/bot/status" -o /dev/null 2>/dev/null || true

  # ── 4. Heartbeat log every ~5 minutes (silent otherwise) ─────────────────
  MINUTE=$(date '+%M')
  if [ "$MINUTE" = "00" ] || [ "$MINUTE" = "05" ] || [ "$MINUTE" = "10" ] || \
     [ "$MINUTE" = "15" ] || [ "$MINUTE" = "20" ] || [ "$MINUTE" = "25" ] || \
     [ "$MINUTE" = "30" ] || [ "$MINUTE" = "35" ] || [ "$MINUTE" = "40" ] || \
     [ "$MINUTE" = "45" ] || [ "$MINUTE" = "50" ] || [ "$MINUTE" = "55" ]; then
    echo "[$(date '+%H:%M:%S ET')] 💚 All systems nominal — bot running." >> "$LOG"
  fi

  sleep 20
done