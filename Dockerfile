# Multi-stage build for API server
FROM node:20-alpine AS base

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY worker/package*.json ./worker/
COPY package.json ./

# Install dependencies
RUN cd server && npm ci --only=production
RUN cd worker && npm ci --only=production

# Production stage for server
FROM node:20-alpine AS server

WORKDIR /app

# Copy dependencies and code
COPY --from=base /app/server/node_modules ./server/node_modules
COPY server ./server
COPY .env.example ./.env

# Create necessary directories
RUN mkdir -p /app/storage/app/artifacts /app/database

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]

# Production stage for worker
FROM node:20-alpine AS worker

WORKDIR /app

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright environment variables
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy dependencies and code
COPY --from=base /app/worker/node_modules ./worker/node_modules
COPY worker ./worker
COPY .env.example ./.env

# Create necessary directories
RUN mkdir -p /app/storage/app/artifacts /app/worker/logs /app/database

# Start worker
CMD ["node", "worker/worker.js"]
