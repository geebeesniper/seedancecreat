import { randomUUID } from 'node:crypto';
import { settings } from './core/settings.js';
import type { RequestContext } from './core/context.js';

export type VercelReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, cb: (chunk?: Buffer) => void) => void;
};

export type VercelRes = {
  status: (code: number) => VercelRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
  end: (body?: unknown) => void;
};

function header(req: VercelReq, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function context(req: VercelReq): RequestContext {
  return {
    tenantId: header(req, 'x-tenant-id') || settings.defaultTenantId,
    userId: header(req, 'x-user-id') || settings.defaultUserId,
    requestId: header(req, 'x-request-id') || randomUUID(),
    upstreamAccessToken: settings.upstreamAccessToken,
  };
}

export function json(res: VercelRes, status: number, body: unknown): void {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

export function allowCors(req: VercelReq, res: VercelRes): boolean {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-tenant-id,x-user-id,x-request-id,stripe-signature');
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function queryValue(req: VercelReq, name: string): string | undefined {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function pathSegment(req: VercelReq, marker: string): string | undefined {
  const url = req.url || '';
  const i = url.indexOf(marker);
  if (i < 0) return undefined;
  const rest = url.slice(i + marker.length).split('?')[0];
  const first = rest.split('/').filter(Boolean)[0];
  return first ? decodeURIComponent(first) : undefined;
}

export async function bodyJson(req: VercelReq): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
  }
  const raw = await rawBody(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')) as Record<string, unknown>; } catch { return {}; }
}

export function rawBody(req: VercelReq): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    if (!req.on) return resolve(Buffer.alloc(0));
    req.on('data', (chunk?: Buffer) => { if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err?: Buffer) => reject(err));
  });
}

export async function ensureDatabase(res: VercelRes): Promise<boolean> {
  try {
    const { ensureDb } = await import('./db/database.js');
    await ensureDb();
    return true;
  } catch (error) {
    json(res, 503, {
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function databaseHealth() {
  const { ensureDb, db } = await import('./db/database.js');
  await ensureDb();
  const row = await db.selectFrom('projects').select('id').limit(1).executeTakeFirst();
  return { ok: true, database: settings.databaseUrl.startsWith('post') ? 'postgresql' : 'sqlite', schema_initialized: true, sample_project_id: row?.id ?? null };
}

export function publicBaseUrl(req: VercelReq): string {
  if (settings.publicBaseUrl) return settings.publicBaseUrl;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  const proto = header(req, 'x-forwarded-proto') || 'http';
  const host = header(req, 'x-forwarded-host') || header(req, 'host') || '127.0.0.1:8000';
  return `${proto}://${host}`;
}
