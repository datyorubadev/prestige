# Prestige — Free Hosting Deployment Guide

Step-by-step guide to deploy your entire stack for **$0/month** using free tiers.

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │     Vercel      │  ← Frontend (Next.js 16)
                    │   (free tier)   │
                    └────────┬────────┘
                             │ HTTPS
                             ▼
                    ┌─────────────────┐
                    │     Render      │  ← Backend (FastAPI)
                    │   (free tier)   │
                    └───┬────┬────┬───┘
                        │    │    │
              ┌─────────┘    │    └─────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │    Neon      │ │ Upstash  │ │   Groq API   │
     │ (PostgreSQL) │ │ (Redis)  │ │  (LLM/STT)   │
     │  free tier   │ │ free tier│ │  free tier    │
     └──────────────┘ └──────────┘ └──────────────┘
```

**Total cost: $0/month** (all free tiers)

---

## Prerequisites

- [GitHub account](https://github.com) (your code must be in a repo)
- [Vercel account](https://vercel.com) (sign up with GitHub)
- [Render account](https://render.com) (sign up with GitHub)
- [Neon account](https://neon.tech) (sign up with GitHub)
- [Upstash account](https://upstash.com) (sign up with GitHub)
- [Groq API key](https://console.groq.com) (free tier)

---

## Step 1: Get Your API Keys

### Groq (LLM)
1. Go to https://console.groq.com
2. Sign up / log in
3. Go to **API Keys** → **Create API Key**
4. Copy the key — you'll need it for both backend and testing

### Neon (PostgreSQL)
1. Go to https://neon.tech
2. Sign up with GitHub
3. Create a new project (any name, e.g., `prestige`)
4. Choose the **Free** plan
5. Copy the **connection string** — it looks like:
   ```
   postgresql://neondb_owner:xxxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Upstash (Redis)
1. Go to https://upstash.com
2. Sign up with GitHub
3. Click **Create Database**
4. Choose **Regional** (pick closest to your Render region)
5. Select the **Free** plan
6. Copy the **REDIS_URL** — it looks like:
   ```
   rediss://xxxx:xxxx@usw1-xxxx.upstash.io:6379
   ```
   > **Important:** Use the `rediss://` (with double s) URL — it's the TLS version needed for cloud connections.

---

## Step 2: Push Code to GitHub

If your code isn't already on GitHub:

```bash
cd "C:\Users\admin\Documents\Final Year Project\prestige"
git init
git add .
git commit -m "Initial commit — Prestige support portal"
git remote add origin https://github.com/YOUR_USERNAME/prestige.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy the Backend (Render)

1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub repo (`prestige`)
4. Configure:

| Field | Value |
|---|---|
| **Name** | `prestige-backend` |
| **Region** | US East (or closest to you) |
| **Branch** | `main` |
| **Runtime** | Docker |
| **Dockerfile** | `backend/Dockerfile` |
| **Docker Context** | `backend` |
| **Plan** | Free |

5. Before deploying, go to **Environment** tab and add these variables:

| Key | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | *(click Generate)* |
| `DATABASE_URL` | *(paste your Neon connection string)* |
| `REDIS_URL` | *(paste your Upstash URL)* |
| `CORS_ORIGINS` | `https://your-app.vercel.app` *(update after frontend deploy)* |
| `FRONTEND_URL` | `https://your-app.vercel.app` *(update after frontend deploy)* |
| `GROQ_API_KEY` | *(paste your Groq API key)* |
| `GROQ_CHAT_MODEL` | `llama-3.3-70b-versatile` |
| `GRAPH_CHECKPOINTER` | `memory` |
| `CHROMA_DATA_DIR` | `/tmp/chroma_data` |
| `EMAIL_MOCK` | `true` |
| `SUPER_ADMIN_EMAIL` | `root@portal.ng` |
| `SUPER_ADMIN_PASSWORD` | *(set a strong password)* |

6. Click **Create Web Service**
7. Wait for the build to finish (~5-8 min first time)
8. Note your backend URL: `https://prestige-backend.onrender.com`

### Verify Backend
- Visit `https://prestige-backend.onrender.com/health`
- You should see: `{"status":"ok","environment":"production"}`
- Visit `https://prestige-backend.onrender.com/docs` for Swagger UI

> **Note:** Render free tier spins down after 15 min of inactivity. The first request after sleep takes ~30-60s to wake up. This is fine for demos.

---

## Step 4: Deploy the Frontend (Vercel)

1. Go to https://vercel.com
2. Click **Add New** → **Project**
3. Import your GitHub repo (`prestige`)
4. Configure:

| Field | Value |
|---|---|
| **Framework Preset** | Next.js |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |

5. Add **Environment Variables**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://prestige-backend.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | `wss://prestige-backend.onrender.com` |
| `NEXT_PUBLIC_API_MOCK` | `false` |

6. Click **Deploy**
7. Wait for build (~2-3 min)
8. Note your frontend URL: `https://prestige-xxxx.vercel.app`

---

## Step 5: Update Backend CORS

Now that you have your Vercel URL, update the backend:

1. Go to Render dashboard → `prestige-backend` → **Environment**
2. Update `CORS_ORIGINS` to: `https://prestige-xxxx.vercel.app`
3. Update `FRONTEND_URL` to: `https://prestige-xxxx.vercel.app`
4. Render will auto-redeploy

---

## Step 6: Seed the Database

Your backend runs database migrations on startup, but you need to seed initial data (super admin, plans, demo tenants).

### Option A: Run the seed script on Render

1. Go to Render dashboard → `prestige-backend` → **Shell**
2. Run:
   ```bash
   python scripts/db_setup.py
   ```

### Option B: Seed via API

Once the backend is running, the `db_setup.py` script runs automatically on first boot (via `migrate_schema()` in `main.py`). Verify by checking:
- `GET /api/admin/tenants` should return seeded tenants (once you log in as super admin)

---

## Step 7: Test the Full Stack

1. Visit your Vercel URL: `https://prestige-xxxx.vercel.app`
2. You should see the landing page with the chat widget
3. Click **Open Console** → log in as super admin:
   - Email: `root@portal.ng`
   - Password: *(the SUPER_ADMIN_PASSWORD you set)*
4. Test the chat widget on the landing page
5. Explore the admin dashboard, tenant management, etc.

---

## Free Tier Limitations

| Platform | Limit | Impact |
|---|---|---|
| **Render** | 750 hrs/month, spins down after 15 min | First request after idle takes ~30-60s to wake |
| **Vercel** | 100 GB bandwidth, unlimited deploys | More than enough for demos |
| **Neon** | 512 MB storage, 24/7 compute on free | Plenty for seeded data |
| **Upstash** | 10K commands/day | Fine for rate limiting + presence |
| **Groq** | Generous free tier | Enough for demo/testing |

---

## Troubleshooting

### Backend won't build
- Check Render build logs for errors
- Ensure `backend/Dockerfile` and `backend/requirements.txt` are in the repo
- The embedding model download (~90MB) runs at build time — first build takes longer

### Frontend can't reach backend
- Verify `NEXT_PUBLIC_API_URL` matches your Render URL exactly
- Check `CORS_ORIGINS` on Render includes your Vercel URL
- Open browser DevTools → Network tab to see the actual requests

### Chat widget returns errors
- Ensure `GROQ_API_KEY` is set correctly on Render
- Check Render logs: Dashboard → `prestige-backend` → **Logs**
- Verify the Groq API key is valid at https://console.groq.com

### Database connection errors
- Ensure your Neon database is active (check Neon dashboard)
- Verify `DATABASE_URL` uses `sslmode=require`
- Neon free tier pauses after inactivity — visit the Neon dashboard to wake it

### Redis connection errors
- Ensure you're using the `rediss://` (TLS) URL from Upstash
- Upstash free tier doesn't expire but has command limits

---

## Optional: Custom Domain

### Vercel (Frontend)
1. Vercel dashboard → Project → **Settings** → **Domains**
2. Add your domain, follow DNS instructions

### Render (Backend)
1. Render dashboard → Service → **Settings** → **Custom Domains**
2. Add domain, update DNS CNAME record

---

## Optional: Docker Compose (Local Testing)

To test the exact production setup locally before deploying:

```bash
# From project root
docker-compose up
```

This runs backend + PostgreSQL + Redis in containers, matching the production architecture.

---

## Cost Summary

| Service | Plan | Monthly Cost |
|---|---|---|
| Vercel (Frontend) | Free | $0 |
| Render (Backend) | Free | $0 |
| Neon (PostgreSQL) | Free | $0 |
| Upstash (Redis) | Free | $0 |
| Groq (LLM) | Free tier | $0 |
| **Total** | | **$0** |

---

## For Your Defense Demo

1. **Pre-wake the backend**: Visit the Render URL 1 minute before your demo to wake it from sleep
2. **Have the Swagger docs ready**: `https://prestige-backend.onrender.com/docs` — great for showing API design
3. **Demo the chat widget live**: The widget on the landing page works immediately
4. **Show the admin dashboard**: Log in as super admin to show tenant management
5. **Show the 3-pane inbox**: Log in as an owner/agent to show the ticket system
6. **Mention the free hosting**: It demonstrates cost-awareness and real-world deployment skills
