import { allowCors, bodyJson, ensureDatabase, json, pathSegment, queryValue, sessionAuth, type VercelReq, type VercelRes } from '../../src/apiUtils.js';
import { dispatcher } from '../../src/services/dispatcher.js';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if ((req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
  if (!(await ensureDatabase(res))) return;
  const auth=await sessionAuth(req,res,true); if(!auth)return;
  const method = queryValue(req, 'method') || pathSegment(req, '/api/app/') || '';
  const body = await bodyJson(req);
  const args = Array.isArray(body.args) ? body.args : [];
  try {
    const result = await dispatcher.dispatch(auth.ctx, method, args);
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { success: false, method, error: error instanceof Error ? error.message : String(error) });
  }
}
