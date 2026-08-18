import { allowCors, databaseHealth, json, queryValue, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { settings } from '../src/core/settings.js';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  const mode = (queryValue(req, 'mode') || 'health').toLowerCase();

  if (mode === 'runtime') {
    return json(res, 200, {
      ok: true,
      runtime: 'vercel-native-api',
      fastify: false,
      vercel: Boolean(process.env.VERCEL),
      version: settings.appVersion,
    });
  }

  if (mode === 'db') {
    try {
      return json(res, 200, await databaseHealth());
    } catch (error) {
      return json(res, 503, {
        ok: false,
        database: 'postgresql',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(res, 200, {
    ok: true,
    backend: 'typescript',
    runtime: 'vercel-native-api',
    login: true,
    frontend: 'original-vue-extracted',
    database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite',
    stripe: Boolean(settings.stripeSecretKey),
    payment: 'stripe+alipay+local-ledger',
  });
}
