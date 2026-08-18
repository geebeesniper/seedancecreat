(function(){
  const TOKEN='gs_one_session';
  window.GSAuth={
    token:()=>localStorage.getItem(TOKEN)||'',
    headers:()=>{const t=localStorage.getItem(TOKEN)||'';return t?{authorization:'Bearer '+t}:{}},
    clear:()=>{localStorage.removeItem(TOKEN);localStorage.removeItem('gs_one_user');localStorage.removeItem('gs_one_tenant');localStorage.removeItem('gs_one_username');},
    goLogin:()=>{const next=location.pathname+location.search+location.hash;location.replace('/login.html?next='+encodeURIComponent(next));}
  };
  const t=window.GSAuth.token();
  if(!t){window.GSAuth.goLogin();return;}
  fetch('/api/v1/auth/me',{headers:{authorization:'Bearer '+t},cache:'no-store'}).then(async r=>{
    if(!r.ok){window.GSAuth.clear();window.GSAuth.goLogin();return;}
    const j=await r.json();if(j&&j.user){localStorage.setItem('gs_one_user',j.user.id);localStorage.setItem('gs_one_tenant',j.user.tenant_id||'default');localStorage.setItem('gs_one_username',j.user.username||'');}
  }).catch(()=>{});
})();
