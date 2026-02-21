# Docker Deployment Guide

## Quick Start with Docker

1. **Copy environment file**:
   ```bash
   cp .env.docker .env
   # Edit .env and set your API_KEYS
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f
   ```

4. **Stop services**:
   ```bash
   docker-compose down
   ```

## Services

The Docker setup includes:

- **Redis**: Message queue backend (port 6379)
- **Server**: Fastify API server (port 8092)
- **Worker**: Playwright automation workers (2 replicas by default)

## Port Configuration

By default, the following ports are exposed:

- API Server: `8092` (configurable via `PORT` env var)
- Redis: `6379` (configurable via `REDIS_PORT` env var)

To use different ports, set them in your `.env` file:

```env
PORT=8080
REDIS_PORT=6380
APP_URL=http://localhost:8080
```

## Scaling Workers

Adjust the number of worker instances:

```bash
# In .env file
WORKER_REPLICAS=5

# Or via command line
docker-compose up -d --scale worker=5
```

## Volume Mounts

The following directories are mounted as volumes:

- `./database` - SQLite database persistence
- `./storage/app/artifacts` - Generated screenshots, downloads
- `./worker/logs` - Worker execution logs

## Production Deployment

1. **Use strong API keys**:
   ```bash
   # Generate a random key
   openssl rand -hex 32
   ```

2. **Configure external URL**:
   ```env
   APP_URL=https://your-domain.com
   ```

3. **Add reverse proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:8092;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

4. **Enable SSL** with Let's Encrypt:
   ```bash
   certbot --nginx -d your-domain.com
   ```

## Monitoring

View service status:
```bash
docker-compose ps
```

View resource usage:
```bash
docker stats
```

Access Redis CLI:
```bash
docker exec -it orbital-redis redis-cli
```

## Troubleshooting

**Worker can't connect to Redis:**
- Ensure Redis container is healthy: `docker-compose ps`
- Check Redis logs: `docker-compose logs redis`

**Permission issues with volumes:**
```bash
sudo chown -R $USER:$USER database storage
```

**Reset everything:**
```bash
docker-compose down -v
rm -rf database/*.sqlite*
docker-compose up -d
```
