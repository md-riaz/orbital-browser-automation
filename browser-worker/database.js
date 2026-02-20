import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse Laravel .env file
function parseEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};

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

// For SQLite, we'll use a simple approach
const DB_CONNECTION = env.DB_CONNECTION || 'sqlite';

let pool = null;

if (DB_CONNECTION === 'mysql') {
    pool = mysql.createPool({
        host: env.DB_HOST || '127.0.0.1',
        port: env.DB_PORT || 3306,
        user: env.DB_USERNAME || 'root',
        password: env.DB_PASSWORD || '',
        database: env.DB_DATABASE || 'laravel',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });
}

export async function getJob(jobId) {
    if (DB_CONNECTION === 'sqlite') {
        // For SQLite, we'll use a different approach
        const sqlite3 = await import('better-sqlite3');
        const dbPath = path.join(__dirname, '..', env.DB_DATABASE || 'database/database.sqlite');
        const db = sqlite3.default(dbPath);
        const row = db.prepare('SELECT * FROM automation_jobs WHERE id = ?').get(jobId);
        db.close();

        if (row) {
            return {
                id: row.id,
                status: row.status,
                workflow_json: JSON.parse(row.workflow_json),
                result_json: row.result_json ? JSON.parse(row.result_json) : null,
                error_message: row.error_message,
                attempts: row.attempts,
                started_at: row.started_at,
                finished_at: row.finished_at,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        }
        return null;
    } else {
        const [rows] = await pool.execute(
            'SELECT * FROM automation_jobs WHERE id = ?',
            [jobId]
        );

        if (rows.length === 0) {
            return null;
        }

        const job = rows[0];
        return {
            ...job,
            workflow_json: JSON.parse(job.workflow_json),
            result_json: job.result_json ? JSON.parse(job.result_json) : null
        };
    }
}

export async function updateJob(jobId, updates) {
    const sets = [];
    const values = [];

    if (updates.status) {
        sets.push('status = ?');
        values.push(updates.status);
    }

    if (updates.result_json) {
        sets.push('result_json = ?');
        values.push(JSON.stringify(updates.result_json));
    }

    if (updates.error_message !== undefined) {
        sets.push('error_message = ?');
        values.push(updates.error_message);
    }

    if (updates.finished_at) {
        sets.push('finished_at = ?');
        values.push(updates.finished_at);
    }

    sets.push('updated_at = ?');
    values.push(new Date().toISOString().slice(0, 19).replace('T', ' '));

    values.push(jobId);

    if (DB_CONNECTION === 'sqlite') {
        const sqlite3 = await import('better-sqlite3');
        const dbPath = path.join(__dirname, '..', env.DB_DATABASE || 'database/database.sqlite');
        const db = sqlite3.default(dbPath);
        const sql = `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...values);
        db.close();
    } else {
        await pool.execute(
            `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`,
            values
        );
    }
}

export async function closeConnection() {
    if (pool) {
        await pool.end();
    }
}
