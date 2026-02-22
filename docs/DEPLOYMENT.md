# Deployment Guide for Orbital

This guide covers deploying Orbital on a Ubuntu 22.04 LTS VPS.

## Prerequisites

- Ubuntu 22.04 LTS VPS with at least 2GB RAM
- Root or sudo access
- Domain name pointing to your server (optional, for SSL)

## Step 1: Install Dependencies

### Update System
```bash
sudo apt update
sudo apt upgrade -y
```

### Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install Redis
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Install Nginx
```bash
sudo apt install -y nginx
```

### Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

## Step 2: Deploy Application

### Clone Repository
```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone <your-repo-url> orbital
cd orbital
```

### Install Dependencies
```bash
# Server dependencies
cd server
sudo npm install --production
cd ..

# Worker dependencies (postinstall will automatically install Chromium)
cd worker
sudo npm install --production

# Install system dependencies for Chromium (required on Linux)
sudo npx playwright install-deps chromium
cd ..
```

### Configure Environment
```bash
sudo cp .env.example .env
sudo nano .env
```

Update the following in `.env`:
```env
APP_NAME=Orbital
APP_ENV=production
APP_URL=https://your-domain.com
PORT=8058
HOST=0.0.0.0

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Database (SQLite)
DB_DATABASE=/var/www/orbital/database/database.sqlite

# API Keys (CHANGE THIS!)
API_KEYS=your-secure-random-key-here

# Storage
STORAGE_PATH=/var/www/orbital/storage/app/artifacts
```

### Set Permissions
```bash
sudo chown -R www-data:www-data /var/www/orbital
sudo chmod -R 755 /var/www/orbital
sudo mkdir -p /var/www/orbital/database
sudo mkdir -p /var/www/orbital/storage/app/artifacts
sudo mkdir -p /var/www/orbital/worker/logs
sudo chmod -R 775 /var/www/orbital/database
sudo chmod -R 775 /var/www/orbital/storage
sudo chmod -R 775 /var/www/orbital/worker/logs
```

### Initialize Database
The database will be automatically created when the server first starts.

## Step 3: Configure PM2

### Start Services
```bash
cd /var/www/orbital

# Start API server
pm2 start server/server.js --name orbital-api

# Start workers (4 instances for better performance)
pm2 start worker/worker.js --name orbital-worker -i 4

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command that PM2 outputs
```

### Verify Services
```bash
pm2 status
pm2 logs orbital-api
pm2 logs orbital-worker
```

## Step 4: Configure Nginx

Create nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/orbital
```

Add the following content:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API endpoints
    location / {
        proxy_pass http://localhost:8058;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for long-running jobs
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/orbital /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## Step 5: Configure SSL (Recommended)

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically update your nginx configuration for HTTPS.

## Step 6: Configure Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Maintenance

### View Logs
```bash
# PM2 logs
pm2 logs orbital-api
pm2 logs orbital-worker

# Worker execution logs
tail -f /var/www/orbital/worker/logs/*.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart Services
```bash
# Restart API server
pm2 restart orbital-api

# Restart workers
pm2 restart orbital-worker

# Restart all
pm2 restart all
```

### Update Application
```bash
cd /var/www/orbital
sudo git pull
cd server && sudo npm install --production && cd ..
cd worker && sudo npm install --production && cd ..
pm2 restart all
```

### Monitor Resources
```bash
pm2 monit
htop
```

## Performance Tuning

### Redis Optimization
Edit `/etc/redis/redis.conf`:
```ini
maxmemory 256mb
maxmemory-policy allkeys-lru
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

### Adjust Worker Count
For a 2GB VPS, 2-3 workers is recommended.
For a 4GB VPS, 4-5 workers is recommended.

```bash
pm2 delete orbital-worker
pm2 start worker/worker.js --name orbital-worker -i 5
pm2 save
```

### Node.js Memory Limit
For high-volume deployments:
```bash
pm2 delete orbital-api
pm2 start server/server.js --name orbital-api --max-memory-restart 500M
pm2 save
```

## Monitoring

### Queue Statistics
You can monitor queue health via Redis:
```bash
redis-cli
> KEYS bull:automation-jobs:*
> LLEN bull:automation-jobs:wait
> LLEN bull:automation-jobs:active
```

### Service Status
```bash
pm2 status
systemctl status redis-server
systemctl status nginx
```

### Disk Space
Monitor disk usage for artifacts:
```bash
du -sh /var/www/orbital/storage/app/artifacts
```

## Troubleshooting

### Chromium Installation Issues
If Playwright fails to install Chromium or you get "Executable doesn't exist" errors:

```bash
cd /var/www/orbital/worker

# Install Chromium browser binaries
sudo npx playwright install chromium

# Install system dependencies for Chromium (required)
sudo npx playwright install-deps chromium

# Or reinstall worker dependencies (postinstall will handle Chromium)
sudo rm -rf node_modules
sudo npm install --production
```

### Permission Issues
```bash
sudo chown -R www-data:www-data /var/www/orbital
sudo chmod -R 775 /var/www/orbital/storage
sudo chmod -R 775 /var/www/orbital/database
```

### Workers Not Processing Jobs
```bash
# Check Redis connection
redis-cli ping

# Check worker logs
pm2 logs orbital-worker

# Restart workers
pm2 restart orbital-worker
```

### Database Locked Errors
SQLite can have locking issues under high concurrency:
```bash
# The app uses WAL mode by default, but verify:
sqlite3 /var/www/orbital/database/database.sqlite "PRAGMA journal_mode;"
# Should output: wal
```

### High Memory Usage
```bash
# Check which process is using memory
pm2 monit

# Restart specific worker
pm2 restart orbital-worker

# Add memory limits
pm2 delete orbital-worker
pm2 start worker/worker.js --name orbital-worker -i 4 --max-memory-restart 400M
pm2 save
```

## Security Best Practices

1. **Use Strong API Keys**: Generate with `openssl rand -hex 32`
2. **Keep System Updated**: Run `sudo apt update && sudo apt upgrade` regularly
3. **Limit SSH Access**: Use SSH keys, disable password authentication
4. **Monitor Logs**: Regularly check for suspicious activity
5. **Rate Limiting**: Configure nginx rate limits (already in config above)
6. **Firewall**: Only open necessary ports
7. **HTTPS Only**: Always use SSL/TLS in production

## Backup

### Database Backup
```bash
# Backup SQLite database
cp /var/www/orbital/database/database.sqlite /backup/database-$(date +%Y%m%d).sqlite

# Automated daily backup (add to crontab)
0 2 * * * cp /var/www/orbital/database/database.sqlite /backup/database-$(date +\%Y\%m\%d).sqlite
```

### Artifacts Backup
```bash
# Backup artifacts
tar -czf /backup/artifacts-$(date +%Y%m%d).tar.gz /var/www/orbital/storage/app/artifacts
```

## Scaling

### Horizontal Scaling
For high traffic, you can:
1. Run multiple server instances with a load balancer
2. Use a shared Redis instance
3. Mount shared storage (NFS/S3) for artifacts

### Vertical Scaling
- Increase server RAM/CPU
- Add more PM2 worker instances
- Increase Redis memory limit
