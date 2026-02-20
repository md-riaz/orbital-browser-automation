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

### Install PHP 8.3
```bash
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install -y php8.3 php8.3-fpm php8.3-cli php8.3-common php8.3-mysql \
    php8.3-zip php8.3-gd php8.3-mbstring php8.3-curl php8.3-xml php8.3-bcmath \
    php8.3-sqlite3
```

### Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install Composer
```bash
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

### Install Nginx
```bash
sudo apt install -y nginx
```

### Install MySQL (Optional, if not using SQLite)
```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### Install Supervisor
```bash
sudo apt install -y supervisor
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
# PHP dependencies
sudo composer install --optimize-autoloader --no-dev

# Node.js dependencies
cd browser-worker
sudo npm install --production
sudo npx playwright install chromium
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
APP_DEBUG=false
APP_URL=https://your-domain.com

DB_CONNECTION=sqlite
QUEUE_CONNECTION=database

LOG_CHANNEL=stack
LOG_LEVEL=error
```

### Set Permissions
```bash
sudo chown -R www-data:www-data /var/www/orbital
sudo chmod -R 755 /var/www/orbital
sudo chmod -R 775 /var/www/orbital/storage
sudo chmod -R 775 /var/www/orbital/bootstrap/cache
```

### Generate Application Key
```bash
sudo php artisan key:generate
```

### Run Migrations
```bash
sudo php artisan migrate --force
```

### Optimize
```bash
sudo php artisan config:cache
sudo php artisan route:cache
sudo php artisan view:cache
```

## Step 3: Configure Nginx

```bash
sudo cp docs/nginx.conf /etc/nginx/sites-available/orbital
sudo ln -s /etc/nginx/sites-available/orbital /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## Step 4: Configure Supervisor

```bash
sudo cp docs/supervisor.conf /etc/supervisor/conf.d/orbital-worker.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start orbital-queue-worker:*
```

## Step 5: Configure SSL (Optional but Recommended)

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

## Step 6: Configure Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Maintenance

### View Queue Worker Logs
```bash
sudo tail -f /var/www/orbital/storage/logs/worker.log
```

### View Application Logs
```bash
sudo tail -f /var/www/orbital/storage/logs/laravel.log
```

### Restart Queue Workers
```bash
sudo supervisorctl restart orbital-queue-worker:*
```

### Update Application
```bash
cd /var/www/orbital
sudo git pull
sudo composer install --optimize-autoloader --no-dev
cd browser-worker && sudo npm install --production && cd ..
sudo php artisan migrate --force
sudo php artisan config:cache
sudo php artisan route:cache
sudo php artisan view:cache
sudo supervisorctl restart orbital-queue-worker:*
```

## Performance Tuning

### PHP-FPM Optimization
Edit `/etc/php/8.3/fpm/pool.d/www.conf`:
```ini
pm = dynamic
pm.max_children = 10
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
pm.max_requests = 500
```

### Adjust Queue Workers
For a 2GB VPS, 3 concurrent workers is recommended.
For a 4GB VPS, increase to 5 workers in `docs/supervisor.conf`.

## Monitoring

### Check Queue Status
```bash
php artisan queue:monitor
```

### Check Worker Status
```bash
sudo supervisorctl status
```

## Troubleshooting

### Chromium Installation Issues
If Playwright fails to install Chromium:
```bash
cd browser-worker
sudo npx playwright install-deps chromium
sudo npx playwright install chromium
```

### Permission Issues
```bash
sudo chown -R www-data:www-data /var/www/orbital
sudo chmod -R 775 /var/www/orbital/storage
```

### Queue Not Processing
```bash
sudo supervisorctl restart orbital-queue-worker:*
php artisan queue:work --once
```
