import { allowCors, context, ensureDatabase, json, type VercelReq, type VercelRes } from '../../src/apiUtils.js';
import { paymentService } from '../../src/services/paymentService.js';
export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  if (!(await ensureDatabase(res))) return;
  json(res, 200, await paymentService.config(context(req)));
}
