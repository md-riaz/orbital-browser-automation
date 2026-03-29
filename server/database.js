import Database from 'better-sqlite3';
import crypto from 'crypto';
import config from './config.js';
import fs from 'fs';
import path from 'path';

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS automation_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
            workflow_json TEXT NOT NULL,
            result_json TEXT,
            error_message TEXT,
            attempts INTEGER DEFAULT 0,
            api_key_id TEXT,
            api_key_label TEXT,
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            key_value TEXT NOT NULL UNIQUE,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_used_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at);
        CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
        CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys(created_at);
    `);

    addColumnIfMissing('automation_jobs', 'api_key_id', 'TEXT');
    addColumnIfMissing('automation_jobs', 'api_key_label', 'TEXT');
    bootstrapApiKeys();
}

function addColumnIfMissing(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!columns.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

function bootstrapApiKeys() {
    const existingValues = new Set(db.prepare('SELECT key_value FROM api_keys').all().map(r => r.key_value));
    const insert = db.prepare(`
        INSERT INTO api_keys (id, label, key_value, is_active, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
    `);

    config.apiKeys.forEach((key, index) => {
        if (!existingValues.has(key)) {
            insert.run(crypto.randomUUID(), `Bootstrap Key ${index + 1}`, key);
        }
    });
}

initializeDatabase();

export function createJob(id, workflowJson, apiKeyMeta = null) {
    const stmt = db.prepare(`
        INSERT INTO automation_jobs (id, status, workflow_json, api_key_id, api_key_label, created_at, updated_at)
        VALUES (?, 'pending', ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
        id,
        JSON.stringify(workflowJson),
        apiKeyMeta?.id || null,
        apiKeyMeta?.label || null
    );

    return getJob(id);
}

export function getJob(id) {
    const stmt = db.prepare('SELECT * FROM automation_jobs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return mapJob(row);
}

function mapJob(row) {
    return {
        id: row.id,
        status: row.status,
        workflow_json: JSON.parse(row.workflow_json),
        result_json: row.result_json ? JSON.parse(row.result_json) : null,
        error_message: row.error_message,
        attempts: row.attempts,
        api_key_id: row.api_key_id,
        api_key_label: row.api_key_label,
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

    const stmt = db.prepare(`UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return getJob(id);
}

export function listJobs(limit = 100, offset = 0, filters = {}) {
    const where = [];
    const values = [];

    if (filters.status) {
        where.push('status = ?');
        values.push(filters.status);
    }
    if (filters.api_key_label) {
        where.push('api_key_label LIKE ?');
        values.push(`%${filters.api_key_label}%`);
    }
    if (filters.q) {
        where.push('(id LIKE ? OR workflow_json LIKE ? OR result_json LIKE ? OR error_message LIKE ? OR api_key_label LIKE ?)');
        for (let i = 0; i < 5; i++) values.push(`%${filters.q}%`);
    }

    const sql = `
        SELECT * FROM automation_jobs
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    values.push(limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(...values).map(mapJob);
}

export function getJobStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM automation_jobs').get().count;
    const running = db.prepare("SELECT COUNT(*) as count FROM automation_jobs WHERE status = 'running'").get().count;
    const failed = db.prepare("SELECT COUNT(*) as count FROM automation_jobs WHERE status = 'failed'").get().count;
    const completed = db.prepare("SELECT COUNT(*) as count FROM automation_jobs WHERE status = 'completed'").get().count;
    return { total, running, failed, completed };
}

export function listApiKeys() {
    return db.prepare(`
        SELECT id, label, key_value, is_active, last_used_at, created_at
        FROM api_keys
        ORDER BY created_at DESC
    `).all().map(row => ({
        ...row,
        is_active: !!row.is_active
    }));
}

export function createApiKey(label) {
    const id = crypto.randomUUID();
    const keyValue = crypto.randomBytes(24).toString('hex');
    db.prepare(`
        INSERT INTO api_keys (id, label, key_value, is_active, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
    `).run(id, label || 'Untitled Key', keyValue);
    return getApiKeyById(id);
}

export function getApiKeyByValue(value) {
    const row = db.prepare(`SELECT id, label, key_value, is_active, last_used_at, created_at FROM api_keys WHERE key_value = ?`).get(value);
    return row ? { ...row, is_active: !!row.is_active } : null;
}

export function getApiKeyById(id) {
    const row = db.prepare(`SELECT id, label, key_value, is_active, last_used_at, created_at FROM api_keys WHERE id = ?`).get(id);
    return row ? { ...row, is_active: !!row.is_active } : null;
}

export function touchApiKeyUsage(id) {
    db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(id);
}

export function revokeApiKey(id) {
    db.prepare(`UPDATE api_keys SET is_active = 0 WHERE id = ?`).run(id);
}

export function deleteApiKey(id) {
    db.prepare(`DELETE FROM api_keys WHERE id = ?`).run(id);
}

export function rotateApiKey(id) {
    const keyValue = crypto.randomBytes(24).toString('hex');
    db.prepare(`UPDATE api_keys SET key_value = ?, is_active = 1, last_used_at = NULL WHERE id = ?`).run(keyValue, id);
    return getApiKeyById(id);
}

export default db;
