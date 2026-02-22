import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
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
            value = value.replace(/^["'](.*)["']$/, '$1');
            env[key] = value;
        }
    });

    return env;
}

const env = parseEnv();

const APP_URL = process.env.APP_URL || env.APP_URL || 'http://localhost:8058';
const DB_PATH = process.env.DB_PATH || env.DB_DATABASE || path.join(__dirname, '..', 'database', 'database.sqlite');
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage', 'app', 'artifacts');
const LOG_PATH = path.join(__dirname, 'logs');
const REDIS_URL = process.env.REDIS_URL || env.REDIS_URL || 'redis://localhost:6379';

// Ensure directories exist
for (const dir of [STORAGE_PATH, LOG_PATH]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

class WorkflowExecutor {
    constructor(jobId, db) {
        this.jobId = jobId;
        this.db = db;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.artifacts = [];
        this.logFile = path.join(LOG_PATH, `${jobId}.log`);
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(this.logFile, logMessage);
    }

    getJob() {
        const row = this.db.prepare('SELECT * FROM automation_jobs WHERE id = ?').get(this.jobId);
        if (!row) return null;

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

    updateJob(updates) {
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

        if (updates.started_at !== undefined) {
            sets.push('started_at = ?');
            values.push(updates.started_at);
        }

        if (updates.finished_at !== undefined) {
            sets.push('finished_at = ?');
            values.push(updates.finished_at);
        }

        sets.push('updated_at = datetime(\'now\')');
        values.push(this.jobId);

        const sql = `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`;
        this.db.prepare(sql).run(...values);
    }

    async execute() {
        try {
            this.log(`Starting execution for job ${this.jobId}`);

            // Get job from database
            const job = this.getJob();
            if (!job) {
                throw new Error(`Job ${this.jobId} not found`);
            }

            this.log(`Retrieved job: ${JSON.stringify(job.workflow_json)}`);

            const workflow = job.workflow_json.workflow;
            const options = job.workflow_json.options || {};

            // Default options
            const timeout = options.timeout || 60000;
            const viewport = options.viewport || { width: 1280, height: 800 };

            // Mark as running
            this.updateJob({
                status: 'running',
                started_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

            // Launch browser
            this.log('Launching Chromium...');
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.context = await this.browser.newContext({
                viewport: viewport,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            this.page = await this.context.newPage();

            // Set default timeout
            this.page.setDefaultTimeout(timeout);

            // Create artifact directory for this job
            const artifactDir = path.join(STORAGE_PATH, this.jobId);
            if (!fs.existsSync(artifactDir)) {
                fs.mkdirSync(artifactDir, { recursive: true });
            }

            // Execute workflow steps
            this.log(`Executing ${workflow.steps.length} steps...`);
            for (let i = 0; i < workflow.steps.length; i++) {
                const step = workflow.steps[i];
                this.log(`Step ${i + 1}: ${step.action}`);
                await this.executeStep(step, i, artifactDir);
            }

            // Mark as completed
            const result = {
                artifacts: this.artifacts,
                steps_completed: workflow.steps.length
            };

            this.log('Workflow completed successfully');
            this.updateJob({
                status: 'completed',
                result_json: result,
                finished_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

        } catch (error) {
            this.log(`ERROR: ${error.message}`);
            this.log(`Stack: ${error.stack}`);

            this.updateJob({
                status: 'failed',
                error_message: error.message,
                finished_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.log('Browser closed');
            }
        }
    }

    async executeStep(step, index, artifactDir) {
        const { action } = step;

        switch (action) {
            case 'goto':
                await this.page.goto(step.url, { waitUntil: 'networkidle' });
                break;

            case 'wait':
                await this.page.waitForTimeout(step.duration);
                break;

            case 'click':
                await this.page.click(step.selector);
                break;

            case 'type':
                await this.page.fill(step.selector, step.value);
                break;

            case 'waitForSelector':
                await this.page.waitForSelector(step.selector);
                break;

            case 'screenshot': {
                const filename = `screenshot-${index}.png`;
                const filepath = path.join(artifactDir, filename);

                await this.page.screenshot({
                    path: filepath,
                    fullPage: step.fullPage || false
                });

                const url = `${APP_URL}/artifacts/${this.jobId}/${filename}`;
                this.artifacts.push({
                    type: 'screenshot',
                    url: url,
                    filename: filename,
                    step: index
                });
                this.log(`Screenshot saved: ${filename}`);
                break;
            }

            case 'waitForDownload': {
                const downloadPromise = this.page.waitForEvent('download');
                const download = await downloadPromise;
                const filename = `download-${index}-${download.suggestedFilename()}`;
                const filepath = path.join(artifactDir, filename);
                await download.saveAs(filepath);

                const url = `${APP_URL}/artifacts/${this.jobId}/${filename}`;
                this.artifacts.push({
                    type: 'download',
                    url: url,
                    filename: filename,
                    step: index
                });
                this.log(`Download saved: ${filename}`);
                break;
            }

            case 'evaluate': {
                const result = await this.page.evaluate(step.script);
                this.log(`Evaluate result: ${JSON.stringify(result)}`);
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
}

// Create Redis connection for worker
const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

// Create database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create BullMQ worker
const worker = new Worker(
    'automation-jobs',
    async (job) => {
        console.log(`Processing job: ${job.data.id}`);

        const executor = new WorkflowExecutor(job.data.id, db);
        await executor.execute();

        console.log(`Job ${job.data.id} completed successfully`);
    },
    {
        connection,
        concurrency: 5, // Process up to 5 jobs concurrently
    }
);

worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with error: ${err.message}`);
});

console.log('Worker started - waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing worker...');
    await worker.close();
    await connection.quit();
    db.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing worker...');
    await worker.close();
    await connection.quit();
    db.close();
    process.exit(0);
});
