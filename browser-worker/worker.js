import { chromium } from 'playwright';
import { getJob, updateJob, closeConnection } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, '..', 'storage', 'app', 'artifacts');
const LOG_PATH = path.join(__dirname, 'logs');

// Ensure directories exist
if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

if (!fs.existsSync(LOG_PATH)) {
    fs.mkdirSync(LOG_PATH, { recursive: true });
}

class WorkflowExecutor {
    constructor(jobId) {
        this.jobId = jobId;
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

    async execute() {
        try {
            this.log(`Starting execution for job ${this.jobId}`);

            // Get job from database
            const job = await getJob(this.jobId);
            if (!job) {
                throw new Error(`Job ${this.jobId} not found`);
            }

            this.log(`Retrieved job: ${JSON.stringify(job.workflow_json)}`);

            const workflow = job.workflow_json.workflow;
            const options = job.workflow_json.options || {};

            // Default options
            const timeout = options.timeout || 60000;
            const viewport = options.viewport || { width: 1280, height: 800 };

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
            await updateJob(this.jobId, {
                status: 'completed',
                result_json: result,
                finished_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            });

        } catch (error) {
            this.log(`ERROR: ${error.message}`);
            this.log(`Stack: ${error.stack}`);

            await updateJob(this.jobId, {
                status: 'failed',
                error_message: error.message,
                finished_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            });

            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.log('Browser closed');
            }
            await closeConnection();
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

                const url = `${process.env.APP_URL || 'http://localhost'}/artifacts/${this.jobId}/${filename}`;
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

                const url = `${process.env.APP_URL || 'http://localhost'}/artifacts/${this.jobId}/${filename}`;
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

// Main execution
const jobId = process.argv[2];

if (!jobId) {
    console.error('Usage: node worker.js <job_id>');
    process.exit(1);
}

const executor = new WorkflowExecutor(jobId);
executor.execute()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Execution failed:', error);
        process.exit(1);
    });
