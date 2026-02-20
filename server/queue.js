import { Queue } from 'bullmq';
import Redis from 'ioredis';
import config from './config.js';

// Create Redis connection
const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

// Create BullMQ queue
export const jobQueue = new Queue('automation-jobs', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
            count: 5000, // Keep last 5000 failed jobs
        },
    },
});

/**
 * Enqueue a job
 */
export async function enqueue(jobId, jobData) {
    await jobQueue.add('execute-workflow', jobData, {
        jobId: jobId,
    });
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
        jobQueue.getWaitingCount(),
        jobQueue.getActiveCount(),
        jobQueue.getCompletedCount(),
        jobQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
}

/**
 * Close the queue connection
 */
export async function closeQueue() {
    await jobQueue.close();
    await connection.quit();
}
