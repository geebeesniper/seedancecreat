import { settings } from '../core/settings.js';
import type { RequestContext } from '../core/context.js';
import { FrozenUpstreamClient } from '../integrations/upstream.js';
import { AppService } from './appService.js';
import { LEGACY_METHODS } from './legacyMethods.js';
import { paymentService } from './paymentService.js';
import { authService } from './authService.js';

const obj=(x:unknown):Record<string,unknown>=>x && typeof x==='object' && !Array.isArray(x) ? x as Record<string,unknown> : {};
export class Dispatcher {
  private app=new AppService(); private up=new FrozenUpstreamClient();
  async dispatch(ctx:RequestContext,m:string,a:unknown[]):Promise<unknown>{
    if(!LEGACY_METHODS.has(m)) return {success:false,code:'UNKNOWN_METHOD',method:m};
    // First-party SaaS auth is enforced by the HTTP handler. The Wails bridge
    // implements Login/Logout/IsLoggedIn through /api/v1/auth/* directly.
    if(m==='IsLoggedIn')return true;
    if(m==='Login')return {success:false,code:'USE_AUTH_API'};
    if(m==='Logout')return {success:true};
    if(m==='GetUserInfo') {
      const u=await authService.getUser(ctx);
      return u ? {id:u.id,username:u.username,email:u.email,team_name:u.tenant_id,team:u.tenant_id,created_at:u.created_at,registerTime:u.created_at,status:u.status} : {id:ctx.userId,username:'User',team_name:ctx.tenantId,created_at:''};
    }
    // Legacy wallet/recharge UI now reads our own Supabase ledger. It no longer
    // depends on the friend's upstream server. The old WeChat checkout itself stays disabled.
    if(m==='GetWallet')return paymentService.legacyWallet(ctx);
    if(m==='GetWxPayConfig')return paymentService.legacyPaymentConfig(ctx);
    if(m==='ListRechargePackages')return paymentService.legacyRechargePackages(ctx);
    if(m==='CreateWxPayOrder')return {success:false,code:'WECHAT_DISABLED_USE_CARD_OR_ALIPAY',error:'Use Card / Alipay'};
    if(m==='QueryWxPayOrderStatus')return {success:false,code:'WECHAT_DISABLED_USE_CARD_OR_ALIPAY'};
    if(m==='ListRechargeRecords')return paymentService.legacyRechargeRecords(ctx,Number(a[0]??1),Number(a[1]??20));
    if(m==='ListFeaturePointDeductions')return paymentService.legacyDeductions(ctx,Number(a[0]??1),Number(a[1]??20),a[2]?String(a[2]):'');
    if(m==='GetMarketingActivities')return settings.upstreamBaseUrl?this.up.getMarketing(ctx):{success:true,activities:[],list:[]};
    if(m==='GetAIModels')return this.up.getModels(ctx);
    if(m==='GetFeaturePointInfo')return this.up.getFeaturePoint(ctx,String(a[0]??''));
    if(m==='ListSaaSScripts')return this.up.listScripts(ctx,String(a[0]??''));
    if(m==='GetAppVersion')return {version:settings.appVersion,platform:'web',backend:'typescript'};
    if(m==='CheckForUpdates')return {available:false,web:true};
    if(m==='GetUpdateState')return {state:'web-managed',progress:100};
    if(m==='ApplyUpdateAndRestart'||m==='DownloadUpdate')return {success:true,web:true};
    if(m==='RefreshLLMConfig')return true;
    const s=this.app;
    if(m==='CreateEmptyProject')return s.createEmptyProject(ctx,String(a[0]??'未命名项目'),Number(a[1]??0));
    if(m==='GetAllScriptProjects')return s.listProjects(ctx);
    if(m==='GetScriptProject')return s.getProject(ctx,String(a[0]));
    if(m==='RenameScriptProject')return s.renameProject(ctx,String(a[0]),String(a[1]));
    if(m==='DeleteScriptProject')return s.deleteProject(ctx,String(a[0]));
    if(m==='GetProjectEpisodes')return s.episodes(ctx,String(a[0]));
    if(m==='GetEpisodeSegments')return s.episodeSegments(ctx,String(a[0]));
    if(m==='AddManualEpisode')return s.addEpisode(ctx,String(a[0]),String(a[1]??''),String(a[2]??''));
    if(m==='UpdateEpisodeTitle')return s.updateEpisode(ctx,String(a[0]),'title',String(a[1]??''));
    if(m==='UpdateEpisodeContent')return s.updateEpisode(ctx,String(a[0]),'contentFinal',String(a[1]??''));
    if(m==='SaveEpisodeConfig')return s.saveEpisodeConfig(ctx,String(a[0]),Number(a[1]??0),Number(a[2]??0),String(a[3]??'follow'));
    if(m==='DetectScriptStructure')return s.detectStructure(String(a[0]??''));
    if(m==='StartPhysicalSplit'||m==='RestartPhysicalSplit')return s.physicalSplit(ctx,String(a[0]),Number(a[1]??1),String(a.at(-1)??''));
    if(m==='CanRestartPhysicalSplit')return true;
    if(m==='GetAllAssets')return s.assets(ctx,String(a[0]));
    if(m==='CreateAsset'){
      const asset=await s.createAsset(ctx,String(a[0]),String(a[1]),String(a[2]));
      // Original Vue code expects a JSON string and calls startsWith()/JSON.parse().
      return JSON.stringify(asset);
    }
    if(m==='DeleteAsset')return s.deleteAsset(ctx,String(a[0]));
    if(m==='UpdateAssetDescription')return s.mutateAsset(ctx,String(a[0]),{description:String(a[1]??'')});
    if(m==='UpdateAssetStyleHint')return s.mutateAsset(ctx,String(a[0]),{styleHint:String(a[1]??'')});
    if(m==='UpdateAssetPosition')return s.mutateAsset(ctx,String(a[0]),{posX:Number(a[1]??0),posY:Number(a[2]??0)});
    if(m==='ClearAssetImage')return s.mutateAsset(ctx,String(a[0]),{imagePath:''});
    if(m==='SaveAssetPromptTabs')return s.mutateAsset(ctx,String(a[0]),{promptVersions:JSON.stringify(a[1]??[]),activePromptVersion:Number(a[2]??0)});
    if(m==='GetProjectSettings')return s.projectSettings(ctx,String(a[0]));
    if(m==='SaveProjectSettings') {
      const first=obj(a[0]);
      const pid=typeof a[0]==='string'?String(a[0]):String(first.projectId??first.project_id??'');
      let payload:Record<string,unknown>;
      if(typeof a[1]==='object' && a[1]!==null && !Array.isArray(a[1])) payload=obj(a[1]);
      else if(typeof a[0]==='object' && a[0]!==null && !Array.isArray(a[0])) payload=first;
      else payload={
        segmentCount:Number(a[1]??8),
        segmentDuration:Number(a[2]??15),
        splittingMode:String(a[3]??'builtin'),
        splittingScript:String(a[4]??''),
        videoPromptScript:String(a[5]??''),
        editorModelId:String(a[6]??''),
        directorModelId:String(a[7]??''),
        promptModelId:String(a[7]??a[6]??''),
        preScriptContent:String(a[8]??''),
        selectedSchemeKey:String(a[9]??''),
        isConfigured:true,
      };
      return s.saveSettings(ctx,pid,payload);
    }
    if(m==='ListTasks')return s.listTasks(ctx);
    if(m==='ListVideoGenerations')return s.listVideos(ctx);
    if(m==='ListVideoGenerationsByProject')return s.listVideos(ctx,String(a[0]));
    if(m==='GetProjectSlices')return [];
    if(m==='GetProjectRelations')return '[]';
    if(m==='GetModelSettings')return {authenticated:true,models:[],default_model:''};
    if(m==='GetVideoFeaturePointSchema')return {success:true,schema:[]};
    if(m==='UploadAssetImage'||m==='UploadAssetAudio'||m==='CreateAssetAndUpload'||m==='FetchImageBase64')
      return `error:${m} 尚未迁移到 SaaS`;
    return {success:false,code:'NOT_MIGRATED_YET',method:m,message:`${m} endpoint retained; local GS-One behavior is not migrated yet`};
  }
}
export const dispatcher=new Dispatcher();
