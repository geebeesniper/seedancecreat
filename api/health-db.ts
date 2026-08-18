import { allowCors, databaseHealth, json, type VercelReq, type VercelRes } from '../src/apiUtils.js';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  try {
    json(res, 200, await databaseHealth());
  } catch (error) {
    json(res, 503, { ok: false, database: 'postgresql', error: error instanceof Error ? error.message : String(error) });
  }
}
