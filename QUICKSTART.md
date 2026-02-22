# Quick Start Guide

Get Orbital running in under 5 minutes.

## Prerequisites

- Node.js 20+
- Redis 7+

## Installation Steps

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/md-riaz/orbital-browser-automation.git
cd orbital-browser-automation

# Install server dependencies
cd server
npm install
cd ..

# Install worker dependencies (automatically installs Chromium)
cd worker
npm install

# On Linux, install system dependencies for Chromium
npx playwright install-deps chromium
cd ..
```

### 2. Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env and set your API_KEYS
nano .env
```

### 3. Start Redis

```bash
# Option 1: Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Option 2: Using system Redis (Linux/Mac)
redis-server
```

### 4. Start Services

**Terminal 1 - API Server:**
```bash
npm run start:server
```

**Terminal 2 - Worker:**
```bash
npm run start:worker
```

**Or start both:**
```bash
npm start
```

## Test the API

### Create a Job

```bash
curl -X POST http://localhost:8058/api/v1/jobs \
  -H "X-API-Key: your-secret-api-key-change-me" \
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

Response:
```json
{
  "job_id": "uuid-here",
  "status": "pending"
}
```

### Check Job Status

```bash
curl http://localhost:8058/api/v1/jobs/{job_id} \
  -H "X-API-Key: your-secret-api-key-change-me"
```

Response:
```json
{
  "job_id": "uuid-here",
  "status": "completed",
  "result": {
    "artifacts": [
      {
        "type": "screenshot",
        "url": "http://localhost:8058/artifacts/{job_id}/screenshot-0.png"
      }
    ]
  }
}
```

## What's Next?

- Check [docs/EXAMPLES.md](docs/EXAMPLES.md) for more workflow examples
- See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production setup
- View [docs/DOCKER.md](docs/DOCKER.md) for Docker deployment

## Troubleshooting

### "Chromium not found" or "Executable doesn't exist"
```bash
cd worker

# Install Chromium browser binaries
npx playwright install chromium

# Install system dependencies (Linux only)
npx playwright install-deps chromium
```

### "Redis connection refused"
Make sure Redis is running:
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Or start Redis with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Worker not processing jobs
Make sure the worker is running:
```bash
npm run start:worker
```
