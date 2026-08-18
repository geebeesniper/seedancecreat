import { allowCors, context, ensureDatabase, json, queryValue, type VercelReq, type VercelRes } from '../../src/apiUtils.js';
import { paymentService } from '../../src/services/paymentService.js';
export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if (!(await ensureDatabase(res))) return;
  const limit = Number(queryValue(req, 'limit') || 30);
  json(res, 200, { success: true, orders: await paymentService.listOrders(context(req), limit) });
}
