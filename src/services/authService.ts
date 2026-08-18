import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/database.js';
import { settings } from '../core/settings.js';
import type { RequestContext } from '../core/context.js';

const scrypt = promisify(scryptCb);
const now = () => new Date().toISOString();
const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const httpError=(code:string,statusCode:number)=>Object.assign(new Error(code),{statusCode});

export type PublicUser = {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
  status: string;
  created_at: string;
};

function publicUser(row: any): PublicUser {
  return {
    id: String(row.id), tenant_id: String(row.tenantId), username: String(row.username),
    email: String(row.email || ''), status: String(row.status || 'active'), created_at: String(row.createdAt || ''),
  };
}

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const out = await scrypt(password, salt, 64) as Buffer;
  return { salt: salt.toString('hex'), hash: out.toString('hex') };
}

function validateUsername(username: string) {
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw httpError('USERNAME_INVALID',400);
}
function validatePassword(password: string) {
  if (password.length < 8 || password.length > 200) throw httpError('PASSWORD_LENGTH_INVALID',400);
}
function validateEmail(email: string) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError('EMAIL_INVALID',400);
}

export class AuthService {
  async register(input: { username?: unknown; email?: unknown; password?: unknown; tenantId?: string }) {
    if (!settings.allowSignup) throw httpError('SIGNUP_DISABLED',403);
    const username = String(input.username ?? '').trim();
    const email = String(input.email ?? '').trim();
    const password = String(input.password ?? '');
    validateUsername(username); validateEmail(email); validatePassword(password);
    const usernameLower = lower(username), emailLower = lower(email);
    const tenantId = input.tenantId || settings.defaultTenantId;
    const existing = await db.selectFrom('users').select(['id','usernameLower','emailLower'])
      .where('tenantId','=',tenantId)
      .where(eb => emailLower ? eb.or([eb('usernameLower','=',usernameLower), eb('emailLower','=',emailLower)]) : eb('usernameLower','=',usernameLower))
      .executeTakeFirst();
    if (existing) throw httpError(existing.usernameLower === usernameLower ? 'USERNAME_ALREADY_EXISTS' : 'EMAIL_ALREADY_EXISTS',409);
    const p = await hashPassword(password); const t = now();
    const row = { id: randomUUID(), tenantId, username, usernameLower, email, emailLower, passwordHash:p.hash, passwordSalt:p.salt, status:'active', createdAt:t, updatedAt:t };
    await db.insertInto('users').values(row).execute();
    const session = await this.createSession(row.id, tenantId);
    return { success:true, user:publicUser(row), ...session };
  }

  async login(input: { identifier?: unknown; username?: unknown; email?: unknown; password?: unknown }) {
    const identifier = lower(input.identifier ?? input.username ?? input.email ?? '');
    const password = String(input.password ?? '');
    if (!identifier || !password) throw httpError('LOGIN_REQUIRED',400);
    const row = await db.selectFrom('users').selectAll()
      .where('tenantId','=',settings.defaultTenantId)
      .where(eb => eb.or([eb('usernameLower','=',identifier), eb('emailLower','=',identifier)]))
      .executeTakeFirst();
    if (!row || row.status !== 'active') throw httpError('INVALID_CREDENTIALS',401);
    const p = await hashPassword(password, row.passwordSalt);
    const a=Buffer.from(p.hash,'hex'), b=Buffer.from(row.passwordHash,'hex');
    if (a.length !== b.length || !timingSafeEqual(a,b)) throw httpError('INVALID_CREDENTIALS',401);
    const session = await this.createSession(row.id, row.tenantId);
    return { success:true, user:publicUser(row), ...session };
  }

  private async createSession(userId: string, tenantId: string) {
    const raw = `gs_session_${randomBytes(32).toString('base64url')}`;
    const t = new Date(); const expires = new Date(t.getTime()+settings.sessionTtlHours*3600_000);
    await db.insertInto('auth_sessions').values({
      id:randomUUID(), tenantId, userId, tokenHash:tokenHash(raw), status:'active',
      expiresAt:expires.toISOString(), createdAt:t.toISOString(), lastUsedAt:t.toISOString(), revokedAt:null,
    }).execute();
    return { token:raw, token_type:'Bearer', expires_at:expires.toISOString() };
  }

  async authenticate(token: string) {
    if (!token.startsWith('gs_session_')) return null;
    const h=tokenHash(token);
    const session = await db.selectFrom('auth_sessions').selectAll().where('tokenHash','=',h).executeTakeFirst();
    if (!session || session.status !== 'active' || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = await db.selectFrom('users').selectAll().where('id','=',session.userId).where('tenantId','=',session.tenantId).executeTakeFirst();
    if (!user || user.status !== 'active') return null;
    await db.updateTable('auth_sessions').set({lastUsedAt:now()}).where('id','=',session.id).execute();
    return { session, user:publicUser(user), ctx:{tenantId:user.tenantId,userId:user.id,requestId:randomUUID(),upstreamAccessToken:settings.upstreamAccessToken} as RequestContext };
  }

  async logout(token: string) {
    if (!token) return {success:true};
    await db.updateTable('auth_sessions').set({status:'revoked',revokedAt:now()}).where('tokenHash','=',tokenHash(token)).execute();
    return {success:true};
  }

  async getUser(ctx: RequestContext) {
    const row=await db.selectFrom('users').selectAll().where('id','=',ctx.userId).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    return row ? publicUser(row) : null;
  }
}
export const authService = new AuthService();
