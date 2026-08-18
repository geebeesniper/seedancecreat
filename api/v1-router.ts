import { bodyJson, context, queryValue, sessionAuth } from '../src/apiUtils.js';
import {
  allowCors,
  ensureDatabase,
  externalAuth,
  fail,
  json,
  type VercelReq,
  type VercelRes,
} from '../src/externalApiHttp.js';
import { assertAdminSecret, createApiKey, listApiKeys, revokeApiKey } from '../src/services/apiKeyService.js';
import { externalVideoApiService } from '../src/services/externalVideoApiService.js';
import { authService } from '../src/services/authService.js';

function cleanRoute(value: string | undefined): string {
  return decodeURIComponent(String(value || '')).replace(/^\/+|\/+$/g, '');
}

function methodOf(req: VercelReq): string {
  return (req.method || 'GET').toUpperCase();
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (allowCors(req, res)) return;
  const route = cleanRoute(queryValue(req, 'route'));
  const method = methodOf(req);

  if (!route) {
    return json(res, 200, {
      name: 'GS-One External API',
      version: 'v1',
      rest: '/api/v1',
      graphql: '/api/graphql',
      openapi: '/openapi.json',
      auth: 'Login: Bearer gs_session_...; external video API: Bearer sk_test_... or sk_live_...',
    });
  }

  if (!(await ensureDatabase(res))) return;

  try {
    if (route === 'auth/register') {
      if (method !== 'POST') return json(res,405,{success:false,code:'METHOD_NOT_ALLOWED'});
      const b=await bodyJson(req);
      const result=await authService.register({username:b.username,email:b.email,password:b.password});
      return json(res,201,result);
    }

    if (route === 'auth/login') {
      if (method !== 'POST') return json(res,405,{success:false,code:'METHOD_NOT_ALLOWED'});
      const b=await bodyJson(req);
      return json(res,200,await authService.login({identifier:b.identifier,username:b.username,email:b.email,password:b.password}));
    }

    if (route === 'auth/me') {
      if (method !== 'GET') return json(res,405,{success:false,code:'METHOD_NOT_ALLOWED'});
      const auth=await sessionAuth(req,res,true); if(!auth)return;
      return json(res,200,{success:true,user:auth.user,expires_at:auth.session.expiresAt});
    }

    if (route === 'auth/logout') {
      if (method !== 'POST') return json(res,405,{success:false,code:'METHOD_NOT_ALLOWED'});
      const auth=await sessionAuth(req,res,true); if(!auth)return;
      return json(res,200,await authService.logout(auth.token));
    }

    if (route === 'api-keys') {
      // A signed-in SaaS user can manage only their own API keys. The admin-secret
      // path remains available for bootstrap/ops and can target an explicit user.
      const signedIn = await sessionAuth(req, undefined, false);
      let fallback = signedIn?.ctx ?? context(req);
      const isAdmin = !signedIn;
      if (isAdmin) assertAdminSecret(req);
      if (method === 'GET') {
        return json(res, 200, { success: true, items: await listApiKeys(fallback.tenantId, fallback.userId) });
      }
      if (method === 'POST') {
        const b = await bodyJson(req);
        const tenantId = isAdmin ? String(b.tenant_id ?? b.tenantId ?? fallback.tenantId) : fallback.tenantId;
        const userId = isAdmin ? String(b.user_id ?? b.userId ?? fallback.userId) : fallback.userId;
        const mode = String(b.mode || 'test') === 'live' ? 'live' : 'test';
        const scopes = Array.isArray(b.scopes) ? b.scopes.map(String) : undefined;
        return json(res, 201, {
          success: true,
          api_key: await createApiKey({ tenantId, userId, name: String(b.name || 'Flux'), mode, scopes }),
        });
      }
      if (method === 'DELETE') {
        const id = queryValue(req, 'id') || '';
        if (!id) return json(res, 400, { success: false, code: 'ID_REQUIRED' });
        return json(res, 200, await revokeApiKey(fallback.tenantId, fallback.userId, id));
      }
      return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
    }

    if (route === 'models') {
      if (method !== 'GET') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['models:read']);
      if (!auth) return;
      return json(res, 200, { success: true, data: await externalVideoApiService.models(auth.ctx) });
    }

    if (route === 'wallet') {
      if (method !== 'GET') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['wallet:read']);
      if (!auth) return;
      return json(res, 200, { success: true, data: await externalVideoApiService.wallet(auth.ctx) });
    }

    if (route === 'videos') {
      if (method !== 'GET') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['videos:read']);
      if (!auth) return;
      const items = await externalVideoApiService.list(auth.ctx, {
        projectId: queryValue(req, 'project_id'),
        status: queryValue(req, 'status'),
        limit: Number(queryValue(req, 'limit') || 50),
      });
      return json(res, 200, { success: true, items });
    }

    if (route === 'videos/generate') {
      if (method !== 'POST') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['videos:write']);
      if (!auth) return;
      const b = await bodyJson(req);
      const result = await externalVideoApiService.generate(auth.ctx, {
        projectId: String(b.project_id ?? b.projectId ?? '') || undefined,
        episodeId: String(b.episode_id ?? b.episodeId ?? '') || undefined,
        segmentId: String(b.segment_id ?? b.segmentId ?? '') || undefined,
        shotSeq: Number(b.shot_seq ?? b.shotSeq ?? 0),
        featurePointKey: String(b.feature_point_key ?? b.featurePointKey ?? '') || undefined,
        model: String(b.model ?? b.model_name ?? '') || undefined,
        prompt: String(b.prompt ?? ''),
        duration: b.duration == null ? undefined : Number(b.duration),
        resolution: b.resolution == null ? undefined : String(b.resolution),
        aspectRatio: b.aspect_ratio == null && b.aspectRatio == null ? undefined : String(b.aspect_ratio ?? b.aspectRatio),
        params: (b.params && typeof b.params === 'object' && !Array.isArray(b.params) ? b.params : {}) as Record<string, unknown>,
      });
      return json(res, result.success ? 202 : 501, result);
    }

    const videoMatch = route.match(/^videos\/([^/]+)$/);
    if (videoMatch) {
      if (method !== 'GET') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['videos:read']);
      if (!auth) return;
      const item = await externalVideoApiService.get(auth.ctx, decodeURIComponent(videoMatch[1]));
      if (!item) return json(res, 404, { success: false, code: 'VIDEO_GENERATION_NOT_FOUND' });
      return json(res, 200, { success: true, generation: item });
    }

    const cancelMatch = route.match(/^videos\/([^/]+)\/cancel$/);
    if (cancelMatch) {
      if (method !== 'POST') return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
      const auth = await externalAuth(req, res, ['videos:write']);
      if (!auth) return;
      return json(res, 200, await externalVideoApiService.cancel(auth.ctx, decodeURIComponent(cancelMatch[1])));
    }

    return json(res, 404, { success: false, code: 'API_ROUTE_NOT_FOUND', route });
  } catch (error) {
    return fail(res, error);
  }
}
