import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import type { AssetTable, EpisodeTable, ProjectSettingTable, ProjectTable, SegmentTable } from '../db/types.js';
import type { RequestContext } from '../core/context.js';

const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? null);
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function projectView(x: ProjectTable) {
  const tokensUsed = parseJson(x.tokensUsed, {});
  return {
    id:x.id, file_name:x.fileName, fileName:x.fileName, total_chars:x.totalChars, totalChars:x.totalChars,
    slice_count:x.sliceCount, sliceCount:x.sliceCount, outline:x.outline, status:x.status, error_msg:x.errorMsg,
    errorMsg:x.errorMsg, tokens_used:tokensUsed, tokensUsed, episode_count:x.episodeCount, episodeCount:x.episodeCount,
    episode_duration:x.episodeDuration, episodeDuration:x.episodeDuration, split_method:x.splitMethod, splitMethod:x.splitMethod,
    model_id:x.modelId, modelId:x.modelId, unified_code:x.unifiedCode, unifiedCode:x.unifiedCode,
    saas_drama_id:x.saasDramaId, saasDramaId:x.saasDramaId, created_at:x.createdAt, createdAt:x.createdAt,
    updated_at:x.updatedAt, updatedAt:x.updatedAt,
  };
}
function episodeView(x: EpisodeTable) {
  const sliceIds = parseJson<unknown[]>(x.sliceIds, []);
  return { id:x.id, project_id:x.projectId, projectId:x.projectId, ep_num:x.epNum, epNum:x.epNum, title:x.title,
    summary:x.summary, content_raw:x.contentRaw, contentRaw:x.contentRaw, content_final:x.contentFinal,
    contentFinal:x.contentFinal, status:x.status, duration_est:x.durationEst, durationEst:x.durationEst,
    slice_ids:sliceIds, sliceIds, created_at:x.createdAt, createdAt:x.createdAt, updated_at:x.updatedAt, updatedAt:x.updatedAt };
}
function segmentView(x: SegmentTable) {
  const associatedRoles=parseJson<unknown[]>(x.associatedRoles,[]), dismissedRefs=parseJson<unknown[]>(x.dismissedRefs,[]), promptVersions=parseJson<unknown[]>(x.promptVersions,[]);
  return { id:x.id, project_id:x.projectId, projectId:x.projectId, episode_id:x.episodeId, episodeId:x.episodeId,
    ep_num:x.epNum, epNum:x.epNum, seq:x.seq, time_start:x.timeStart, timeStart:x.timeStart, time_end:x.timeEnd,
    timeEnd:x.timeEnd, scene_desc:x.sceneDesc, sceneDesc:x.sceneDesc, dialogue:x.dialogue, action_desc:x.actionDesc,
    actionDesc:x.actionDesc, emotion:x.emotion, video_prompt:x.videoPrompt, videoPrompt:x.videoPrompt,
    associated_roles:associatedRoles, associatedRoles, dismissed_refs:dismissedRefs, dismissedRefs,
    start_frame:x.startFrame, startFrame:x.startFrame, end_frame:x.endFrame, endFrame:x.endFrame,
    improvement_notes:x.improvementNotes, improvementNotes:x.improvementNotes, prompt_versions:promptVersions,
    promptVersions, active_version:x.activeVersion, activeVersion:x.activeVersion, is_inserted:Boolean(x.isInserted),
    isInserted:Boolean(x.isInserted), status:x.status, video_url:x.videoUrl, videoUrl:x.videoUrl };
}
function assetView(x: AssetTable) {
  const promptVersions=parseJson<unknown[]>(x.promptVersions,[]);
  return { id:x.id, project_id:x.projectId, projectId:x.projectId, name:x.name, type:x.type, description:x.description,
    image_path:x.imagePath, imagePath:x.imagePath, audio_path:x.audioPath, audioPath:x.audioPath, importance:x.importance,
    style_hint:x.styleHint, styleHint:x.styleHint,
    // The extracted Vue client calls JSON.parse(asset.prompt_versions). Keep the legacy
    // snake_case field as JSON text while also exposing a parsed camelCase field.
    prompt_versions:x.promptVersions||'[]', promptVersions,
    active_prompt_version:x.activePromptVersion, activePromptVersion:x.activePromptVersion, pos_x:x.posX, posX:x.posX, pos_y:x.posY, posY:x.posY };
}

const defaults = {
  segmentCount:8, segmentDuration:15, splittingMode:'builtin', splittingScript:'', videoPromptScript:'', editorModelId:'',
  directorModelId:'', promptModelId:'', preScriptContent:'', selectedSchemeKey:'', isConfigured:0,
};

export class AppService {
  async createEmptyProject(ctx:RequestContext,name='未命名项目',episodeCount=0) {
    const t=now(); const row:ProjectTable={ id:randomUUID(), tenantId:ctx.tenantId, userId:ctx.userId, fileName:name||'未命名项目', storageKey:'', totalChars:0,
      sliceCount:0, outline:'', status:0, errorMsg:'', tokensUsed:'{}', episodeCount:Number(episodeCount||0), episodeDuration:0,
      splitMethod:'builtin', modelId:'', unifiedCode:randomUUID().replace(/-/g,'').slice(0,12), saasDramaId:null, createdAt:t, updatedAt:t };
    await db.insertInto('projects').values(row).execute();
    const project=projectView(row);
    // Legacy Wails/Vue contract: the UI reads project_id and unified_code directly.
    return {success:true, project_id:row.id, projectId:row.id, unified_code:row.unifiedCode, unifiedCode:row.unifiedCode, file_name:row.fileName, fileName:row.fileName, project};
  }
  async listProjects(ctx:RequestContext) {
    const rows=await db.selectFrom('projects').selectAll().where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId).orderBy('updatedAt','desc').execute();
    return rows.map(projectView);
  }
  async getProject(ctx:RequestContext,id:string) {
    const row=await db.selectFrom('projects').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst(); return row?projectView(row):null;
  }
  async renameProject(ctx:RequestContext,id:string,name:string) {
    await db.updateTable('projects').set({fileName:name,updatedAt:now()}).where('id','=',id).where('tenantId','=',ctx.tenantId).execute();
    const row=await db.selectFrom('projects').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    if(!row) return {success:false,error:'PROJECT_NOT_FOUND'};
    return {success:row.fileName===name,file_name:row.fileName,fileName:row.fileName,project:projectView(row)};
  }
  async deleteProject(ctx:RequestContext,id:string) {
    await db.transaction().execute(async trx=>{
      await trx.deleteFrom('segments').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('episodes').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('assets').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('project_settings').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('video_generations').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('jobs').where('projectId','=',id).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('projects').where('id','=',id).where('tenantId','=',ctx.tenantId).execute();
    });
    const stillThere=await db.selectFrom('projects').select('id').where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    return stillThere ? {success:false,error:'DELETE_NOT_APPLIED',project_id:id} : {success:true,deleted:true,project_id:id,projectId:id};
  }
  async episodes(ctx:RequestContext,pid:string) {
    return (await db.selectFrom('episodes').selectAll().where('projectId','=',pid).where('tenantId','=',ctx.tenantId).orderBy('epNum').execute()).map(episodeView);
  }
  async episodeSegments(ctx:RequestContext,eid:string) {
    return (await db.selectFrom('segments').selectAll().where('episodeId','=',eid).where('tenantId','=',ctx.tenantId).orderBy('seq').execute()).map(segmentView);
  }
  async addEpisode(ctx:RequestContext,pid:string,title='',content='') {
    const last=await db.selectFrom('episodes').select(['epNum']).where('projectId','=',pid).where('tenantId','=',ctx.tenantId).orderBy('epNum','desc').executeTakeFirst();
    const n=(last?.epNum||0)+1,t=now(); const row:EpisodeTable={id:randomUUID(),tenantId:ctx.tenantId,projectId:pid,epNum:n,title:title||`第 ${n} 集`,summary:'',contentRaw:content||'',contentFinal:content||'',status:0,durationEst:0,sliceIds:'[]',createdAt:t,updatedAt:t};
    await db.transaction().execute(async trx=>{ await trx.insertInto('episodes').values(row).execute(); await trx.updateTable('projects').set({episodeCount:n,updatedAt:t}).where('id','=',pid).execute(); });
    return episodeView(row);
  }
  async saveEpisodeConfig(ctx:RequestContext,pid:string,episodeCount:number,episodeDuration:number,splitMethod:string) {
    await db.updateTable('projects').set({
      episodeCount:Math.max(0,Number(episodeCount||0)),
      episodeDuration:Math.max(0,Number(episodeDuration||0)),
      splitMethod:splitMethod||'follow',
      updatedAt:now(),
    }).where('id','=',pid).where('tenantId','=',ctx.tenantId).execute();
    const row=await db.selectFrom('projects').selectAll().where('id','=',pid).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    if(!row) throw new Error('PROJECT_NOT_FOUND');
    return {success:true,project_id:pid,projectId:pid,episode_count:row.episodeCount,episodeCount:row.episodeCount,episode_duration:row.episodeDuration,episodeDuration:row.episodeDuration,split_method:row.splitMethod,splitMethod:row.splitMethod};
  }

  async updateEpisode(ctx:RequestContext,id:string,field:'title'|'contentFinal',value:string) {
    await db.updateTable('episodes').set({...{[field]:value},updatedAt:now()}).where('id','=',id).where('tenantId','=',ctx.tenantId).execute();
    const row=await db.selectFrom('episodes').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst(); return row?episodeView(row):false;
  }
  async assets(ctx:RequestContext,pid:string) {
    return (await db.selectFrom('assets').selectAll().where('projectId','=',pid).where('tenantId','=',ctx.tenantId).execute()).map(assetView);
  }
  async createAsset(ctx:RequestContext,pid:string,name:string,type:string) {
    const t=now(); const row:AssetTable={id:randomUUID(),tenantId:ctx.tenantId,projectId:pid,name,type,description:'',imagePath:'',audioPath:'',importance:2,styleHint:'',promptVersions:'[]',activePromptVersion:0,posX:0,posY:0,createdAt:t,updatedAt:t};
    await db.insertInto('assets').values(row).execute(); return assetView(row);
  }
  async mutateAsset(ctx:RequestContext,id:string,patch:Partial<Pick<AssetTable,'description'|'styleHint'|'posX'|'posY'|'imagePath'|'audioPath'|'promptVersions'|'activePromptVersion'>>) {
    await db.updateTable('assets').set({...patch,updatedAt:now()}).where('id','=',id).where('tenantId','=',ctx.tenantId).execute();
    const row=await db.selectFrom('assets').selectAll().where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst(); return row?assetView(row):false;
  }
  async deleteAsset(ctx:RequestContext,id:string) {
    await db.deleteFrom('assets').where('id','=',id).where('tenantId','=',ctx.tenantId).execute();
    const stillThere=await db.selectFrom('assets').select('id').where('id','=',id).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    // Legacy asset UI expects exactly "ok" or an "error:" string.
    return stillThere ? 'error:删除未生效' : 'ok';
  }

  private settingView(pid:string,row?:ProjectSettingTable) {
    const x=row||({projectId:pid,tenantId:'',...defaults} as ProjectSettingTable);
    return { project_id:pid,projectId:pid,segment_count:x.segmentCount,segmentCount:x.segmentCount,segment_duration:x.segmentDuration,segmentDuration:x.segmentDuration,
      splitting_mode:x.splittingMode,splittingMode:x.splittingMode,splitting_script:x.splittingScript,splittingScript:x.splittingScript,
      video_prompt_script:x.videoPromptScript,videoPromptScript:x.videoPromptScript,editor_model_id:x.editorModelId,editorModelId:x.editorModelId,
      director_model_id:x.directorModelId,directorModelId:x.directorModelId,prompt_model_id:x.promptModelId,promptModelId:x.promptModelId,
      pre_script_content:x.preScriptContent,preScriptContent:x.preScriptContent,selected_scheme_key:x.selectedSchemeKey,selectedSchemeKey:x.selectedSchemeKey,
      is_configured:Boolean(x.isConfigured),isConfigured:Boolean(x.isConfigured) };
  }
  async projectSettings(ctx:RequestContext,pid:string) {
    const row=await db.selectFrom('project_settings').selectAll().where('projectId','=',pid).where('tenantId','=',ctx.tenantId).executeTakeFirst(); return this.settingView(pid,row);
  }
  async saveSettings(ctx:RequestContext,pid:string,payload:Record<string,unknown>) {
    const pick=(camel:string,snake:string,fallback:unknown)=>payload[camel]??payload[snake]??fallback;
    const row:ProjectSettingTable={projectId:pid,tenantId:ctx.tenantId,segmentCount:Number(pick('segmentCount','segment_count',8)),segmentDuration:Number(pick('segmentDuration','segment_duration',15)),splittingMode:String(pick('splittingMode','splitting_mode','builtin')),splittingScript:String(pick('splittingScript','splitting_script','')),videoPromptScript:String(pick('videoPromptScript','video_prompt_script','')),editorModelId:String(pick('editorModelId','editor_model_id','')),directorModelId:String(pick('directorModelId','director_model_id','')),promptModelId:String(pick('promptModelId','prompt_model_id','')),preScriptContent:String(pick('preScriptContent','pre_script_content','')),selectedSchemeKey:String(pick('selectedSchemeKey','selected_scheme_key','')),isConfigured:pick('isConfigured','is_configured',false)?1:0};
    const exists=await db.selectFrom('project_settings').select('projectId').where('projectId','=',pid).where('tenantId','=',ctx.tenantId).executeTakeFirst();
    if(exists) await db.updateTable('project_settings').set(row).where('projectId','=',pid).where('tenantId','=',ctx.tenantId).execute(); else await db.insertInto('project_settings').values(row).execute();
    return this.settingView(pid,row);
  }
  detectStructure(content:string) {
    const patterns=[/^\s*第\s*([一二三四五六七八九十百千万0-9]+)\s*[集章回]/gmu,/^\s*Episode\s+(\d+)\b/gmi,/^\s*#{1,6}\s*第?\s*([0-9]+)\s*[集章回]?/gm];
    let markers:{index:number;text:string}[]=[];
    for(const re of patterns){ markers=[...content.matchAll(re)].map(m=>({index:m.index||0,text:m[0].trim()})); if(markers.length>=2) break; }
    const yes=markers.length>=2; return {has_episode_markers:yes,hasEpisodeMarkers:yes,marker_count:markers.length,markerCount:markers.length,markers};
  }
  async physicalSplit(ctx:RequestContext,pid:string,target:number,content:string) {
    const st=this.detectStructure(content); const starts=st.markers.map(m=>m.index); let parts:string[]=[];
    if(starts.length>=2) parts=starts.map((start,i)=>content.slice(start,starts[i+1]??content.length).trim());
    else { target=Math.max(1,Number(target||1)); const lines=content.match(/.*(?:\r?\n|$)/g)?.filter(Boolean)||['']; const size=Math.max(1,Math.ceil(lines.length/target)); for(let i=0;i<lines.length;i+=size) parts.push(lines.slice(i,i+size).join('').trim()); if(!parts.length)parts=['']; }
    const t=now(); await db.transaction().execute(async trx=>{
      await trx.deleteFrom('segments').where('projectId','=',pid).where('tenantId','=',ctx.tenantId).execute();
      await trx.deleteFrom('episodes').where('projectId','=',pid).where('tenantId','=',ctx.tenantId).execute();
      for(let i=0;i<parts.length;i++) await trx.insertInto('episodes').values({id:randomUUID(),tenantId:ctx.tenantId,projectId:pid,epNum:i+1,title:`第 ${String(i+1).padStart(2,'0')} 集`,summary:'',contentRaw:parts[i],contentFinal:parts[i],status:0,durationEst:0,sliceIds:'[]',createdAt:t,updatedAt:t}).execute();
      await trx.updateTable('projects').set({episodeCount:parts.length,status:2,updatedAt:t}).where('id','=',pid).where('tenantId','=',ctx.tenantId).execute();
    }); return {success:true,episode_count:parts.length,episodeCount:parts.length,detected:st.has_episode_markers};
  }
  async listTasks(ctx:RequestContext) {
    const rows=await db.selectFrom('jobs').selectAll().where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId).orderBy('createdAt','desc').execute();
    return rows.map(x=>({id:x.id,kind:x.kind,status:x.status,progress:x.progress,message:x.message,project_id:x.projectId,projectId:x.projectId,result:parseJson(x.result,null),error:x.error}));
  }
  async listVideos(ctx:RequestContext,pid?:string) {
    let q=db.selectFrom('video_generations').selectAll().where('tenantId','=',ctx.tenantId).where('userId','=',ctx.userId); if(pid) q=q.where('projectId','=',pid);
    const rows=await q.orderBy('createdAt','desc').execute();
    return rows.map(x=>({id:x.id,tenant_id:x.tenantId,user_id:x.userId,project_id:x.projectId,episode_id:x.episodeId,segment_id:x.segmentId,shot_seq:x.shotSeq,feature_point_key:x.featurePointKey,model_name:x.modelName,prompt:x.prompt,params:parseJson(x.params,{}),status:x.status,rh_task_id:x.rhTaskId,result_url:x.resultUrl,video_url:x.videoUrl,error:x.error,is_featured:Boolean(x.isFeatured),created_at:x.createdAt,updated_at:x.updatedAt}));
  }
}
