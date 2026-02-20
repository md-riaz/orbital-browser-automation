# Orbital - Headless Browser Automation Service

Orbital is a **minimal**, **framework-free** Headless Browser Automation Service built with Fastify and SQLite. It accepts JSON-defined automation workflows via REST API, queues them using a filesystem-based queue, and executes them via a Playwright worker process.

## Features

- 🚀 **Minimal Stack**: Fastify + SQLite + Filesystem Queue (no Laravel, no Redis, no external dependencies)
- 🎭 **Playwright-powered** browser automation
- 🔒 **Built-in security** (SSRF protection, input validation, API key auth)
- 💾 **Simple persistence**: SQLite for job tracking, filesystem for queue
- 📦 **No containers needed**: Single VPS deployment
- ⚡ **Fast and lightweight**: Small footprint, quick startup

## Architecture

```
Client → Fastify API → Filesystem Queue → Node.js Playwright Worker → Artifacts
                ↓
            SQLite DB
```

### Components

1. **API Server** (`server/`)
   - Fastify-based REST API
   - API key authentication
   - Request validation and SSRF protection
   - Job creation and status endpoints
   - Artifact serving

2. **Worker** (`worker/`)
   - Polls filesystem queue
   - Executes Playwright automation workflows
   - Updates job status in SQLite
   - Stores artifacts (screenshots, downloads)

3. **Queue** (`storage/queue/`)
   - `pending/` - New jobs waiting to be processed
   - `processing/` - Jobs currently being executed

## Tech Stack

- **API Server**: Fastify 5, Node.js 20+
- **Worker**: Node.js 20+, Playwright (Chromium)
- **Database**: SQLite (better-sqlite3)
- **Queue**: Filesystem-based (no Redis)
- **Auth**: API key-based (no sessions, no OAuth)

## Installation

### Prerequisites

- Node.js 20+
- npm or yarn

### Quick Setup

1. **Clone the repository**:
```bash
git clone <repository-url>
cd orbital-browser-automation
```

2. **Run setup script**:
```bash
# Linux/Mac
./setup.sh

# Windows
setup.bat
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env and set your API_KEYS
```

4. **Start the services**:
```bash
npm run start
```

This will start both the API server (port 3000) and the worker.

### Manual Setup

If you prefer manual setup:

1. **Install dependencies**:
```bash
# Server dependencies
cd server
npm install

# Worker dependencies
cd ../worker
npm install
npx playwright install chromium
```

2. **Create directories**:
```bash
mkdir -p storage/app/artifacts
mkdir -p storage/queue/pending
mkdir -p storage/queue/processing
mkdir -p database
mkdir -p worker/logs
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env and set your API_KEYS
```

4. **Start services**:
```bash
# Terminal 1: Start API server
npm run start:server

# Terminal 2: Start worker
npm run start:worker
```

## Configuration

Key environment variables in `.env`:

```env
# API Server
APP_URL=http://localhost:3000
PORT=3000
HOST=0.0.0.0

# Database
DB_DATABASE=database/database.sqlite

# Authentication
API_KEYS=your-secret-key-1,your-secret-key-2

# Worker (optional)
POLL_INTERVAL=1000  # Queue polling interval in ms
```

## API Documentation

### Authentication

All API requests require an API key:

```bash
# Via header
curl -H "X-API-Key: your-secret-key" ...

# Or via Authorization header
curl -H "Authorization: Bearer your-secret-key" ...
```

### Create Job

**POST** `/api/v1/jobs`

Create a new automation job.

**Request:**
```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com" },
      { "action": "wait", "duration": 5000 },
      { "action": "screenshot", "fullPage": true }
    ]
  },
  "options": {
    "timeout": 60000,
    "viewport": {
      "width": 1280,
      "height": 800
    }
  }
}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

### Get Job Status

**GET** `/api/v1/jobs/{id}`

Get the status and result of a job.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "completed",
  "created_at": "2026-02-20T12:00:00.000Z",
  "started_at": "2026-02-20T12:00:01.000Z",
  "finished_at": "2026-02-20T12:00:05.000Z",
  "result": {
    "artifacts": [
      {
        "type": "screenshot",
        "url": "http://localhost:3000/artifacts/{job_id}/screenshot-0.png",
        "filename": "screenshot-0.png",
        "step": 0
      }
    ],
    "steps_completed": 3
  }
}
```

### Health Check

**GET** `/health`

Check API server health (no auth required).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T12:00:00.000Z"
}
```

## Supported Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `goto` | Navigate to URL | `url` (string) |
| `wait` | Wait for duration | `duration` (number, ms) |
| `click` | Click element | `selector` (string) |
| `type` | Type text into element | `selector` (string), `value` (string) |
| `waitForSelector` | Wait for element | `selector` (string) |
| `screenshot` | Take screenshot | `fullPage` (boolean, optional) |
| `waitForDownload` | Wait for file download | none |
| `evaluate` | Execute JavaScript | `script` (string) |

## Security

Orbital includes several security features:

- **API Key Authentication**: Required for all endpoints (except `/health` and `/artifacts`)
- **SSRF Protection**: Rejects internal/private IP addresses
- **URL Validation**: Blocks `file://` URLs
- **Input Limits**: Max 50KB JSON, 25 steps per workflow
- **Timeout Controls**: 60s default, 120s max execution time
- **Sandboxing**: Worker runs in Chromium sandbox

## Example Workflows

### Basic Screenshot

```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://example.com" },
        { "action": "screenshot", "fullPage": true }
      ]
    }
  }'
```

### Form Automation

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com/form" },
      { "action": "waitForSelector", "selector": "#name" },
      { "action": "type", "selector": "#name", "value": "John Doe" },
      { "action": "type", "selector": "#email", "value": "john@example.com" },
      { "action": "click", "selector": "#submit" },
      { "action": "wait", "duration": 2000 },
      { "action": "screenshot", "fullPage": true }
    ]
  }
}
```

### JavaScript Evaluation

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com" },
      { "action": "evaluate", "script": "document.title" },
      { "action": "screenshot", "fullPage": false }
    ]
  }
}
```

## Deployment

### Production Recommendations

1. **Use a process manager** (PM2, systemd):

```bash
# Using PM2
pm2 start server/server.js --name orbital-api
pm2 start worker/worker.js --name orbital-worker
pm2 save
```

2. **Set up reverse proxy** (nginx):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase timeout for long-running jobs
    proxy_read_timeout 120s;
}
```

3. **Secure your API keys**: Use strong, random keys in production
4. **Enable HTTPS**: Use Let's Encrypt or similar
5. **Set resource limits**: Configure worker concurrency based on server capacity
6. **Monitor logs**: Check `worker/logs/` for job execution logs

### Scaling

For higher throughput:

1. **Run multiple workers**: Start additional worker processes
2. **Separate queue processing**: Workers automatically coordinate via filesystem
3. **Optimize queue polling**: Adjust `POLL_INTERVAL` based on load

### Backup

Important files to backup:
- `database/database.sqlite` - Job history
- `storage/app/artifacts/` - Generated files
- `.env` - Configuration

## Differences from Laravel Version

This refactored version removes:
- ❌ Laravel framework and all PHP dependencies
- ❌ Redis/external queue systems
- ❌ Composer and PHP-FPM
- ❌ Complex framework abstractions

Benefits:
- ✅ **Smaller footprint**: ~50MB vs ~200MB+ with Laravel
- ✅ **Faster startup**: <1s vs ~3s+
- ✅ **Simpler deployment**: Just Node.js, no PHP/nginx/FPM
- ✅ **Easier to understand**: ~500 LOC vs ~2000+ LOC
- ✅ **No external dependencies**: Everything runs locally

## Troubleshooting

### Worker not processing jobs

1. Check worker is running: `ps aux | grep worker`
2. Check queue directory permissions
3. Check worker logs: `worker/logs/`

### Database locked errors

SQLite uses WAL mode for concurrency, but if you still see locks:
1. Ensure only one worker is writing at a time
2. Check filesystem supports locking

### Jobs stuck in processing

Run this to requeue stale jobs:
```javascript
import { requeueStaleJobs } from './server/queue.js';
const requeued = requeueStaleJobs(10); // 10 minutes
console.log(`Requeued ${requeued} stale jobs`);
```

## License

This project is open-sourced software licensed under the MIT license.
