import type { FastifyInstance } from 'fastify';
import { buildContext } from '../core/context.js';
import { dispatcher } from '../services/dispatcher.js';

export async function legacyRoutes(app:FastifyInstance){
  app.post<{Params:{method:string};Body:{args?:unknown[]}}>('/api/app/:method',async(req)=>{
    try { return await dispatcher.dispatch(buildContext(req),req.params.method,Array.isArray(req.body?.args)?req.body.args:[]); }
    catch(error){ return {success:false,error:error instanceof Error?error.message:String(error),method:req.params.method}; }
  });
}
