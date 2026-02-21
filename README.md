# Orbital - Headless Browser Automation Service

Orbital is a **minimal**, **production-ready** Headless Browser Automation Service built with Fastify, Redis (BullMQ), and SQLite. It accepts JSON-defined automation workflows via REST API, queues them using a robust message queue, and executes them via Playwright worker processes.

## Features

- 🚀 **Modern Stack**: Fastify + Redis (BullMQ) + SQLite
- 🎭 **Playwright-powered** browser automation
- 🔒 **Built-in security** (SSRF protection, input validation, API key auth)
- 💾 **Simple persistence**: SQLite for job tracking, Redis for queue
- 📦 **Docker-ready**: One-command deployment with docker-compose
- ⚡ **Fast and scalable**: Concurrent job processing, horizontal scaling
- 🌐 **Unique port configuration**: Deploy multiple instances easily

## Architecture

```
Client → Fastify API → Redis (BullMQ) → Node.js Playwright Workers → Artifacts
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
   - BullMQ-powered job processor
   - Executes Playwright automation workflows
   - Updates job status in SQLite
   - Stores artifacts (screenshots, downloads)
   - Concurrent processing (5 jobs per worker)

3. **Queue** (Redis + BullMQ)
   - Reliable message queue
   - Job retry with exponential backoff
   - Job prioritization and scheduling
   - Failed job management

## Tech Stack

- **API Server**: Fastify 5, Node.js 20+
- **Queue**: Redis 7 + BullMQ 5
- **Worker**: Node.js 20+, Playwright (Chromium)
- **Database**: SQLite (better-sqlite3)
- **Auth**: API key-based (no sessions, no OAuth)

## Quick Start with Docker 🐳

The fastest way to get started is with Docker:

```bash
# 1. Clone repository
git clone <repository-url>
cd orbital-browser-automation

# 2. Configure environment
cp .env.docker .env
# Edit .env and set your API_KEYS

# 3. Start all services
docker-compose up -d

# 4. Test the API
curl http://localhost:8092/health
```

That's it! The API is running on port 8092.

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker documentation.

## Installation (Non-Docker)

### Prerequisites

- Node.js 20+
- Redis 7+
- npm or yarn

### Setup

1. **Clone the repository**:
```bash
git clone <repository-url>
cd orbital-browser-automation
```

2. **Install dependencies**:
```bash
cd server && npm install
cd ../worker && npm install
npx playwright install chromium
```

3. **Start Redis**:
```bash
# Linux/Mac
redis-server

# Or with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

4. **Configure environment**:
```bash
cp .env.example .env
# Edit .env and set your API_KEYS and REDIS_URL
```

5. **Start services**:
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
APP_URL=http://localhost:8092
PORT=8092
HOST=0.0.0.0

# Redis (Queue)
REDIS_URL=redis://localhost:6379

# Database
DB_DATABASE=database/database.sqlite

# Authentication
API_KEYS=your-secret-key-1,your-secret-key-2
```

## API Documentation

### Authentication

All API requests (except `/health`) require an API key:

```bash
# Via header
curl -H "X-API-Key: your-secret-key" ...

# Or via Authorization header
curl -H "Authorization: Bearer your-secret-key" ...
```

### Create Job

**POST** `/api/v1/jobs`

```bash
curl -X POST http://localhost:8092/api/v1/jobs \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://example.com" },
        { "action": "wait", "duration": 2000 },
        { "action": "screenshot", "fullPage": true }
      ]
    },
    "options": {
      "timeout": 60000,
      "viewport": { "width": 1920, "height": 1080 }
    }
  }'
```

#### Get Job Status

**GET** `/api/v1/jobs/:id`

```bash
curl http://localhost:8092/api/v1/jobs/{job_id} \
  -H "X-API-Key: your-secret-key"
```

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
        "url": "http://localhost:8092/artifacts/{job_id}/screenshot-0.png",
        "filename": "screenshot-0.png",
        "step": 0
      }
    ],
    "steps_completed": 3
  }
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

- **API Key Authentication**: Required for all endpoints
- **SSRF Protection**: Rejects internal/private IP addresses
- **URL Validation**: Blocks `file://` URLs
- **Input Limits**: Max 50KB JSON, 25 steps per workflow
- **Timeout Controls**: 60s default, 120s max execution time
- **Sandboxing**: Worker runs in Chromium sandbox

## Deployment

### Docker (Recommended)

```bash
# Start with docker-compose
docker-compose up -d

# Scale workers
docker-compose up -d --scale worker=5

# View logs
docker-compose logs -f worker
```

### Production (Non-Docker)

1. **Use process manager** (PM2):
```bash
pm2 start server/server.js --name orbital-api
pm2 start worker/worker.js --name orbital-worker -i 4
pm2 save
```

2. **Set up reverse proxy** (nginx):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8092;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. **Secure with HTTPS**:
```bash
certbot --nginx -d your-domain.com
```

### Scaling

**Horizontal Scaling:**
- Run multiple worker instances
- Workers automatically coordinate via Redis
- Each worker processes 5 jobs concurrently

**Vertical Scaling:**
- Adjust worker concurrency in `worker/worker.js`
- Increase server resources (CPU/RAM)

## Monitoring

**Queue Statistics:**
```javascript
import { getQueueStats } from './server/queue.js';
const stats = await getQueueStats();
console.log(stats); // { waiting, active, completed, failed }
```

**Worker Logs:**
- Location: `worker/logs/{job_id}.log`
- Format: Timestamped execution trace

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
docker ps | grep redis
# Or
redis-cli ping

# Test connection
telnet localhost 6379
```

### Worker Not Processing Jobs

1. Check worker logs: `docker-compose logs worker`
2. Verify Redis connection
3. Check database permissions

### Jobs Stuck in Queue

```bash
# View queue via Redis CLI
docker exec -it orbital-redis redis-cli
> KEYS bull:automation-jobs:*
> LLEN bull:automation-jobs:wait
```

## Example Use Cases

### 1. Take a Screenshot

```bash
curl -X POST http://localhost:8092/api/v1/jobs \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://github.com" },
        { "action": "screenshot", "fullPage": true }
      ]
    }
  }'
```

### 2. Automated Form Filling

```bash
curl -X POST http://localhost:8092/api/v1/jobs \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://example.com/form" },
        { "action": "type", "selector": "input[name=email]", "value": "test@example.com" },
        { "action": "type", "selector": "input[name=name]", "value": "John Doe" },
        { "action": "click", "selector": "button[type=submit]" },
        { "action": "waitForSelector", "selector": ".success-message" },
        { "action": "screenshot" }
      ]
    }
  }'
```

### 3. Web Scraping

```bash
curl -X POST http://localhost:8092/api/v1/jobs \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        { "action": "goto", "url": "https://news.ycombinator.com" },
        { "action": "waitForSelector", "selector": ".titleline" },
        {
          "action": "evaluate",
          "script": "Array.from(document.querySelectorAll(\".titleline > a\")).map(a => ({ title: a.textContent, url: a.href }))"
        }
      ]
    }
  }'
```

## Differences from Previous Version

**Improvements:**
- ✅ **Redis Queue**: Replaced filesystem queue with BullMQ for reliability
- ✅ **Docker Ready**: Full Docker support with docker-compose
- ✅ **Better Scaling**: Multiple workers, concurrent processing
- ✅ **Configurable Ports**: Easy deployment on different ports (default: 8092)
- ✅ **Job Retry**: Automatic retry with exponential backoff
- ✅ **Better Monitoring**: Queue statistics and job tracking
- ✅ **JSON Workflows**: Flexible, dynamic action sequences

## License

This project is open-sourced software licensed under the MIT license.
