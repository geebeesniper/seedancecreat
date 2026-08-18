import { buildSchema, graphql } from 'graphql';
import { bodyJson, queryValue, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { allowCors,ensureDatabase,externalAuth,json } from '../src/externalApiHttp.js';
import { externalVideoApiService } from '../src/services/externalVideoApiService.js';

const schema=buildSchema(`
  type ApiInfo { name:String!, version:String!, rest:String!, graphql:String! }
  type JsonPayload { json:String! }
  type VideoGeneration { id:ID!, projectId:String!, episodeId:String, segmentId:String, shotSeq:Int!, featurePointKey:String!, modelName:String!, prompt:String!, paramsJson:String!, status:String!, rhTaskId:String!, resultUrl:String!, videoUrl:String!, error:String!, isFeatured:Boolean!, createdAt:String!, updatedAt:String! }
  type VideoGenerationConnection { items:[VideoGeneration!]!, count:Int! }
  input GenerateVideoInput { projectId:String, episodeId:String, segmentId:String, shotSeq:Int, featurePointKey:String, model:String, prompt:String!, duration:Int, resolution:String, aspectRatio:String, paramsJson:String }
  type GenerateVideoPayload { success:Boolean!, code:String, generation:VideoGeneration, providerResultJson:String! }
  type CancelVideoPayload { success:Boolean!, generation:VideoGeneration, providerResultJson:String! }
  type Query { apiInfo:ApiInfo!, videoGeneration(id:ID!):VideoGeneration, videoGenerations(projectId:String,status:String,limit:Int):VideoGenerationConnection!, models:JsonPayload!, wallet:JsonPayload! }
  type Mutation { generateVideo(input:GenerateVideoInput!):GenerateVideoPayload!, cancelVideoGeneration(id:ID!):CancelVideoPayload! }
`);

function gqlVideo(x:any){if(!x)return null;return {id:x.id,projectId:x.projectId??x.project_id,episodeId:x.episodeId??x.episode_id,segmentId:x.segmentId??x.segment_id,shotSeq:Number(x.shotSeq??x.shot_seq??0),featurePointKey:String(x.featurePointKey??x.feature_point_key??''),modelName:String(x.modelName??x.model_name??''),prompt:String(x.prompt??''),paramsJson:JSON.stringify(x.params??{}),status:String(x.status??''),rhTaskId:String(x.rhTaskId??x.rh_task_id??''),resultUrl:String(x.resultUrl??x.result_url??''),videoUrl:String(x.videoUrl??x.video_url??''),error:String(x.error??''),isFeatured:Boolean(x.isFeatured??x.is_featured),createdAt:String(x.createdAt??x.created_at??''),updatedAt:String(x.updatedAt??x.updated_at??'')};}

export default async function handler(req:VercelReq,res:VercelRes){
  if(allowCors(req,res))return;
  if((req.method||'GET').toUpperCase()==='GET'&&!queryValue(req,'query'))return json(res,200,{name:'GS-One GraphQL API',endpoint:'/api/graphql',method:'POST',auth:'Bearer API key',example:'query { apiInfo { name version } }'});
  if(!(await ensureDatabase(res)))return;
  const auth=await externalAuth(req,res,[]);if(!auth)return;
  const requireScope=(scope:string)=>{if(!auth.scopes.includes('*')&&!auth.scopes.includes(scope)) throw new Error(`MISSING_SCOPE:${scope}`);};
  const b=(req.method||'GET').toUpperCase()==='GET'?{query:queryValue(req,'query')||'',variables:{}}:await bodyJson(req);
  const source=String(b.query||''); if(!source)return json(res,400,{errors:[{message:'GRAPHQL_QUERY_REQUIRED'}]});
  let variables:Record<string,unknown>={}; if(b.variables&&typeof b.variables==='object'&&!Array.isArray(b.variables))variables=b.variables as Record<string,unknown>;
  const root={
    apiInfo:()=>({name:'GS-One External API',version:'v1',rest:'/api/v1',graphql:'/api/graphql'}),
    videoGeneration:async({id}:{id:string})=>{requireScope('videos:read');return gqlVideo(await externalVideoApiService.get(auth.ctx,id));},
    videoGenerations:async(args:any)=>{requireScope('videos:read');const items=await externalVideoApiService.list(auth.ctx,{projectId:args.projectId,status:args.status,limit:args.limit});return {items:items.map(gqlVideo),count:items.length};},
    models:async()=>{requireScope('models:read');return {json:JSON.stringify(await externalVideoApiService.models(auth.ctx))};},
    wallet:async()=>{requireScope('wallet:read');return {json:JSON.stringify(await externalVideoApiService.wallet(auth.ctx))};},
    generateVideo:async({input}:{input:any})=>{requireScope('videos:write');let params={};try{params=input.paramsJson?JSON.parse(input.paramsJson):{};}catch{throw new Error('INVALID_PARAMS_JSON');}const r=await externalVideoApiService.generate(auth.ctx,{...input,params});return {success:r.success,code:r.code,generation:gqlVideo(r.generation),providerResultJson:JSON.stringify(r.provider_result??null)};},
    cancelVideoGeneration:async({id}:{id:string})=>{requireScope('videos:write');const r=await externalVideoApiService.cancel(auth.ctx,id);return {success:r.success,generation:gqlVideo(r.generation),providerResultJson:JSON.stringify(r.provider_result??null)};},
  };
  const result=await graphql({schema,source,rootValue:root,variableValues:variables,operationName:b.operationName?String(b.operationName):undefined});
  json(res,200,result);
}
