import { buildSchema, graphql } from 'graphql';
import { bearerToken, bodyJson, queryValue, type VercelReq, type VercelRes } from '../src/apiUtils.js';
import { allowCors,ensureDatabase,json } from '../src/externalApiHttp.js';
import { authenticateApiKey } from '../src/services/apiKeyService.js';
import { authService } from '../src/services/authService.js';
import { externalVideoApiService } from '../src/services/externalVideoApiService.js';

const schema=buildSchema(`
  type ApiInfo { name:String!, version:String!, rest:String!, graphql:String! }
  type JsonPayload { json:String! }
  type User { id:ID!, tenantId:String!, username:String!, email:String!, status:String!, createdAt:String! }
  type AuthPayload { success:Boolean!, token:String!, tokenType:String!, expiresAt:String!, user:User! }
  type AuthAction { success:Boolean! }
  type VideoGeneration { id:ID!, projectId:String!, episodeId:String, segmentId:String, shotSeq:Int!, featurePointKey:String!, modelName:String!, prompt:String!, paramsJson:String!, status:String!, rhTaskId:String!, resultUrl:String!, videoUrl:String!, error:String!, isFeatured:Boolean!, createdAt:String!, updatedAt:String! }
  type VideoGenerationConnection { items:[VideoGeneration!]!, count:Int! }
  input GenerateVideoInput { projectId:String, episodeId:String, segmentId:String, shotSeq:Int, featurePointKey:String, model:String, prompt:String!, duration:Int, resolution:String, aspectRatio:String, paramsJson:String }
  type GenerateVideoPayload { success:Boolean!, code:String, generation:VideoGeneration, providerResultJson:String! }
  type CancelVideoPayload { success:Boolean!, generation:VideoGeneration, providerResultJson:String! }
  type Query { apiInfo:ApiInfo!, authMe:User, videoGeneration(id:ID!):VideoGeneration, videoGenerations(projectId:String,status:String,limit:Int):VideoGenerationConnection!, models:JsonPayload!, wallet:JsonPayload! }
  type Mutation { register(username:String!,email:String,password:String!):AuthPayload!, login(identifier:String!,password:String!):AuthPayload!, logout:AuthAction!, generateVideo(input:GenerateVideoInput!):GenerateVideoPayload!, cancelVideoGeneration(id:ID!):CancelVideoPayload! }
`);

function gqlUser(x:any){if(!x)return null;return {id:x.id,tenantId:x.tenant_id??x.tenantId,username:x.username,email:x.email||'',status:x.status||'active',createdAt:x.created_at??x.createdAt??''};}
function gqlAuth(x:any){return {success:Boolean(x.success),token:String(x.token||''),tokenType:String(x.token_type||'Bearer'),expiresAt:String(x.expires_at||''),user:gqlUser(x.user)};}
function gqlVideo(x:any){if(!x)return null;return {id:x.id,projectId:x.projectId??x.project_id,episodeId:x.episodeId??x.episode_id,segmentId:x.segmentId??x.segment_id,shotSeq:Number(x.shotSeq??x.shot_seq??0),featurePointKey:String(x.featurePointKey??x.feature_point_key??''),modelName:String(x.modelName??x.model_name??''),prompt:String(x.prompt??''),paramsJson:JSON.stringify(x.params??{}),status:String(x.status??''),rhTaskId:String(x.rhTaskId??x.rh_task_id??''),resultUrl:String(x.resultUrl??x.result_url??''),videoUrl:String(x.videoUrl??x.video_url??''),error:String(x.error??''),isFeatured:Boolean(x.isFeatured??x.is_featured),createdAt:String(x.createdAt??x.created_at??''),updatedAt:String(x.updatedAt??x.updated_at??'')};}

export default async function handler(req:VercelReq,res:VercelRes){
  if(allowCors(req,res))return;
  if((req.method||'GET').toUpperCase()==='GET'&&!queryValue(req,'query'))return json(res,200,{name:'GS-One GraphQL API',endpoint:'/api/graphql',method:'POST',auth:'Login mutations return gs_session_*; video API uses sk_test_* / sk_live_*',example:'mutation { login(identifier:"name", password:"password") { token user { username } } }'});
  if(!(await ensureDatabase(res)))return;
  const b=(req.method||'GET').toUpperCase()==='GET'?{query:queryValue(req,'query')||'',variables:{}}:await bodyJson(req);
  const source=String(b.query||''); if(!source)return json(res,400,{errors:[{message:'GRAPHQL_QUERY_REQUIRED'}]});
  let variables:Record<string,unknown>={}; if(b.variables&&typeof b.variables==='object'&&!Array.isArray(b.variables))variables=b.variables as Record<string,unknown>;
  const apiAuth=(scope:string)=>authenticateApiKey(req,[scope]);
  const session=()=>authService.authenticate(bearerToken(req));
  const root={
    apiInfo:()=>({name:'GS-One External API',version:'v1',rest:'/api/v1',graphql:'/api/graphql'}),
    register:async({username,email,password}:any)=>gqlAuth(await authService.register({username,email,password})),
    login:async({identifier,password}:any)=>gqlAuth(await authService.login({identifier,password})),
    logout:async()=>{const token=bearerToken(req);const a=await session();if(!a)throw new Error('AUTH_REQUIRED');return authService.logout(token);},
    authMe:async()=>{const a=await session();return a?gqlUser(a.user):null;},
    videoGeneration:async({id}:{id:string})=>{const a=await apiAuth('videos:read');return gqlVideo(await externalVideoApiService.get(a.ctx,id));},
    videoGenerations:async(args:any)=>{const a=await apiAuth('videos:read');const items=await externalVideoApiService.list(a.ctx,{projectId:args.projectId,status:args.status,limit:args.limit});return {items:items.map(gqlVideo),count:items.length};},
    models:async()=>{const a=await apiAuth('models:read');return {json:JSON.stringify(await externalVideoApiService.models(a.ctx))};},
    wallet:async()=>{const a=await apiAuth('wallet:read');return {json:JSON.stringify(await externalVideoApiService.wallet(a.ctx))};},
    generateVideo:async({input}:{input:any})=>{const a=await apiAuth('videos:write');let params={};try{params=input.paramsJson?JSON.parse(input.paramsJson):{};}catch{throw new Error('INVALID_PARAMS_JSON');}const r=await externalVideoApiService.generate(a.ctx,{...input,params});return {success:r.success,code:r.code,generation:gqlVideo(r.generation),providerResultJson:JSON.stringify(r.provider_result??null)};},
    cancelVideoGeneration:async({id}:{id:string})=>{const a=await apiAuth('videos:write');const r=await externalVideoApiService.cancel(a.ctx,id);return {success:r.success,generation:gqlVideo(r.generation),providerResultJson:JSON.stringify(r.provider_result??null)};},
  };
  const result=await graphql({schema,source,rootValue:root,variableValues:variables,operationName:b.operationName?String(b.operationName):undefined});
  json(res,200,result);
}
