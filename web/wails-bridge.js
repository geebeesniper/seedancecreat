// Browser compatibility for the original Wails frontend. No Go runtime is used.
const METHODS=["AddManualEpisode","AppendSegmentPromptVersion","ApplyUpdateAndRestart","CanRestartPhysicalSplit","CancelArchitectAnalysis","CancelEditorPipeline","CancelTask","ChatStream","CheckForUpdates","ClearAssetImage","CreateAsset","CreateAssetAndUpload","CreateEmptyProject","CreateSaasDramaOnly","CreateWxPayOrder","DeleteAsset","DeleteScriptProject","DeleteSegment","DeleteSegmentPromptVersion","DetectScriptStructure","DownloadUpdate","DownloadVideoFile","FetchImageBase64","GenerateAssetPrompt","GenerateVideo","GetAIModels","GetAllAssets","GetAllScriptProjects","GetAppVersion","GetEpisodeSegments","GetFeaturePointInfo","GetMarketingActivities","GetModelSettings","GetProjectEpisodes","GetProjectRelations","GetProjectSettings","GetProjectSlices","GetSaaSScriptDetail","GetScriptProject","GetUpdateState","GetUserInfo","GetVideoFeaturePointSchema","GetWallet","GetWxPayConfig","InsertSegmentAfter","IsLoggedIn","ListFeaturePointDeductions","ListRechargePackages","ListRechargeRecords","ListSaaSScripts","ListTasks","ListVideoGenerations","ListVideoGenerationsByProject","Login","Logout","QueryWxPayOrderStatus","RefreshLLMConfig","ReinjectProjectRefs","ReinjectSegmentRefs","RenameScriptProject","RestartPhysicalSplit","SaveAssetPromptTabs","SaveEpisodeConfig","SaveProjectSettings","SegmentHasVideos","SelectScriptFile","SetSegmentActiveVersion","SetVideoGenerationFeatured","StartDirectorPipelineV2","StartEditorPipelineRange","StartPhysicalSplit","StartSubSplitEpisode","UpdateAssetDescription","UpdateAssetPosition","UpdateAssetStyleHint","UpdateEpisodeContent","UpdateEpisodeTitle","UpdateProjectModel","UpdateSegmentAssociatedRoles","UpdateSegmentDismissedRefs","UpdateSegmentNotes","UploadAssetAudio","UploadAssetImage"];
async function invoke(method,args){const r=await fetch('/api/app/'+encodeURIComponent(method),{method:'POST',headers:{'content-type':'application/json','x-tenant-id':localStorage.getItem('gs_one_tenant')||'default','x-user-id':localStorage.getItem('gs_one_user')||'default'},body:JSON.stringify({args})});return await r.json()}
const App={};for(const m of METHODS)App[m]=(...args)=>invoke(m,args);
// Local-video autosave hook: once the user has selected a directory, any
// completed generation returned by the existing queue APIs is mirrored to
// SeedanceVideos. This does not change the generation API or payment paths.
for(const listMethod of ['ListVideoGenerations','ListVideoGenerationsByProject']){
  App[listMethod]=async(...args)=>{
    const rows=await invoke(listMethod,args);
    if(Array.isArray(rows)&&window.GSLocalVideoStorage)window.GSLocalVideoStorage.autoSaveGenerations(rows).catch(()=>{});
    return rows;
  };
}
// Original desktop DownloadVideoFile(url, filename) now writes to the user-selected local folder.
App.DownloadVideoFile=async(url,filename)=>window.GSLocalVideoStorage?window.GSLocalVideoStorage.saveUrl(url,filename):({success:false,error:'LOCAL_VIDEO_STORAGE_UNAVAILABLE'});

App.SelectScriptFile=()=>new Promise((resolve,reject)=>{const i=document.createElement('input');i.type='file';i.accept='.txt,.docx';i.onchange=()=>{const f=i.files&&i.files[0];if(!f)return resolve(null);const r=new FileReader();r.onload=()=>resolve({name:f.name,size:f.size,type:f.type,data_url:String(r.result)});r.onerror=()=>reject(r.error);r.readAsDataURL(f)};i.click()});
window.go=window.go||{};window.go.main=window.go.main||{};window.go.main.App=App;
window.runtime=window.runtime||{};window.runtime.EventsOn=(name,cb)=>()=>{};window.runtime.EventsOnMultiple=(name,cb)=>()=>{};window.runtime.EventsOff=()=>{};window.runtime.EventsEmit=()=>{};window.runtime.BrowserOpenURL=(u)=>window.open(u,'_blank');window.runtime.WindowToggleMaximise=()=>{};

// Local video-library shortcut. Local files can be viewed but never deleted by the app.
(function installLocalVideoShortcut(){
  function add(){
    if(document.getElementById('gsone-local-video-shortcut')||location.pathname.includes('local-videos'))return;
    const b=document.createElement('button');b.id='gsone-local-video-shortcut';b.type='button';
    b.style.cssText='position:fixed;right:18px;bottom:66px;z-index:180;border:1px solid rgba(52,211,153,.3);border-radius:12px;padding:10px 14px;background:#0b2a28;color:#c7fff0;font:700 12px system-ui;box-shadow:0 12px 35px rgba(0,0,0,.35);cursor:pointer';
    const paint=()=>{const st=window.GSLocalVideoStorage&&window.GSLocalVideoStorage.getStatus?window.GSLocalVideoStorage.getStatus():null;if(!st){b.textContent='📁 本地视频库';return}if(!st.supported){b.textContent='⚠️ 本地存储不支持';b.style.background='#3a1c20'}else if(st.lastError){b.textContent='⚠️ 视频目录 ERROR';b.style.background='#3a1c20'}else if(!st.configured){b.textContent='📁 选择视频目录';b.style.background='#30280e'}else if(!st.libraryReady){b.textContent='🔐 视频目录需授权';b.style.background='#30280e'}else{b.textContent='📁 本地视频库';b.style.background='#0b2a28'}};
    b.onclick=()=>{location.href='/local-videos'};document.body.appendChild(b);paint();if(window.GSLocalVideoStorage&&window.GSLocalVideoStorage.onStatus)window.GSLocalVideoStorage.onStatus(paint);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add();
})();

// SaaS payment shortcut. Original recharge UI remains untouched.
(function installSaasPaymentShortcut(){
  function add(){
    if(document.getElementById('gsone-saas-payment-shortcut')||location.pathname.includes('payments.html'))return;
    const b=document.createElement('button');b.id='gsone-saas-payment-shortcut';b.type='button';b.textContent='💳 Card / Alipay';
    b.style.cssText='position:fixed;right:18px;bottom:18px;z-index:180;border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:10px 14px;background:#111827;color:#fff;font:600 12px system-ui;box-shadow:0 12px 35px rgba(0,0,0,.35);cursor:pointer';
    b.onclick=()=>{location.href='/payments.html'};document.body.appendChild(b);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add();
})();
