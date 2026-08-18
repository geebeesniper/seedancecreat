import { allowCors, ensureDatabase, json, type VercelReq, type VercelRes } from './apiUtils.js';
import { authenticateApiKey } from './services/apiKeyService.js';
export { allowCors, ensureDatabase, json };
export type { VercelReq, VercelRes };
export async function externalAuth(req:VercelReq,res:VercelRes,scopes:string[]){
  try{return await authenticateApiKey(req,scopes);}catch(error:any){json(res,Number(error?.statusCode||401),{success:false,code:error?.message||'UNAUTHORIZED'});return null;}
}
export function fail(res:VercelRes,error:unknown){const e=error as any;json(res,Number(e?.statusCode||500),{success:false,code:e?.message||'INTERNAL_ERROR'});}
