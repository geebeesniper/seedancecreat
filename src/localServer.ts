import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import { ensureDb, db } from './db/database.js';
import { settings } from './core/settings.js';
import { legacyRoutes } from './routes/legacy.js';
import { paymentRoutes } from './routes/payments.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true });
await app.register(paymentRoutes);
await app.register(legacyRoutes);

app.get('/health/runtime', async () => ({ ok: true, runtime: 'local-fastify', vercel: false, version: settings.appVersion }));
app.get('/health', async () => ({ ok: true, backend: 'typescript', runtime: 'local-fastify', login: true, database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite' }));
app.get('/health/db', async (_req, reply) => {
  try {
    await ensureDb();
    await db.selectFrom('projects').select('id').limit(1).execute();
    return { ok: true, database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite', schema_initialized: true };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
app.setNotFoundHandler(async (req, reply) => {
  if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
  return reply.code(404).send({ error: 'Not found' });
});

const port = Number(process.env.PORT || settings.port || 8000);
const host = process.env.HOST || settings.host || '0.0.0.0';
app.log.info({ port, host }, 'Starting local GS-One dev server');
await app.listen({ port, host });
