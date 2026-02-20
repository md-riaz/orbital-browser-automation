import Database from 'better-sqlite3';
import config from './config.js';
import fs from 'fs';
import path from 'path';

// Ensure database directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

// Initialize database schema
function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS automation_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
            workflow_json TEXT NOT NULL,
            result_json TEXT,
            error_message TEXT,
            attempts INTEGER DEFAULT 0,
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at);
    `);
}

initializeDatabase();

export function createJob(id, workflowJson) {
    const stmt = db.prepare(`
        INSERT INTO automation_jobs (id, status, workflow_json, created_at, updated_at)
        VALUES (?, 'pending', ?, datetime('now'), datetime('now'))
    `);

    stmt.run(id, JSON.stringify(workflowJson));

    return getJob(id);
}

export function getJob(id) {
    const stmt = db.prepare('SELECT * FROM automation_jobs WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
        return null;
    }

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

export function updateJob(id, updates) {
    const sets = [];
    const values = [];

    if (updates.status !== undefined) {
        sets.push('status = ?');
        values.push(updates.status);
    }

    if (updates.result_json !== undefined) {
        sets.push('result_json = ?');
        values.push(JSON.stringify(updates.result_json));
    }

    if (updates.error_message !== undefined) {
        sets.push('error_message = ?');
        values.push(updates.error_message);
    }

    if (updates.attempts !== undefined) {
        sets.push('attempts = ?');
        values.push(updates.attempts);
    }

    if (updates.started_at !== undefined) {
        sets.push('started_at = ?');
        values.push(updates.started_at);
    }

    if (updates.finished_at !== undefined) {
        sets.push('finished_at = ?');
        values.push(updates.finished_at);
    }

    sets.push('updated_at = datetime(\'now\')');
    values.push(id);

    const sql = `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(...values);

    return getJob(id);
}

export function listJobs(limit = 100, offset = 0) {
    const stmt = db.prepare(`
        SELECT * FROM automation_jobs
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset);

    return rows.map(row => ({
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
    }));
}

export default db;
