# 🚂 Railway Deployment Guide
**TAO Autonomous Trading Bot — II Agent**

> Full 24/7 cloud deployment. No tunnels. No sandbox dependency.

---

## What You Need
- Railway account → [railway.app](https://railway.app) (free signup)
- Your GitHub connected to Railway
- Your `BT_MNEMONIC` (wallet seed phrase)

---

## Step 1 — Create a New Railway Project

1. Login to Railway → **New Project**
2. Select **Deploy from GitHub repo**
3. Choose `ilovenjc-ship-it/autonomous-trade-bot`

---

## Step 2 — Add PostgreSQL Database

In your Railway project:
1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway creates the database and auto-sets `DATABASE_URL` — nothing to copy

---

## Step 3 — Deploy the Backend Service

1. Click **+ New** → **GitHub Repo** → same repo
2. Set **Root Directory** → `backend`
3. Railway auto-detects Python and uses `backend/railway.toml`

**Add these Environment Variables in Railway dashboard:**

| Key | Value |
|-----|-------|
| `BT_MNEMONIC` | your 12-word wallet seed phrase |
| `BT_NETWORK` | `finney` |
| `RAILWAY_ENVIRONMENT` | `production` |

4. Click **Deploy** → wait ~2 minutes
5. Copy the generated backend URL (e.g. `https://xxx.up.railway.app`)

---

## Step 4 — Deploy the Frontend Service

1. Click **+ New** → **GitHub Repo** → same repo again
2. Set **Root Directory** → `frontend`
3. Railway auto-detects Node and uses `frontend/railway.toml`

**Add these Environment Variables:**

| Key | Value |
|-----|-------|
| `VITE_API_URL` | the backend URL from Step 3 (no trailing slash) |

4. Click **Deploy** → wait ~2 minutes
5. Copy the generated frontend URL

---

## Step 5 — Wire CORS (Final Step)

Go back to the **backend service** → Environment Variables:

| Key | Value |
|-----|-------|
| `FRONTEND_URL` | the frontend URL from Step 4 |

Railway auto-redeploys. Done.

---

## What You Get

| Thing | Before | After |
|-------|--------|-------|
| App availability | Sandbox-dependent | 24/7 cloud |
| URL | Random, changes every restart | Permanent |
| Tunnel | Cloudflare free (unstable) | None needed |
| Bot running when offline | ❌ | ✅ |
| OpenClaw voting | Only when sandbox active | Always |

---

## Environment Variables — Full Reference

### Backend Service
| Key | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | Auto | Set by Railway Postgres plugin |
| `BT_MNEMONIC` | ✅ Yes | Your wallet seed phrase |
| `BT_NETWORK` | ✅ Yes | `finney` |
| `RAILWAY_ENVIRONMENT` | ✅ Yes | `production` |
| `FRONTEND_URL` | After Step 4 | Frontend Railway URL |

### Frontend Service
| Key | Required | Notes |
|-----|----------|-------|
| `VITE_API_URL` | ✅ Yes | Backend Railway URL (no trailing slash) |

---

## Troubleshooting

**Backend health check failing?**
→ Check `BT_MNEMONIC` is set correctly
→ Check Railway Postgres service is running

**Frontend shows blank page?**
→ `VITE_API_URL` not set or wrong — must be set BEFORE build runs

**CORS errors in browser console?**
→ `FRONTEND_URL` not set in backend — set it and redeploy backend

---

*Railway free tier works. For 24/7 uptime upgrade to Hobby ($5/month).*  
*— II Agent, Session XIII*