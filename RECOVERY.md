# 🚨 RECOVERY GUIDE — TAO Autonomous Trading Bot

> **Use this file any time the sandbox resets, the session crashes, or you start
> from a cold clone.** Follow steps in order; each step is a checkbox you tick
> before moving on.

---

## 0. Quick-reference facts

| Item | Value |
|------|-------|
| **Bot wallet (coldkey)** | `5HMXmud5v6zUz84fm3azwLyENFpbtq5CFK6ZeShA4EqcECAT` |
| **Mnemonic env key** | `BT_MNEMONIC` |
| **Backend port** | `8001` |
| **Frontend port** | `3004` |
| **Backend start cmd** | `cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8001` |
| **Frontend start cmd** | `cd frontend && npm run dev -- --host 0.0.0.0 --port 3004` |
| **Keepalive** | `bash nightwatch.sh &` |
| **Health check** | `curl http://localhost:8001/api/bot/status` |

> ⚠️  The 12-word mnemonic is **never** stored in git.  It lives in two
> places that survive a workspace reset:
> 1. `/app/.user_env.sh`  — sourced automatically by every new shell
> 2. `backend/.env`        — read by `bittensor_service.py` at startup
>
> If either is missing, see **Step 2** below.

---

## Step 1 — Confirm the repo is present

```bash
ls /workspace/autonomous-trade-bot
```

If the directory is missing, clone from the saved checkpoint:

```bash
cd /workspace
# (use whatever remote the project was pushed to)
git clone <YOUR_REMOTE_URL> autonomous-trade-bot
cd autonomous-trade-bot
```

---

## Step 2 — Restore the mnemonic

### 2a. Check `/app/.user_env.sh`

```bash
grep BT_MNEMONIC /app/.user_env.sh
```

**If it prints the mnemonic → skip to Step 3.**

**If it is empty or missing:**

```bash
cat >> /app/.user_env.sh << 'ENVEOF'

# === Bittensor bot wallet ===
export BT_MNEMONIC="grid shield fee crisp front salmon lamp material dad slim clever general"
ENVEOF
```

### 2b. Check `backend/.env`

```bash
grep BT_MNEMONIC backend/.env 2>/dev/null || echo "MISSING"
```

**If MISSING:**

```bash
echo 'BT_MNEMONIC="grid shield fee crisp front salmon lamp material dad slim clever general"' \
  >> backend/.env
```

### 2c. Verify the env var is live in the current shell

```bash
source /app/.user_env.sh
echo "✅ mnemonic is ${#BT_MNEMONIC} chars"
```

Expected output: `✅ mnemonic is 72 chars`

---

## Step 3 — Install / verify Python deps

```bash
cd /workspace/autonomous-trade-bot/backend
pip install -r requirements.txt -q
```

(Already installed in a live sandbox → finishes in seconds.)

---

## Step 4 — Start the backend

```bash
cd /workspace/autonomous-trade-bot/backend
source /app/.user_env.sh          # make sure BT_MNEMONIC is in scope
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8001 \
  >> /workspace/autonomous-trade-bot/backend.log 2>&1 &
sleep 4
curl -s http://localhost:8001/api/bot/status | python3 -m json.tool | head -20
```

Expected: JSON with `"status": "running"` (or `"stopped"` — either is fine at
this point; it means the process started).

If you see **Connection refused**, check the log:

```bash
tail -40 /workspace/autonomous-trade-bot/backend.log
```

---

## Step 5 — Start the frontend

```bash
cd /workspace/autonomous-trade-bot/frontend
nohup npm run dev -- --host 0.0.0.0 --port 3004 \
  >> /workspace/autonomous-trade-bot/frontend.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/
```

Expected: `200`

---

## Step 6 — Expose ports (get public URLs)

Ask the AI to run:

```
register_port(3004)   # frontend
register_port(8001)   # backend
```

Or do it manually in the Ports panel of the sandbox UI.

---

## Step 7 — Start NightWatch (keeps everything alive overnight)

```bash
cd /workspace/autonomous-trade-bot
bash nightwatch.sh &
```

Confirm it started:

```bash
sleep 3 && tail -5 nightwatch.log
```

---

## Step 8 — Confirm wallet loaded

```bash
curl -s http://localhost:8001/api/wallet/info | python3 -m json.tool
```

Look for:
- `"address": "5DjztH..."` — wallet restored from mnemonic ✅
- `"balance_tao": <non-zero>` — live balance fetched ✅

If `address` is the fallback `TARGET_WALLET` literal but `mnemonic_loaded`
is `false`, the service didn't find `BT_MNEMONIC`. Re-run Step 2 and restart
the backend (Step 4).

---

## Step 9 — Mid-session: save state before the sandbox sleeps

Any time you're about to walk away:

```bash
cd /workspace/autonomous-trade-bot
git add -A
git commit -m "checkpoint: $(date '+%Y-%m-%d %H:%M') — <one-line summary>"
git push          # if remote is configured
```

Also rotate / check the nightwatch log:

```bash
tail -10 nightwatch.log
```

---

## Troubleshooting cheat-sheet

| Symptom | Fix |
|---------|-----|
| Backend 404 or connection refused | `tail -40 backend.log`; restart Step 4 |
| `mnemonic_loaded: false` in wallet API | Re-run Step 2 then restart backend |
| Frontend blank / CORS errors | Check `VITE_API_URL` in `frontend/.env`; should be `http://localhost:8001` |
| `nightwatch.sh` not found | `ls /workspace/autonomous-trade-bot/nightwatch.sh` — if missing, restore from git |
| Balance shows 0 after wallet loaded | Network call failed; check `bittensor_service.py` logs for RPC errors |
| Port already in use | `pkill -f "uvicorn main:app"` then retry Step 4 |

---

*Last updated: 2026-04-16 — Session VII recovery + mnemonic persistence.*