import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse .env file
function parseEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    const env = {};

    if (!fs.existsSync(envPath)) {
        return env;
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            value = value.replace(/^["'](.*)["']$/, '$1');
            env[key] = value;
        }
    });

    return env;
}

const env = parseEnv();

export default {
    // Server
    port: parseInt(process.env.PORT || env.PORT || '8058'),
    host: process.env.HOST || env.HOST || '0.0.0.0',
    appUrl: process.env.APP_URL || env.APP_URL || 'http://localhost:8058',

    // Database
    dbPath: process.env.DB_PATH || env.DB_DATABASE || path.join(__dirname, '..', 'database', 'database.sqlite'),

    // Redis
    redisUrl: process.env.REDIS_URL || env.REDIS_URL || 'redis://localhost:6379',

    // Storage
    storagePath: process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage', 'app', 'artifacts'),

    // Security
    apiKeys: (process.env.API_KEYS || env.API_KEYS || 'default-key-change-me').split(',').map(k => k.trim()),

    // Limits
    maxJsonSize: 50 * 1024, // 50KB
    maxSteps: 25,

    // Timeouts
    defaultTimeout: 60000,
    maxTimeout: 120000,

    // Allowed actions
    allowedActions: ['goto', 'wait', 'click', 'type', 'waitForSelector', 'screenshot', 'waitForDownload', 'evaluate']
};
