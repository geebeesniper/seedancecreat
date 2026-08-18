import { allowCors, bodyJson, context, ensureDatabase, json, publicBaseUrl, type VercelReq, type VercelRes } from '../../../src/apiUtils.js';
import { paymentService } from '../../../src/services/paymentService.js';
export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if ((req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
  if (!(await ensureDatabase(res))) return;
  try {
    const result = await paymentService.createStripeCheckout(context(req), await bodyJson(req), publicBaseUrl(req));
    const ok = (result as { success?: boolean }).success !== false;
    json(res, ok ? 200 : 400, result);
  } catch (error) {
    json(res, 400, { success: false, error: error instanceof Error ? error.message : String(error) });
  }
}
