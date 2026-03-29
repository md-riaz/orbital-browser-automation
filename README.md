# Orbital - Headless Browser Automation Service

Orbital is a production-ready headless browser automation service built with **Fastify**, **Redis (BullMQ)**, **SQLite**, and **Playwright**. It accepts JSON-defined automation workflows over HTTP, queues them reliably, and executes them in Playwright workers.

## Features

- 🚀 Fastify API + BullMQ queue + SQLite job tracking
- 🎭 Playwright-powered browser automation workers
- 🔒 API-key authentication for all automation endpoints
- 🧭 Swagger UI for the public API
- 🛠️ Admin web UI for API key management and job monitoring
- 💾 Artifact storage for screenshots/downloads
- 🐳 Docker-first deployment
- ⚡ Multi-worker processing via Redis queue

## Current Architecture

```text
Client -> Fastify API -> Redis (BullMQ) -> Playwright Workers -> Artifacts
                  \-> SQLite (jobs + API keys)
                  \-> Admin UI
```

## Components

### API Server (`server/`)
- Fastify REST API
- Swagger / OpenAPI docs
- API-key auth (`X-API-Key`)
- Admin login + admin pages
- Job creation/status endpoints
- Artifact serving

### Worker (`worker/`)
- BullMQ job processing
- Executes Playwright workflows
- Writes results/artifacts
- Updates job status in SQLite

### Redis
- Queue backend for BullMQ

### SQLite
- Stores automation jobs
- Stores managed API keys
- Stores job attribution to API key labels

## Authentication Model

Orbital now uses **API-key-only auth** for the public API.

### Public endpoint
- `GET /health`

### Protected endpoints
- all `/api/v1/*` endpoints require:

```http
X-API-Key: <your-api-key>
```

> Bearer auth is no longer the documented/public auth model.

## Admin UI

Orbital now includes an admin web interface.

### Admin pages
- `/admin/login`
- `/admin`
- `/admin/api-keys`
- `/admin/jobs`
- `/admin/jobs/:id`

### Admin capabilities
- login with admin username/password
- create API keys
- rotate API keys
- revoke API keys
- delete API keys
- view recent jobs
- filter/search jobs
- inspect job details and results

## Swagger / API Docs

Public API docs are available at:

- `/docs`
- `/docs/json`

Swagger intentionally shows **only** the public API routes:
- `/health`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/{id}`

Admin routes are hidden from Swagger.

## Quick Start with Docker

```bash
# 1. Clone
git clone https://github.com/md-riaz/orbital-browser-automation.git
cd orbital-browser-automation

# 2. Configure environment
cp .env.example .env
# edit .env

# 3. Start the stack
docker compose up -d --build

# 4. Check health
curl http://localhost:8058/health
```

## Important Environment Variables

```env
APP_URL=http://localhost:8058
PORT=8058
HOST=0.0.0.0

REDIS_URL=redis://localhost:6379
DB_DATABASE=database/database.sqlite

# Bootstrap API keys for initial setup only
API_KEYS=your-secret-api-key-change-me

# Admin web login
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_SESSION_SECRET=change-this-session-secret
```

### Notes on API keys
- `API_KEYS` is only for initial bootstrap
- the admin panel can create/rotate/revoke/delete keys after startup
- API clients should send the raw key in `X-API-Key`

## Public API

### Health check

```bash
curl http://localhost:8058/health
```

### Create job

```bash
curl -X POST http://localhost:8058/api/v1/jobs \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://example.com" },
        { "action": "wait", "duration": 1000 },
        { "action": "screenshot", "fullPage": true }
      ]
    },
    "options": {
      "timeout": 60000,
      "viewport": { "width": 1440, "height": 900 }
    }
  }'
```

Response:

```json
{
  "job_id": "uuid-here",
  "status": "pending"
}
```

### Get job status

```bash
curl http://localhost:8058/api/v1/jobs/{job_id} \
  -H "X-API-Key: your-secret-key"
```

Example response:

```json
{
  "job_id": "uuid-here",
  "status": "completed",
  "created_at": "2026-02-20T12:00:00.000Z",
  "started_at": "2026-02-20T12:00:01.000Z",
  "finished_at": "2026-02-20T12:00:05.000Z",
  "api_key_label": "Test Client",
  "result": {
    "artifacts": [
      {
        "type": "screenshot",
        "url": "http://localhost:8058/artifacts/{job_id}/screenshot-0.png",
        "filename": "screenshot-0.png",
        "step": 0
      }
    ],
    "steps_completed": 3
  }
}
```

## Supported Workflow Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `goto` | Navigate to URL | `url` |
| `wait` | Wait for duration in ms | `duration` |
| `click` | Click an element | `selector` |
| `type` | Type text into element | `selector`, `value` |
| `waitForSelector` | Wait for element to appear | `selector` |
| `screenshot` | Capture screenshot | `fullPage` |
| `waitForDownload` | Wait for file download | none |
| `evaluate` | Execute JavaScript in page context | `script` |

## Deployment Notes

### Docker (recommended)
- one server container
- one Redis container
- one or more worker containers
- Nginx/Caddy can sit in front for TLS and subdomain routing

### Production suggestions
- keep API behind HTTPS
- use the admin panel to rotate bootstrap API keys after first deploy
- do not expose Redis publicly
- back up the SQLite database and artifact storage

## Admin Workflow Recommendation

After first deploy:
1. log into `/admin/login`
2. create a new named API key for each client/use case
3. rotate or revoke the bootstrap key from `.env`
4. use `/admin/jobs` to monitor job traffic

## Docs and Examples

- `QUICKSTART.md`
- `docs/DOCKER.md`
- `docs/DEPLOYMENT.md`
- `docs/EXAMPLES.md`
- `docs/TEST_WORKFLOW_EXAMPLES.md`

## License

MIT
