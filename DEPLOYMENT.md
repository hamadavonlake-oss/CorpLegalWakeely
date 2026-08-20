# CorpLegalWakeely — Railway Deployment Guide

This guide walks you through deploying the full stack to Railway.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Railway Project                                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ PostgreSQL│  │  Redis   │  │  MinIO   │  │Gotenberg│ │
│  │ (plugin)  │  │ (plugin)  │  │ (Docker) │  │ (Docker)│ │
│  └─────┬─────┘  └─────┬────┘  └─────┬────┘  └────┬────┘ │
│        │              │             │             │       │
│  ┌─────┴──────────────┴─────────────┴─────────────┴────┐ │
│  │              NestJS API (port 3001)                   │ │
│  │  • Auth + RBAC + Legal Requests + Matters           │ │
│  │  • Contracts + Documents + Templates + Clauses      │ │
│  │  • Approvals + Notifications + Search + Deadlines    │ │
│  │  • Export (Gotenberg) + Webhooks (HMAC-SHA256)      │ │
│  └─────────────────────┬───────────────────────────────┘ │
│                        │                                  │
│  ┌─────────────────────┴───────────────────────────────┐ │
│  │              Next.js Web (port 3000)                 │ │
│  │  • Login + Register + Dashboard                      │ │
│  │  • Requests + Matters + Contracts + Documents       │ │
│  │  • Admin (Users, Roles, Settings, Country Packs)     │ │
│  │  • Notifications Bell (SSE) + Audit + Search + MFA  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Railway account** — sign up at [railway.app](https://railway.app)
2. **GitHub repo** — the repo must be connected to Railway
3. **Railway CLI** (optional) — `npm install -g @railway/cli`

## Step-by-Step Deployment

### Step 1: Create a Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"**
3. Select your `CorpLegalWakeely` repo
4. Click **Deploy**

Railway will detect the monorepo. You'll need to add services manually.

### Step 2: Add Infrastructure Services

#### 2a. PostgreSQL (managed by Railway)

1. In your Railway project, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway creates a PostgreSQL 16 instance
3. The `DATABASE_URL` variable is automatically available to all services

#### 2b. Redis (managed by Railway)

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Railway creates a Redis 7 instance
3. The `REDIS_URL` variable is automatically available

#### 2c. MinIO (Docker service)

1. Click **"+ New"** → **"GitHub Repo"** (or **"Docker Image"**)
2. If using Docker Image: image `minio/minio:latest`
3. Set environment variables:
   ```
   MINIO_ROOT_USER=your-access-key-here
   MINIO_ROOT_PASSWORD=your-secret-key-here
   ```
4. Set start command: `server /data --console-address ":9001"`
5. Add a volume mount: `/data` (persistent storage)
6. Expose port `9000` (API) — Railway gives it a public URL
7. **Important**: After MinIO starts, create the `legalops` bucket:
   - Use the MinIO Console (port 9001) or `mc` CLI
   - Or set the `S3_BUCKET` env var on the API to `legalops`

#### 2d. Gotenberg (Docker service — optional, only for PDF export)

1. Click **"+ New"** → **"Docker Image"**
2. Image: `gotenberg/gotenberg:8`
3. Expose port `3000`
4. Railway gives it a URL like `gotenberg-production.up.railway.app`
5. Set the API's `GOTENBERG_URL` to this URL

### Step 3: Deploy the API

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select your `CorpLegalWakeely` repo
3. Railway asks for the **Root Directory** — set it to `/` (repo root)
4. Railway detects `apps/api/railway.json` — if not, set:
   - **Builder**: Dockerfile
   - **Dockerfile path**: `infrastructure/docker/Dockerfile.api`
5. Set environment variables (see below)
6. **CRITICAL**: Set a **pre-deploy** command to run migrations:
   ```
   bash infrastructure/scripts/migrate-and-seed.sh
   ```
   (In Railway dashboard: Settings → Deploy → Pre-Deploy Command)

#### API Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (auto from plugin) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (auto from plugin) |
| `S3_ENDPOINT` | `https://your-minio.up.railway.app` |
| `S3_BUCKET` | `legalops` |
| `S3_ACCESS_KEY` | your MinIO access key |
| `S3_SECRET_KEY` | your MinIO secret key |
| `S3_REGION` | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `GOTENBERG_URL` | `https://your-gotenberg.up.railway.app` |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `30d` |
| `MFA_ISSUER` | `CorpLegalWakeely` |
| `MAX_UPLOAD_BYTES` | `104857600` |
| `SSE_ENABLED` | `true` |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `API_BASE_URL` | `https://your-api.up.railway.app` |
| `APP_BASE_URL` | `https://your-web.up.railway.app` |

### Step 4: Deploy the Web Frontend

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your `CorpLegalWakeely` repo again
3. Set **Root Directory** to `/` (repo root)
4. Railway detects `apps/web/railway.json` — if not, set:
   - **Builder**: Dockerfile
   - **Dockerfile path**: `infrastructure/docker/Dockerfile.web`
5. Set environment variables:

#### Web Environment Variables

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-api.up.railway.app/api/v1` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

**Important**: `NEXT_PUBLIC_API_URL` must be set as a **build-time** variable.
In Railway, set it in the **Variables** tab — Railway passes it as a build arg.

### Step 5: Generate JWT Keys

The API auto-generates RSA-4096 key pairs in development. For production,
generate them manually:

```bash
openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -pubout -out public.pem
```

Then either:
- Mount the keys at `/app/keys/private.pem` and `/app/keys/public.pem`
- Or set them as environment variables (base64-encoded PEM content)

### Step 6: Verify Deployment

1. Wait for all services to show green (healthy)
2. Visit the Web URL — you should see the login page
3. Register a new organization (first user becomes Enterprise Owner)
4. Or use seeded demo credentials:
   - Email: `owner@al-noor.demo`
   - Password: `DemoP@ssw0rd!`

### Step 7: Create the MinIO Bucket

After MinIO is running, create the `legalops` bucket:

```bash
# Install mc CLI
brew install minio/stable/mc  # macOS
# or: wget https://dl.min.io/client/mc/release/linux-amd64/mc

# Configure mc
mc alias set railway https://your-minio.up.railway.app your-access-key your-secret-key

# Create bucket
mc mb railway/legalops

# Verify
mc ls railway/
```

## Railway Service Map

| Service | Source | Port | Notes |
|---------|--------|------|-------|
| PostgreSQL | Railway plugin | 5432 | Auto-provisions `DATABASE_URL` |
| Redis | Railway plugin | 6379 | Auto-provisions `REDIS_URL` |
| MinIO | Docker image | 9000 | Needs volume + bucket creation |
| Gotenberg | Docker image | 3000 | Optional (PDF export only) |
| API | `Dockerfile.api` | 3001 | Pre-deploy: migrations + seed |
| Web | `Dockerfile.web` | 3000 | Build-time `NEXT_PUBLIC_API_URL` |

## Local Docker Compose (for testing)

If you want to test locally before Railway:

```bash
# Start all services
docker compose up -d

# Wait for health checks
docker compose ps

# Run migrations
docker compose exec api bash infrastructure/scripts/migrate-and-seed.sh

# Access:
# Web:     http://localhost:3000
# API:     http://localhost:3001/api/v1/health
# MinIO:   http://localhost:9001 (minioadmin / minioadmin_secret)
```

## Troubleshooting

### API won't start: "Cannot connect to PostgreSQL"
- Verify `DATABASE_URL` is set and points to the Railway PostgreSQL plugin
- Check that the pre-deploy migration script ran successfully

### Web shows "Connecting to API..."
- Verify `NEXT_PUBLIC_API_URL` is set correctly (must include `/api/v1`)
- Check that the API service is healthy

### Document upload fails: "Storage unavailable"
- Verify MinIO is running and the `legalops` bucket exists
- Check `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` on the API

### PDF export fails: "Gotenberg unavailable"
- Verify Gotenberg service is running
- Check `GOTENBERG_URL` on the API points to the Gotenberg service URL

### SSE notifications not working
- Railway may not support long-lived SSE connections through its proxy
- The polling fallback (every 30s) will still deliver notifications

## Cost Estimation (Railway Hobby Plan)

| Service | Estimated Cost/month |
|---------|---------------------|
| PostgreSQL (500MB) | $5 |
| Redis (256MB) | $5 |
| MinIO (1GB volume) | $5 |
| Gotenberg | $5 |
| API (512MB RAM) | $5 |
| Web (512MB RAM) | $5 |
| **Total** | **~$30/month** |

For production with higher traffic, consider the Pro plan ($20/month base + usage).
