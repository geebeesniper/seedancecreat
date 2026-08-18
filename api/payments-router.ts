import {
  allowCors,
  bodyJson,
  context,
  ensureDatabase,
  json,
  publicBaseUrl,
  queryValue,
  type VercelReq,
  type VercelRes,
} from '../src/apiUtils.js';
import { paymentService } from '../src/services/paymentService.js';

function cleanRoute(value: string | undefined): string {
  return decodeURIComponent(String(value || '')).replace(/^\/+|\/+$/g, '');
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if (!(await ensureDatabase(res))) return;

  const route = cleanRoute(queryValue(req, 'route'));
  const method = (req.method || 'GET').toUpperCase();
  const ctx = context(req);

  try {
    if (route === 'config') {
      if (method !== 'GET') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
      return json(res, 200, await paymentService.config(ctx));
    }

    if (route === 'wallet') {
      if (method !== 'GET') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
      return json(res, 200, { success: true, wallet: await paymentService.getWallet(ctx) });
    }

    if (route === 'orders') {
      if (method !== 'GET') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
      const limit = Number(queryValue(req, 'limit') || 30);
      return json(res, 200, { success: true, orders: await paymentService.listOrders(ctx, limit) });
    }

    if (route === 'stripe/checkout') {
      if (method !== 'POST') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
      const result = await paymentService.createStripeCheckout(ctx, await bodyJson(req), publicBaseUrl(req));
      const ok = (result as { success?: boolean }).success !== false;
      return json(res, ok ? 200 : 400, result);
    }

    if (route.startsWith('stripe/session/')) {
      if (method !== 'GET') return json(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
      const sessionId = route.slice('stripe/session/'.length);
      if (!sessionId) return json(res, 400, { success: false, error: 'SESSION_ID_REQUIRED' });
      return json(res, 200, await paymentService.syncStripeSession(ctx, sessionId));
    }

    // Webhook deliberately stays in its own Function so the raw-body behavior is unchanged.
    if (route === 'stripe/webhook') {
      return json(res, 500, { success: false, error: 'WEBHOOK_ROUTING_MISCONFIGURED' });
    }

    return json(res, 404, { success: false, error: 'PAYMENT_ROUTE_NOT_FOUND', route });
  } catch (error) {
    return json(res, 400, { success: false, error: error instanceof Error ? error.message : String(error) });
  }
}
