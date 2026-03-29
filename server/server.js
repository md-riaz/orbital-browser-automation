import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import {
    createApiKey,
    createJob,
    deleteApiKey,
    getApiKeyByValue,
    getJob,
    getJobStats,
    listApiKeys,
    listJobs,
    revokeApiKey,
    rotateApiKey,
    touchApiKeyUsage
} from './database.js';
import { enqueue } from './queue.js';
import { validateUrl, validateStep } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: { level: 'info' }, bodyLimit: config.maxJsonSize });

await fastify.register(fastifyCookie, { secret: config.adminSessionSecret });
await fastify.register(fastifyFormbody);

await fastify.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'Orbital Browser Automation API',
            description: 'Queue and execute Playwright-based browser automation workflows.\n\nAuthentication:\n- Public: `GET /health`\n- Protected: all `/api/v1/*` endpoints require auth\n- Use Swagger **Authorize** and paste the raw API key into the `X-API-Key` scheme\n\nFor this deployment, use an active API key from the admin panel.',
            version: '1.0.0'
        },
        servers: [{ url: config.appUrl, description: 'Current deployment' }],
        security: [{ apiKey: [] }],
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    name: 'X-API-Key',
                    in: 'header',
                    description: 'Paste the raw API key value here. It will be sent as the X-API-Key header.'
                }
            }
        }
    }
});

await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
    staticCSP: true,
    transformSpecificationClone: true
});

function getApiToken(request) {
    return request.headers['x-api-key'];
}

function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function adminLayout(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background:#f5f7fb; color:#111827; }
    header { background:#111827; color:#fff; padding:14px 22px; display:flex; justify-content:space-between; align-items:center; }
    nav a { color:#c7d2fe; margin-right:14px; text-decoration:none; }
    main { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
    .card { background:#fff; border-radius:10px; padding:20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom:18px; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
    .stat { font-size:28px; font-weight:700; margin-top:8px; }
    table { width:100%; border-collapse: collapse; background:#fff; }
    th, td { text-align:left; padding:12px 10px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
    th { background:#f9fafb; }
    input, select, button, textarea { font: inherit; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; }
    button { background:#111827; color:#fff; cursor:pointer; }
    .muted { color:#6b7280; font-size:13px; }
    .pill { display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; background:#eef2ff; color:#3730a3; }
    .danger { background:#991b1b; }
    .warn { background:#92400e; }
    form.inline { display:inline; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    pre { white-space:pre-wrap; word-break:break-word; background:#0b1020; color:#d1d5db; padding:12px; border-radius:8px; }
    code { word-break: break-all; }
  </style>
</head>
<body>
<header>
  <div><strong>Orbital Admin</strong></div>
  <nav>
    <a href="/admin">Dashboard</a>
    <a href="/admin/api-keys">API Keys</a>
    <a href="/admin/jobs">Jobs</a>
    <a href="/docs">API Docs</a>
    <a href="/admin/logout">Logout</a>
  </nav>
</header>
<main>${body}</main>
</body>
</html>`;
}

function requireAdmin(request, reply) {
    const session = request.unsignCookie(request.cookies.admin_session || '');
    if (!session.valid || session.value !== config.adminUsername) {
        return reply.redirect('/admin/login');
    }
}

fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/docs') || request.url.startsWith('/artifacts/') || request.url.startsWith('/admin')) {
        return;
    }

    const apiKey = getApiToken(request);
    const keyRecord = apiKey ? getApiKeyByValue(apiKey) : null;
    if (!apiKey || !keyRecord || !keyRecord.is_active) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid or missing API key' });
    }

    touchApiKeyUsage(keyRecord.id);
    request.apiKeyRecord = keyRecord;
});

fastify.get('/health', {
    schema: {
        tags: ['system'],
        summary: 'Health check',
        description: 'Basic health status of the Orbital API server.',
        security: [],
        response: { 200: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' } } } }
    }
}, async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

fastify.register(fastifyStatic, { root: config.storagePath, prefix: '/artifacts/', decorateReply: false });

const stepSchema = {
    type: 'object',
    properties: {
        action: { type: 'string', enum: config.allowedActions },
        url: { type: 'string' },
        duration: { type: 'number' },
        selector: { type: 'string' },
        value: { type: 'string' },
        fullPage: { type: 'boolean' },
        script: { type: 'string' }
    },
    required: ['action']
};

fastify.get('/admin/login', { schema: { hide: true } }, async (request, reply) => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orbital Admin Login</title>
    <style>body{font-family:Arial,sans-serif;background:#f5f7fb;display:grid;place-items:center;min-height:100vh} .box{background:#fff;padding:24px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);width:360px} input,button{width:100%;padding:10px 12px;margin-top:10px;border:1px solid #d1d5db;border-radius:8px;font:inherit} button{background:#111827;color:#fff}</style>
    </head><body><form class="box" method="post" action="/admin/login"><h2>Orbital Admin</h2><p>Login to manage API keys and jobs.</p><input name="username" placeholder="Username" /><input name="password" type="password" placeholder="Password" /><button type="submit">Login</button></form></body></html>`;
    reply.type('text/html').send(html);
});

fastify.post('/admin/login', { schema: { hide: true } }, async (request, reply) => {
    const { username, password } = request.body || {};
    if (username === config.adminUsername && password === config.adminPassword) {
        reply.setCookie('admin_session', config.adminUsername, {
            path: '/', httpOnly: true, sameSite: 'lax', signed: true, secure: config.appUrl.startsWith('https://')
        });
        return reply.redirect('/admin');
    }
    return reply.code(401).type('text/html').send('<p>Invalid credentials.</p><p><a href="/admin/login">Back</a></p>');
});

fastify.get('/admin/logout', { schema: { hide: true } }, async (request, reply) => {
    reply.clearCookie('admin_session', { path: '/' });
    return reply.redirect('/admin/login');
});

fastify.get('/admin', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    const stats = getJobStats();
    const keys = listApiKeys();
    const body = `
      <div class="grid">
        <div class="card"><div class="muted">Total Jobs</div><div class="stat">${stats.total}</div></div>
        <div class="card"><div class="muted">Running</div><div class="stat">${stats.running}</div></div>
        <div class="card"><div class="muted">Completed</div><div class="stat">${stats.completed}</div></div>
        <div class="card"><div class="muted">Failed</div><div class="stat">${stats.failed}</div></div>
        <div class="card"><div class="muted">Active API Keys</div><div class="stat">${keys.filter(k => k.is_active).length}</div></div>
      </div>
      <div class="card"><h3>Quick Links</h3><p><a href="/admin/api-keys">Manage API Keys</a> · <a href="/admin/jobs">View Jobs</a> · <a href="/docs">Swagger Docs</a></p></div>
    `;
    reply.type('text/html').send(adminLayout('Dashboard', body));
});

fastify.get('/admin/api-keys', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    const apiKeys = listApiKeys();
    const rows = apiKeys.map(k => `<tr>
      <td>${escapeHtml(k.label)}</td>
      <td><code>${escapeHtml(k.key_value)}</code></td>
      <td>${k.is_active ? '<span class="pill">active</span>' : '<span class="pill" style="background:#fee2e2;color:#991b1b">revoked</span>'}</td>
      <td>${escapeHtml(k.last_used_at || '—')}</td>
      <td>${escapeHtml(k.created_at)}</td>
      <td>
        ${k.is_active ? `<form class="inline" method="post" action="/admin/api-keys/${k.id}/rotate"><button class="warn">Rotate</button></form>` : ''}
        ${k.is_active ? `<form class="inline" method="post" action="/admin/api-keys/${k.id}/revoke"><button class="danger">Revoke</button></form>` : ''}
        <form class="inline" method="post" action="/admin/api-keys/${k.id}/delete"><button class="danger">Delete</button></form>
      </td>
    </tr>`).join('');
    const body = `
      <div class="card">
        <h3>Create API Key</h3>
        <form method="post" action="/admin/api-keys" class="toolbar">
          <input name="label" placeholder="Key label (e.g. Test Client)" required />
          <button type="submit">Create Key</button>
        </form>
      </div>
      <div class="card">
        <h3>API Keys</h3>
        <p class="muted">API is now key-only. Send the raw key in the <code>X-API-Key</code> header.</p>
        <table>
          <thead><tr><th>Label</th><th>Key</th><th>Status</th><th>Last Used</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">No API keys yet.</td></tr>'}</tbody>
        </table>
      </div>`;
    reply.type('text/html').send(adminLayout('API Keys', body));
});

fastify.post('/admin/api-keys', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    createApiKey((request.body || {}).label || 'Untitled Key');
    return reply.redirect('/admin/api-keys');
});

fastify.post('/admin/api-keys/:id/rotate', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    rotateApiKey(request.params.id);
    return reply.redirect('/admin/api-keys');
});

fastify.post('/admin/api-keys/:id/revoke', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    revokeApiKey(request.params.id);
    return reply.redirect('/admin/api-keys');
});

fastify.post('/admin/api-keys/:id/delete', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    deleteApiKey(request.params.id);
    return reply.redirect('/admin/api-keys');
});

fastify.get('/admin/jobs', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    const filters = {
        status: request.query.status || '',
        api_key_label: request.query.api_key_label || '',
        q: request.query.q || ''
    };
    const jobs = listJobs(200, 0, filters);
    const rows = jobs.map(job => `<tr>
      <td><a href="/admin/jobs/${job.id}">${job.id}</a></td>
      <td><span class="pill">${escapeHtml(job.status)}</span></td>
      <td>${escapeHtml(job.api_key_label || '—')}</td>
      <td>${escapeHtml(job.created_at)}</td>
      <td>${escapeHtml(job.finished_at || '—')}</td>
    </tr>`).join('');
    const body = `
      <div class="card">
        <h3>Filter Jobs</h3>
        <form method="get" action="/admin/jobs" class="toolbar">
          <input name="q" value="${escapeHtml(filters.q)}" placeholder="Search job id / payload / error" />
          <input name="api_key_label" value="${escapeHtml(filters.api_key_label)}" placeholder="API key label" />
          <select name="status">
            <option value="">Any status</option>
            ${['pending','running','completed','failed','timeout'].map(s => `<option value="${s}" ${filters.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button type="submit">Apply</button>
        </form>
      </div>
      <div class="card"><h3>Recent Jobs</h3><table><thead><tr><th>ID</th><th>Status</th><th>API Key</th><th>Created</th><th>Finished</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No jobs found.</td></tr>'}</tbody></table></div>`;
    reply.type('text/html').send(adminLayout('Jobs', body));
});

fastify.get('/admin/jobs/:id', { schema: { hide: true } }, async (request, reply) => {
    const denied = requireAdmin(request, reply);
    if (denied) return denied;
    const job = getJob(request.params.id);
    if (!job) return reply.code(404).type('text/html').send(adminLayout('Not Found', '<div class="card"><p>Job not found.</p></div>'));
    const body = `
      <div class="card"><h3>Job ${escapeHtml(job.id)}</h3>
      <p><strong>Status:</strong> ${escapeHtml(job.status)}</p>
      <p><strong>API Key:</strong> ${escapeHtml(job.api_key_label || '—')}</p>
      <p><strong>Created:</strong> ${escapeHtml(job.created_at)}</p>
      <p><strong>Started:</strong> ${escapeHtml(job.started_at || '—')}</p>
      <p><strong>Finished:</strong> ${escapeHtml(job.finished_at || '—')}</p>
      <p><strong>Error:</strong> ${escapeHtml(job.error_message || '—')}</p>
      </div>
      <div class="card"><h3>Workflow</h3><pre>${escapeHtml(JSON.stringify(job.workflow_json, null, 2))}</pre></div>
      <div class="card"><h3>Result</h3><pre>${escapeHtml(JSON.stringify(job.result_json, null, 2))}</pre></div>`;
    reply.type('text/html').send(adminLayout(`Job ${job.id}`, body));
});

fastify.post('/api/v1/jobs', {
    schema: {
        tags: ['jobs'],
        summary: 'Create automation job',
        security: [{ apiKey: [] }],
        body: {
            type: 'object', required: ['workflow'],
            properties: {
                workflow: { type: 'object', required: ['steps'], properties: { steps: { type: 'array', minItems: 1, maxItems: 25, items: stepSchema } } },
                options: { type: 'object', properties: { timeout: { type: 'number', minimum: 1000, maximum: 120000, default: 60000 }, viewport: { type: 'object', properties: { width: { type: 'number', minimum: 100, maximum: 3840 }, height: { type: 'number', minimum: 100, maximum: 2160 } } } } }
            },
            examples: [{ workflow: { steps: [ { action: 'goto', url: 'https://example.com' }, { action: 'wait', duration: 1000 }, { action: 'screenshot', fullPage: true } ] }, options: { timeout: 60000, viewport: { width: 1440, height: 900 } } }]
        },
        response: {
            201: { type: 'object', properties: { job_id: { type: 'string', format: 'uuid' }, status: { type: 'string', example: 'pending' } } },
            401: { type: 'object', properties: { error: { type: 'string' } } },
            422: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'object', additionalProperties: true } } }
        }
    }
}, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') return reply.code(422).send({ error: 'Validation failed', details: { body: ['request body is required'] } });
    if (!body.workflow || typeof body.workflow !== 'object') return reply.code(422).send({ error: 'Validation failed', details: { workflow: ['workflow is required and must be an object'] } });
    if (!Array.isArray(body.workflow.steps)) return reply.code(422).send({ error: 'Validation failed', details: { 'workflow.steps': ['steps is required and must be an array'] } });
    if (body.workflow.steps.length === 0) return reply.code(422).send({ error: 'Validation failed', details: { 'workflow.steps': ['steps must contain at least 1 item'] } });
    if (body.workflow.steps.length > config.maxSteps) return reply.code(422).send({ error: 'Validation failed', details: { 'workflow.steps': [`steps must not have more than ${config.maxSteps} items`] } });
    if (body.options) {
        if (body.options.timeout !== undefined && (typeof body.options.timeout !== 'number' || body.options.timeout < 1000 || body.options.timeout > config.maxTimeout)) {
            return reply.code(422).send({ error: 'Validation failed', details: { 'options.timeout': [`timeout must be between 1000 and ${config.maxTimeout}`] } });
        }
        if (body.options.viewport) {
            if (!body.options.viewport.width || !body.options.viewport.height) return reply.code(422).send({ error: 'Validation failed', details: { 'options.viewport': ['both width and height are required'] } });
            if (body.options.viewport.width < 100 || body.options.viewport.width > 3840 || body.options.viewport.height < 100 || body.options.viewport.height > 2160) {
                return reply.code(422).send({ error: 'Validation failed', details: { 'options.viewport': ['width must be 100-3840, height must be 100-2160'] } });
            }
        }
    }
    for (let i = 0; i < body.workflow.steps.length; i++) {
        const step = body.workflow.steps[i];
        if (!step.action || !config.allowedActions.includes(step.action)) return reply.code(422).send({ error: 'Validation failed', details: { [`workflow.steps.${i}.action`]: [`action must be one of: ${config.allowedActions.join(', ')}`] } });
        const stepErrors = validateStep(step);
        if (stepErrors.length > 0) return reply.code(422).send({ error: `Step ${i} validation failed`, details: stepErrors });
        if (step.url) {
            const urlError = await validateUrl(step.url);
            if (urlError) return reply.code(422).send({ error: `Step ${i}: ${urlError}` });
        }
    }
    const jobId = uuidv4();
    const job = createJob(jobId, body, request.apiKeyRecord || null);
    enqueue(jobId, { id: jobId, workflow: body });
    return reply.code(201).send({ job_id: job.id, status: job.status });
});

fastify.get('/api/v1/jobs/:id', {
    schema: {
        tags: ['jobs'],
        summary: 'Get job status/result',
        security: [{ apiKey: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: {
            200: { type: 'object', properties: { job_id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'timeout'] }, created_at: { type: 'string' }, started_at: { type: 'string', nullable: true }, finished_at: { type: 'string', nullable: true }, result: { type: 'object', nullable: true, additionalProperties: true }, error: { type: 'string', nullable: true }, api_key_label: { type: 'string', nullable: true } } },
            401: { type: 'object', properties: { error: { type: 'string' } } },
            404: { type: 'object', properties: { error: { type: 'string' } } }
        }
    }
}, async (request, reply) => {
    const { id } = request.params;
    const job = getJob(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const response = { job_id: job.id, status: job.status, created_at: job.created_at, api_key_label: job.api_key_label };
    if (job.status === 'completed' && job.result_json) response.result = job.result_json;
    if (job.status === 'failed' && job.error_message) response.error = job.error_message;
    if (job.started_at) response.started_at = job.started_at;
    if (job.finished_at) response.finished_at = job.finished_at;
    return response;
});

const start = async () => {
    try {
        await fastify.listen({ port: config.port, host: config.host });
        console.log(`Orbital API Server running on ${config.host}:${config.port}`);
        console.log(`App URL: ${config.appUrl}`);
        console.log(`Swagger UI: ${config.appUrl}/docs`);
        console.log(`Admin UI: ${config.appUrl}/admin/login`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
