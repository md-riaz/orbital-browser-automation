import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { createJob, getJob } from './database.js';
import { enqueue } from './queue.js';
import { validateUrl, validateStep } from './validation.js';
import { workflowTemplates, interpolateTemplate } from './workflows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
    logger: {
        level: 'info'
    },
    bodyLimit: config.maxJsonSize
});

// API Key authentication middleware
fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') {
        return;
    }

    // Skip auth for artifacts (public read)
    if (request.url.startsWith('/artifacts/')) {
        return;
    }

    const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey || !config.apiKeys.includes(apiKey)) {
        reply.code(401).send({ error: 'Unauthorized: Invalid or missing API key' });
    }
});

// Health check endpoint
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

// Serve artifacts
fastify.register(fastifyStatic, {
    root: config.storagePath,
    prefix: '/artifacts/',
    decorateReply: false
});

// Create job endpoint
fastify.post('/api/v1/jobs', async (request, reply) => {
    const body = request.body;

    // Validate workflow structure
    if (!body.workflow || typeof body.workflow !== 'object') {
        return reply.code(422).send({
            error: 'Validation failed',
            details: { workflow: ['workflow is required and must be an object'] }
        });
    }

    if (!Array.isArray(body.workflow.steps)) {
        return reply.code(422).send({
            error: 'Validation failed',
            details: { 'workflow.steps': ['steps is required and must be an array'] }
        });
    }

    if (body.workflow.steps.length === 0) {
        return reply.code(422).send({
            error: 'Validation failed',
            details: { 'workflow.steps': ['steps must contain at least 1 item'] }
        });
    }

    if (body.workflow.steps.length > config.maxSteps) {
        return reply.code(422).send({
            error: 'Validation failed',
            details: { 'workflow.steps': [`steps must not have more than ${config.maxSteps} items`] }
        });
    }

    // Validate options
    if (body.options) {
        if (body.options.timeout !== undefined) {
            if (typeof body.options.timeout !== 'number' || body.options.timeout < 1000 || body.options.timeout > config.maxTimeout) {
                return reply.code(422).send({
                    error: 'Validation failed',
                    details: { 'options.timeout': [`timeout must be between 1000 and ${config.maxTimeout}`] }
                });
            }
        }

        if (body.options.viewport) {
            if (!body.options.viewport.width || !body.options.viewport.height) {
                return reply.code(422).send({
                    error: 'Validation failed',
                    details: { 'options.viewport': ['both width and height are required'] }
                });
            }

            if (body.options.viewport.width < 100 || body.options.viewport.width > 3840 ||
                body.options.viewport.height < 100 || body.options.viewport.height > 2160) {
                return reply.code(422).send({
                    error: 'Validation failed',
                    details: { 'options.viewport': ['width must be 100-3840, height must be 100-2160'] }
                });
            }
        }
    }

    // Validate each step
    for (let i = 0; i < body.workflow.steps.length; i++) {
        const step = body.workflow.steps[i];

        // Check action is allowed
        if (!step.action || !config.allowedActions.includes(step.action)) {
            return reply.code(422).send({
                error: 'Validation failed',
                details: { [`workflow.steps.${i}.action`]: [`action must be one of: ${config.allowedActions.join(', ')}`] }
            });
        }

        // Validate step parameters
        const stepErrors = validateStep(step);
        if (stepErrors.length > 0) {
            return reply.code(422).send({
                error: `Step ${i} validation failed`,
                details: stepErrors
            });
        }

        // Security: Check for SSRF and file:// URLs
        if (step.url) {
            const urlError = await validateUrl(step.url);
            if (urlError) {
                return reply.code(422).send({
                    error: `Step ${i}: ${urlError}`
                });
            }
        }
    }

    // Create job
    const jobId = uuidv4();
    const job = createJob(jobId, body);

    // Enqueue job
    enqueue(jobId, { id: jobId, workflow: body });

    return reply.code(201).send({
        job_id: job.id,
        status: job.status
    });
});

// Get job status endpoint
fastify.get('/api/v1/jobs/:id', async (request, reply) => {
    const { id } = request.params;

    const job = getJob(id);

    if (!job) {
        return reply.code(404).send({
            error: 'Job not found'
        });
    }

    const response = {
        job_id: job.id,
        status: job.status,
        created_at: job.created_at
    };

    if (job.status === 'completed' && job.result_json) {
        response.result = job.result_json;
    }

    if (job.status === 'failed' && job.error_message) {
        response.error = job.error_message;
    }

    if (job.started_at) {
        response.started_at = job.started_at;
    }

    if (job.finished_at) {
        response.finished_at = job.finished_at;
    }

    return response;
});

// Get workflow templates
fastify.get('/api/v1/templates', async () => {
    const templates = Object.entries(workflowTemplates).map(([id, template]) => ({
        id,
        name: template.name,
        description: template.description,
        parameters: template.parameters
    }));

    return { templates };
});

// Get specific template
fastify.get('/api/v1/templates/:id', async (request, reply) => {
    const { id } = request.params;
    const template = workflowTemplates[id];

    if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
    }

    return { id, ...template };
});

// Create job from template
fastify.post('/api/v1/templates/:id/jobs', async (request, reply) => {
    const { id } = request.params;
    const template = workflowTemplates[id];

    if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
    }

    const params = request.body.parameters || {};

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(template.parameters)) {
        if (paramDef.required && !params[paramName]) {
            return reply.code(422).send({
                error: 'Validation failed',
                details: { [paramName]: [`${paramName} is required`] }
            });
        }
    }

    // Interpolate template
    const workflow = interpolateTemplate(template.workflow, params);
    const options = template.options;

    // Create job
    const jobId = uuidv4();
    const job = createJob(jobId, { workflow, options });

    // Enqueue job
    await enqueue(jobId, { id: jobId, workflow: { workflow, options } });

    return reply.code(201).send({
        job_id: job.id,
        status: job.status,
        template_used: id
    });
});

// Start server
const start = async () => {
    try {
        await fastify.listen({ port: config.port, host: config.host });
        console.log(`Orbital API Server running on ${config.host}:${config.port}`);
        console.log(`App URL: ${config.appUrl}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
