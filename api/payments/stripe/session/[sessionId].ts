import { allowCors, context, ensureDatabase, json, pathSegment, queryValue, type VercelReq, type VercelRes } from '../../../../src/apiUtils.js';
import { paymentService } from '../../../../src/services/paymentService.js';
export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if (!(await ensureDatabase(res))) return;
  const sessionId = queryValue(req, 'sessionId') || pathSegment(req, '/api/payments/stripe/session/') || '';
  try { json(res, 200, await paymentService.syncStripeSession(context(req), sessionId)); }
  catch (error) { json(res, 400, { success: false, error: error instanceof Error ? error.message : String(error) }); }
}
