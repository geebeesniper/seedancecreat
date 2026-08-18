import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { settings } from '../core/settings.js';
import type { RequestContext } from '../core/context.js';
import { headerValue, type VercelReq } from '../apiUtils.js';

const now=()=>new Date().toISOString();
const ALL_SCOPES=['videos:read','videos:write','models:read','wallet:read'];
function sha256(value:string){return createHash('sha256').update(value).digest('hex');}
function parseScopes(value:string):string[]{try{const x=JSON.parse(value);return Array.isArray(x)?x.map(String):[];}catch{return[];}}
function requestId(req:VercelReq){return headerValue(req,'x-request-id')||randomUUID();}

export type ApiKeyAuth={ctx:RequestContext; keyId:string; mode:string; scopes:string[]; authDisabled:boolean};

export async function createApiKey(input:{tenantId:string;userId:string;name?:string;mode?:'test'|'live';scopes?:string[]}){
  const mode=input.mode==='live'?'live':'test';
  const secret=randomBytes(30).toString('base64url');
  const key=`sk_${mode}_${secret}`;
  const prefix=key.slice(0,18);
  const t=now();
  const scopes=(input.scopes?.length?input.scopes:ALL_SCOPES).filter(x=>ALL_SCOPES.includes(x)||x==='*');
  const row={id:randomUUID(),tenantId:input.tenantId,userId:input.userId,name:input.name||'API key',mode,keyPrefix:prefix,keyHash:sha256(key),scopes:JSON.stringify(scopes),status:'active',lastUsedAt:null,createdAt:t,revokedAt:null};
  await db.insertInto('api_keys').values(row).execute();
  return {id:row.id,name:row.name,mode:row.mode,key,key_prefix:row.keyPrefix,scopes,created_at:t};
}

export async function listApiKeys(tenantId:string,userId:string){
  const rows=await db.selectFrom('api_keys').select(['id','name','mode','keyPrefix','scopes','status','lastUsedAt','createdAt','revokedAt'])
    .where('tenantId','=',tenantId).where('userId','=',userId).orderBy('createdAt','desc').execute();
  return rows.map(x=>({id:x.id,name:x.name,mode:x.mode,key_prefix:x.keyPrefix,scopes:parseScopes(x.scopes),status:x.status,last_used_at:x.lastUsedAt,created_at:x.createdAt,revoked_at:x.revokedAt}));
}

export async function revokeApiKey(tenantId:string,userId:string,id:string){
  const t=now();
  const result=await db.updateTable('api_keys').set({status:'revoked',revokedAt:t}).where('id','=',id).where('tenantId','=',tenantId).where('userId','=',userId).executeTakeFirst();
  return {success:Number(result.numUpdatedRows||0)>0,id,revoked_at:t};
}

function extractKey(req:VercelReq):string{
  const auth=headerValue(req,'authorization')||'';
  if(/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i,'').trim();
  return (headerValue(req,'x-api-key')||'').trim();
}

export async function authenticateApiKey(req:VercelReq, requiredScopes:string[]=[]):Promise<ApiKeyAuth>{
  if(settings.externalApiAuthDisabled){
    return {ctx:{tenantId:settings.defaultTenantId,userId:settings.defaultUserId,requestId:requestId(req),upstreamAccessToken:settings.upstreamAccessToken},keyId:'auth-disabled',mode:'test',scopes:['*'],authDisabled:true};
  }
  const key=extractKey(req);
  if(!key) throw Object.assign(new Error('API_KEY_REQUIRED'),{statusCode:401});
  if(!/^sk_(test|live)_/.test(key)) throw Object.assign(new Error('INVALID_API_KEY_FORMAT'),{statusCode:401});
  const row=await db.selectFrom('api_keys').selectAll().where('keyHash','=',sha256(key)).where('status','=','active').executeTakeFirst();
  if(!row) throw Object.assign(new Error('INVALID_API_KEY'),{statusCode:401});
  const scopes=parseScopes(row.scopes);
  for(const scope of requiredScopes){if(!scopes.includes('*')&&!scopes.includes(scope)) throw Object.assign(new Error(`MISSING_SCOPE:${scope}`),{statusCode:403});}
  await db.updateTable('api_keys').set({lastUsedAt:now()}).where('id','=',row.id).execute();
  return {ctx:{tenantId:row.tenantId,userId:row.userId,requestId:requestId(req),upstreamAccessToken:settings.upstreamAccessToken},keyId:row.id,mode:row.mode,scopes,authDisabled:false};
}

export function assertAdminSecret(req:VercelReq){
  if(!settings.apiAdminSecret) throw Object.assign(new Error('API_ADMIN_SECRET_NOT_CONFIGURED'),{statusCode:503});
  const supplied=headerValue(req,'x-api-admin-secret')||'';
  if(supplied!==settings.apiAdminSecret) throw Object.assign(new Error('INVALID_ADMIN_SECRET'),{statusCode:401});
}
