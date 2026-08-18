import { allowCors, json, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { settings } from '../src/core/settings.js';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  json(res, 200, {
    ok: true,
    runtime: 'vercel-native-api',
    fastify: false,
    vercel: Boolean(process.env.VERCEL),
    version: settings.appVersion,
  });
}
