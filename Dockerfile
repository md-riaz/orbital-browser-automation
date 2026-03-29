# Multi-stage build for API server
FROM node:20-bookworm-slim AS server

# Install build/runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/

# Install dependencies
RUN cd server && npm ci --omit=dev

# Copy code
COPY server ./server

# Create necessary directories
RUN mkdir -p /app/storage/app/artifacts /app/database

# Expose port
EXPOSE 8058

# Start server
CMD ["node", "server/server.js"]

# Production stage for worker
FROM node:20-alpine AS worker

WORKDIR /app

# Install Playwright dependencies and build tools for better-sqlite3
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++

# Set Playwright environment variables
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files and postinstall script
COPY worker/package*.json ./worker/
COPY worker/postinstall.js ./worker/

# Install dependencies
RUN cd worker && npm ci --only=production

# Remove pre-built binaries and rebuild from source for Alpine
RUN cd worker && \
    rm -rf node_modules/better-sqlite3/build && \
    npm rebuild better-sqlite3 --build-from-source

# Copy code
COPY worker ./worker
COPY .env.example ./.env

# Create necessary directories
RUN mkdir -p /app/storage/app/artifacts /app/worker/logs /app/database

# Start worker
CMD ["node", "worker/worker.js"]
