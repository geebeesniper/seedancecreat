import { settings } from '../core/settings.js';
import type { RequestContext } from '../core/context.js';

export class FrozenUpstreamClient {
  // FROZEN: preserve existing upstream/payment semantics; only transport moved server-side.
  unavailable() { return { success: false, error: 'UPSTREAM_NOT_CONFIGURED', offline: true }; }

  private async request(ctx: RequestContext, method: string, path: string, body?: unknown): Promise<unknown> {
    if (!settings.upstreamBaseUrl) {
      if (settings.devAllowOfflineUpstream) return this.unavailable();
      throw new Error('UPSTREAM_BASE_URL is not configured');
    }
    const headers: Record<string,string> = { 'content-type': 'application/json', 'x-request-id': ctx.requestId };
    if (ctx.upstreamAccessToken) headers.authorization = `Bearer ${ctx.upstreamAccessToken}`;
    const response = await fetch(`${settings.upstreamBaseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    });
    const text = await response.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* preserve text */ }
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    return data;
  }

  getWallet(ctx: RequestContext) { return this.request(ctx,'GET','/api/user/wallet'); }
  getUserInfo(ctx: RequestContext) { return this.request(ctx,'GET','/api/v1/user/info'); }
  getMarketing(ctx: RequestContext) { return this.request(ctx,'GET','/api/user/marketing/activities'); }
  getModels(ctx: RequestContext) { return this.request(ctx,'GET','/api/v1/api-categories/models'); }
  getFeaturePoint(ctx: RequestContext,key:string) { return this.request(ctx,'GET',`/api/v1/feature-points/${encodeURIComponent(key)}`); }
  listScripts(ctx: RequestContext,key:string) { return this.request(ctx,'GET',`/api/v1/scripts?category_key=${encodeURIComponent(key)}`); }
  paymentConfig(ctx: RequestContext) { return this.request(ctx,'GET','/api/user/wxpay/config'); }
  rechargePackages(ctx: RequestContext) { return this.request(ctx,'GET','/api/user/recharge-packages'); }
  createOrder(ctx: RequestContext,payload:unknown) { return this.request(ctx,'POST','/api/user/wxpay/create-order',payload); }
  queryOrder(ctx: RequestContext,no:string) { return this.request(ctx,'GET',`/api/user/wxpay/order-status?order_no=${encodeURIComponent(no)}`); }
  rechargeRecords(ctx: RequestContext,page:number,size:number) { return this.request(ctx,'GET',`/api/user/recharge-records?${new URLSearchParams({page:String(page),page_size:String(size)})}`); }
  deductions(ctx: RequestContext,page:number,size:number,project?:string) {
    const q = new URLSearchParams({page:String(page),page_size:String(size)}); if (project) q.set('project_id',project);
    return this.request(ctx,'GET',`/api/v1/feature-points/deductions?${q}`);
  }
}
