import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import type { RequestContext } from '../core/context.js';
import { dispatcher } from './dispatcher.js';

const now=()=>new Date().toISOString();
const parse=(s:string)=>{try{return JSON.parse(s);}catch{return {};}};
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const pick=(o:Record<string,unknown>,...keys:string[])=>{for(const k of keys) if(o[k]!=null&&o[k]!=='') return o[k]; return undefined;};

export type GenerateVideoInput={
  projectId?:string; episodeId?:string; segmentId?:string; shotSeq?:number; featurePointKey?:string;
  model?:string; prompt:string; duration?:number; resolution?:string; aspectRatio?:string; params?:Record<string,unknown>;
};

function view(x:any){return {id:x.id,project_id:x.projectId,projectId:x.projectId,episode_id:x.episodeId,episodeId:x.episodeId,segment_id:x.segmentId,segmentId:x.segmentId,shot_seq:x.shotSeq,shotSeq:x.shotSeq,feature_point_key:x.featurePointKey,featurePointKey:x.featurePointKey,model_name:x.modelName,modelName:x.modelName,prompt:x.prompt,params:parse(x.params),status:x.status,rh_task_id:x.rhTaskId,rhTaskId:x.rhTaskId,result_url:x.resultUrl,resultUrl:x.resultUrl,video_url:x.videoUrl,videoUrl:x.videoUrl,error:x.error,is_featured:Boolean(x.isFeatured),isFeatured:Boolean(x.isFeatured),created_at:x.createdAt,createdAt:x.createdAt,updated_at:x.updatedAt,updatedAt:x.updatedAt};}

export class ExternalVideoApiService{
  async generate(ctx:RequestContext,input:GenerateVideoInput){
    const prompt=String(input.prompt||'').trim();
    if(!prompt) throw Object.assign(new Error('PROMPT_REQUIRED'),{statusCode:400});
    const id=randomUUID(), t=now();
    const params={...(input.params||{}),duration:input.duration,resolution:input.resolution,aspect_ratio:input.aspectRatio,external_api:true};
    const row={id,tenantId:ctx.tenantId,userId:ctx.userId,projectId:input.projectId||'external',episodeId:input.episodeId||null,segmentId:input.segmentId||null,shotSeq:Number(input.shotSeq||0),featurePointKey:input.featurePointKey||'video_generation',modelName:input.model||'',prompt,params:JSON.stringify(params),status:'submitting',rhTaskId:'',resultUrl:'',videoUrl:'',error:'',isFeatured:0,createdAt:t,updatedAt:t};
    await db.insertInto('video_generations').values(row).execute();

    const legacyPayload={project_id:row.projectId,projectId:row.projectId,episode_id:row.episodeId,episodeId:row.episodeId,segment_id:row.segmentId,segmentId:row.segmentId,shot_seq:row.shotSeq,shotSeq:row.shotSeq,feature_point_key:row.featurePointKey,featurePointKey:row.featurePointKey,model:row.modelName,model_name:row.modelName,prompt,...params};
    let providerResult:unknown;
    try{providerResult=await dispatcher.dispatch(ctx,'GenerateVideo',[legacyPayload]);}
    catch(error){providerResult={success:false,error:error instanceof Error?error.message:String(error)};}
    let normalized=providerResult;
    if(typeof normalized==='string'){try{normalized=JSON.parse(normalized);}catch{normalized={message:normalized};}}
    const result=obj(normalized), success=result.success!==false;
    const taskId=String(pick(result,'rh_task_id','rhTaskId','task_id','taskId')||'');
    const videoUrl=String(pick(result,'video_url','videoUrl','url')||'');
    const resultUrl=String(pick(result,'result_url','resultUrl')||videoUrl||'');
    let status=videoUrl?'completed':taskId?'processing':success?'queued':'error';
    const code=String(pick(result,'code','error')||'');
    const error=status==='error'?String(pick(result,'message','error','code')||'VIDEO_SUBMISSION_FAILED'):'';
    await db.updateTable('video_generations').set({status,rhTaskId:taskId,resultUrl,videoUrl,error,updatedAt:now()}).where('id','=',id).execute();
    const saved=await db.selectFrom('video_generations').selectAll().where('id','=',id).executeTakeFirstOrThrow();
    return {success:status!=='error',generation:view(saved),provider_result:providerResult,code:status==='error'?(code||'VIDEO_SUBMISSION_FAILED'):undefined};
  }

  async get(ctx:RequestContext,id:string){const row=await db.selectFrom('video_generations').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId).executeTakeFirst();return row?view(row):null;}
  async list(ctx:RequestContext,filter:{projectId?:string;status?:string;limit?:number}={}){
    let q=db.selectFrom('video_generations').selectAll().where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId);
    if(filter.projectId)q=q.where('projectId','=',filter.projectId); if(filter.status)q=q.where('status','=',filter.status);
    const rows=await q.orderBy('createdAt','desc').limit(Math.min(Math.max(Number(filter.limit||50),1),100)).execute(); return rows.map(view);
  }
  async cancel(ctx:RequestContext,id:string){
    const row=await db.selectFrom('video_generations').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId).executeTakeFirst();
    if(!row) throw Object.assign(new Error('VIDEO_GENERATION_NOT_FOUND'),{statusCode:404});
    let providerResult:unknown={success:true,local_only:true};
    if(row.rhTaskId){try{providerResult=await dispatcher.dispatch(ctx,'CancelTask',[row.rhTaskId]);}catch(error){providerResult={success:false,error:error instanceof Error?error.message:String(error)};}}
    const r=obj(providerResult); if(r.success===false) return {success:false,generation:view(row),provider_result:providerResult};
    await db.updateTable('video_generations').set({status:'cancelled',updatedAt:now()}).where('id','=',id).execute();
    return {success:true,generation:await this.get(ctx,id),provider_result:providerResult};
  }
  models(ctx:RequestContext){return dispatcher.dispatch(ctx,'GetAIModels',[]);}
  wallet(ctx:RequestContext){return dispatcher.dispatch(ctx,'GetWallet',[]);}
}
export const externalVideoApiService=new ExternalVideoApiService();
