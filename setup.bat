@echo off
REM Orbital Browser Automation - Startup Script (Windows)

echo Starting Orbital Browser Automation...

REM Create necessary directories
if not exist "storage\app\artifacts" mkdir storage\app\artifacts
if not exist "storage\queue\pending" mkdir storage\queue\pending
if not exist "storage\queue\processing" mkdir storage\queue\processing
if not exist "database" mkdir database
if not exist "worker\logs" mkdir worker\logs

REM Check if .env exists
if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Please edit .env and set your API_KEYS before continuing.
    exit /b 1
)

REM Install server dependencies
echo Installing server dependencies...
cd server
call npm install

REM Install worker dependencies
echo Installing worker dependencies...
cd ..\worker
call npm install
call npx playwright install chromium

cd ..

echo.
echo Setup complete!
echo.
echo To start the services:
echo   1. Start the API server:  npm run start:server
echo   2. Start the worker:      npm run start:worker
echo.
echo Or start both with:        npm run start
echo.
