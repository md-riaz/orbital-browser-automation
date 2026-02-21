#!/bin/bash

# Orbital Browser Automation - Startup Script

echo "Starting Orbital Browser Automation..."

# Create necessary directories
mkdir -p storage/app/artifacts
mkdir -p storage/queue/pending
mkdir -p storage/queue/processing
mkdir -p database
mkdir -p worker/logs

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Please edit .env and set your API_KEYS before continuing."
    exit 1
fi

# Install server dependencies
echo "Installing server dependencies..."
cd server
npm install

# Install worker dependencies
echo "Installing worker dependencies..."
cd ../worker
npm install
npx playwright install chromium

cd ..

echo ""
echo "Setup complete!"
echo ""
echo "To start the services:"
echo "  1. Start the API server:  npm run start:server"
echo "  2. Start the worker:      npm run start:worker"
echo ""
echo "Or start both with:        npm run start"
echo ""
