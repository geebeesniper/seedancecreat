import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import { initDb, db } from './db/database.js';
import { settings } from './core/settings.js';
import { legacyRoutes } from './routes/legacy.js';
import { paymentRoutes } from './routes/payments.js';

process.on('uncaughtException', (error) => {
  console.error('[runtime] uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[runtime] unhandledRejection', reason);
});

export const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(rawBody, {
  field: 'rawBody',
  global: false,
  encoding: false,
  runFirst: true,
});

app.get('/health/runtime', async () => ({
  ok: true,
  runtime: 'fastify-listener',
  vercel: Boolean(process.env.VERCEL),
  version: settings.appVersion,
}));

app.get('/health', async () => ({
  ok: true,
  backend: 'typescript',
  login: false,
  frontend: 'original-vue-extracted',
  database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite',
  stripe: Boolean(settings.stripeSecretKey),
  original_payment_preserved: true,
}));

let initialized = false;
let initializing: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initializing) {
    initializing = initDb()
      .then(() => { initialized = true; })
      .finally(() => { initializing = null; });
  }
  await initializing;
}

// Initialize the schema only when a database-backed API is actually requested.
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  try {
    await ensureInitialized();
  } catch (error) {
    req.log.error({ err: error }, 'Database initialization failed');
    return reply.code(503).send({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

await app.register(paymentRoutes);
await app.register(legacyRoutes);

app.get('/health/db', async (_req, reply) => {
  try {
    await ensureInitialized();
    await db.selectFrom('projects').select('id').limit(1).execute();
    return { ok: true, database: 'postgresql', schema_initialized: true };
  } catch (error) {
    app.log.error({ err: error }, 'Database health check failed');
    return reply.code(503).send({
      ok: false,
      database: 'postgresql',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Vercel's current zero-config Fastify adapter detects a listener in src/server.ts.
// Local development uses the same entry point. Static UI is served by Vercel from /public;
// locally we register @fastify/static so npm run dev behaves the same way.
if (!process.env.VERCEL) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(here, '../../public');
  await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  app.log.info({ port, host, vercel: Boolean(process.env.VERCEL) }, 'Starting GS-One Fastify server');
  app.listen({ port, host }).catch((error) => {
    app.log.error({ err: error }, 'Fastify failed to listen');
    process.exit(1);
  });
}

export default app;
