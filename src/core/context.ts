import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { settings } from './settings.js';

export interface RequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
  upstreamAccessToken: string;
}

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function buildContext(req: FastifyRequest): RequestContext {
  // GS-One's own visible login is removed. A parent SaaS can inject tenant/user IDs later.
  return {
    tenantId: header(req, 'x-tenant-id') || settings.defaultTenantId,
    userId: header(req, 'x-user-id') || settings.defaultUserId,
    requestId: header(req, 'x-request-id') || randomUUID(),
    upstreamAccessToken: settings.upstreamAccessToken,
  };
}
