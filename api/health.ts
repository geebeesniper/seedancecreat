import { allowCors, json, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { settings } from '../src/core/settings.js';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  json(res, 200, {
    ok: true,
    backend: 'typescript',
    runtime: 'vercel-native-api',
    login: false,
    frontend: 'original-vue-extracted',
    database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite',
    stripe: Boolean(settings.stripeSecretKey),
    original_payment_preserved: true,
  });
}
