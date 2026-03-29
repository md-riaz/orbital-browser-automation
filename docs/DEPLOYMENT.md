# Deployment Guide for Orbital

This guide covers deploying Orbital on a VPS with HTTPS and an admin UI.

## What gets deployed

- Fastify API server
- Redis queue backend
- one or more Playwright workers
- SQLite database file
- admin web UI
- Swagger docs for the public API

## Current auth model

Orbital now uses:
- **API-key-only auth** for `/api/v1/*`
- **admin username/password** for `/admin/*`

Public health endpoint:
- `GET /health`

## Recommended deployment: Docker + reverse proxy

### 1. Clone

```bash
git clone https://github.com/md-riaz/orbital-browser-automation.git
cd orbital-browser-automation
```

### 2. Configure `.env`

```bash
cp .env.example .env
nano .env
```

Example:

```env
APP_NAME=Orbital
APP_ENV=production
APP_URL=https://your-domain.com
PORT=8058
HOST=0.0.0.0
REDIS_URL=redis://localhost:6379
DB_DATABASE=database/database.sqlite
API_KEYS=bootstrap-key-change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_SESSION_SECRET=change-this-session-secret
STORAGE_PATH=storage/app/artifacts
```

### 3. Start the stack

```bash
docker compose up -d --build
```

### 4. Put Nginx/Caddy in front

Proxy the app to `localhost:8058`.

Example Nginx block:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8058;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then secure it:

```bash
certbot --nginx -d your-domain.com
```

## Post-deploy checklist

### Public routes
- `/health`
- `/docs`
- `/docs/json`
- `/api/v1/jobs`
- `/api/v1/jobs/{id}`
- `/artifacts/...`

### Admin routes
- `/admin/login`
- `/admin`
- `/admin/api-keys`
- `/admin/jobs`

## Recommended first-run admin steps

1. log into `/admin/login`
2. create a named API key for each client/app
3. test the API with `X-API-Key`
4. rotate or revoke the bootstrap `.env` key
5. monitor jobs from `/admin/jobs`

## Operational notes

### API key management
The admin panel can:
- create keys
- rotate keys
- revoke keys
- delete keys

### Job monitoring
The admin jobs page supports:
- status filtering
- API key label filtering
- text search over job id / payload / result / error

### Swagger
Swagger documents only the public API.
Admin routes should remain hidden from the docs.

## Backups

Back up:
- SQLite database (`database/database.sqlite`)
- artifact storage (`storage/app/artifacts`)

## Security guidance

- rotate bootstrap keys after first login
- do not expose Redis publicly
- use HTTPS only in production
- choose a strong admin password
- keep admin login private and not linked publicly
