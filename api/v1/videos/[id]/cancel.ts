import { queryValue } from '../../../../src/apiUtils.js';
import { allowCors,ensureDatabase,externalAuth,fail,json,type VercelReq,type VercelRes } from '../../../../src/externalApiHttp.js';
import { externalVideoApiService } from '../../../../src/services/externalVideoApiService.js';
export default async function handler(req:VercelReq,res:VercelRes){if(allowCors(req,res))return;if((req.method||'').toUpperCase()!=='POST')return json(res,405,{success:false,code:'METHOD_NOT_ALLOWED'});if(!(await ensureDatabase(res)))return;const auth=await externalAuth(req,res,['videos:write']);if(!auth)return;try{json(res,200,await externalVideoApiService.cancel(auth.ctx,queryValue(req,'id')||''));}catch(e){fail(res,e);}}
