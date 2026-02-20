# Quick Start Guide

Get Orbital running in under 5 minutes.

## Prerequisites

- PHP 8.3+
- Node.js 20+
- Composer

## Installation Steps

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/md-riaz/orbital-browser-automation.git
cd orbital-browser-automation

# Install PHP dependencies
composer install

# Install Node.js dependencies
cd browser-worker
npm install
npx playwright install chromium
cd ..
```

### 2. Configure Environment

```bash
# Create .env file
cp .env.example .env

# Create SQLite database
touch database/database.sqlite

# Generate application key
php artisan key:generate

# Run migrations
php artisan migrate
```

### 3. Start Services

**Terminal 1 - Laravel Server:**
```bash
php artisan serve
```

**Terminal 2 - Queue Worker:**
```bash
php artisan queue:work --tries=1
```

## Test the API

### Create a Job

```bash
curl -X POST http://localhost:8000/api/v1/jobs \
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
curl http://localhost:8000/api/v1/jobs/{job_id}
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
        "url": "http://localhost/artifacts/{job_id}/screenshot-0.png"
      }
    ]
  }
}
```

## What's Next?

- Check `docs/EXAMPLES.md` for more workflow examples
- See `docs/DEPLOYMENT.md` for production setup
- View `docs/TEST_RESULTS.txt` for complete test verification

## Troubleshooting

### "Chromium not found"
```bash
cd browser-worker
npx playwright install chromium
```

### "Permission denied" errors
```bash
chmod -R 775 storage bootstrap/cache
```

### Queue not processing
Make sure the queue worker is running:
```bash
php artisan queue:work --tries=1
```
