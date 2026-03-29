# Quick Start Guide

Get Orbital running quickly with Docker or local Node.js.

## What Orbital provides now

- public API for automation jobs
- Swagger docs at `/docs`
- admin web UI for API key management and job monitoring
- API-key-only auth using `X-API-Key`

## Prerequisites

- Docker + Docker Compose recommended
- or Node.js 20+ and Redis 7+

## Fastest path: Docker

```bash
git clone https://github.com/md-riaz/orbital-browser-automation.git
cd orbital-browser-automation
cp .env.example .env
# edit .env

docker compose up -d --build
```

Check health:

```bash
curl http://localhost:8058/health
```

## Minimal `.env`

```env
APP_URL=http://localhost:8058
PORT=8058
HOST=0.0.0.0
REDIS_URL=redis://localhost:6379
DB_DATABASE=database/database.sqlite
API_KEYS=your-secret-api-key-change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_SESSION_SECRET=change-this-session-secret
```

## First-run workflow

1. open admin login:
   - `http://localhost:8058/admin/login`
2. sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. go to `/admin/api-keys`
4. create a named API key for your client/app
5. use that key with the public API
6. rotate/revoke the bootstrap key later if needed

## Swagger docs

- `http://localhost:8058/docs`
- `http://localhost:8058/docs/json`

Swagger only shows the public API routes.

## Public API auth

Use the raw key in the header:

```bash
-H "X-API-Key: your-secret-key"
```

## Create a job

```bash
curl -X POST http://localhost:8058/api/v1/jobs \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://www.example.com" },
        { "action": "screenshot", "fullPage": true }
      ]
    }
  }'
```

## Check job status

```bash
curl http://localhost:8058/api/v1/jobs/{job_id} \
  -H "X-API-Key: your-secret-key"
```

## Local non-Docker startup

```bash
# install server deps
cd server && npm install && cd ..

# install worker deps
cd worker && npm install && cd ..

# start redis separately
redis-server

# terminal 1
npm run start:server

# terminal 2
npm run start:worker
```

## Troubleshooting

### 401 Unauthorized
- make sure you are using `X-API-Key`
- verify the key exists and is active in `/admin/api-keys`

### Swagger shows admin pages
- that is a bug; admin routes should be hidden from Swagger

### Worker not processing jobs
- verify Redis is up
- check worker logs
- confirm the server can create jobs successfully
