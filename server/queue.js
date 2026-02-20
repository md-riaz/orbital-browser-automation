import fs from 'fs';
import path from 'path';
import config from './config.js';

const QUEUE_PATH = config.queuePath;
const PENDING_PATH = path.join(QUEUE_PATH, 'pending');
const PROCESSING_PATH = path.join(QUEUE_PATH, 'processing');

// Ensure queue directories exist
for (const dir of [QUEUE_PATH, PENDING_PATH, PROCESSING_PATH]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Enqueue a job by writing to the pending directory
 */
export function enqueue(jobId, jobData) {
    const filename = `${jobId}.json`;
    const filepath = path.join(PENDING_PATH, filename);
    fs.writeFileSync(filepath, JSON.stringify(jobData), 'utf-8');
}

/**
 * Dequeue the next pending job (moves to processing)
 * Returns null if no jobs available
 */
export function dequeue() {
    const files = fs.readdirSync(PENDING_PATH)
        .filter(f => f.endsWith('.json'))
        .sort(); // Process in order

    if (files.length === 0) {
        return null;
    }

    const filename = files[0];
    const jobId = filename.replace('.json', '');
    const pendingPath = path.join(PENDING_PATH, filename);
    const processingPath = path.join(PROCESSING_PATH, filename);

    // Move from pending to processing
    try {
        const data = fs.readFileSync(pendingPath, 'utf-8');
        fs.writeFileSync(processingPath, data, 'utf-8');
        fs.unlinkSync(pendingPath);

        return {
            jobId,
            data: JSON.parse(data)
        };
    } catch (error) {
        console.error(`Failed to dequeue job ${jobId}:`, error);
        return null;
    }
}

/**
 * Remove a job from processing queue (after completion)
 */
export function removeFromProcessing(jobId) {
    const filename = `${jobId}.json`;
    const filepath = path.join(PROCESSING_PATH, filename);

    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
    const pending = fs.readdirSync(PENDING_PATH).filter(f => f.endsWith('.json')).length;
    const processing = fs.readdirSync(PROCESSING_PATH).filter(f => f.endsWith('.json')).length;

    return { pending, processing };
}

/**
 * Requeue stale jobs from processing back to pending
 * (useful for recovery after crashes)
 */
export function requeueStaleJobs(maxAgeMinutes = 10) {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    const files = fs.readdirSync(PROCESSING_PATH).filter(f => f.endsWith('.json'));

    let requeued = 0;
    for (const filename of files) {
        const filepath = path.join(PROCESSING_PATH, filename);
        const stats = fs.statSync(filepath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
            const pendingPath = path.join(PENDING_PATH, filename);
            fs.renameSync(filepath, pendingPath);
            requeued++;
        }
    }

    return requeued;
}
