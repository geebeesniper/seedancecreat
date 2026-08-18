import { allowCors, ensureDatabase, json, rawBody, type VercelReq, type VercelRes } from '../../../src/apiUtils.js';
import { paymentService } from '../../../src/services/paymentService.js';
import { verifyStripeEvent } from '../../../src/integrations/stripe.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if ((req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!(await ensureDatabase(res))) return;
  try {
    const sigValue = req.headers['stripe-signature'];
    const signature = Array.isArray(sigValue) ? sigValue[0] : sigValue;
    if (!signature) return json(res, 400, { error: 'MISSING_STRIPE_SIGNATURE' });
    const event = verifyStripeEvent(await rawBody(req), signature);
    json(res, 200, await paymentService.handleStripeEvent(event));
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}
