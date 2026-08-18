import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.DATABASE_URL='sqlite:///./data/test.db';
process.env.STRIPE_SECRET_KEY='';
process.env.STRIPE_WEBHOOK_SECRET='';
process.env.DEFAULT_TENANT_ID='default';
process.env.DEFAULT_USER_ID='default';
fs.rmSync('./data/test.db',{force:true});

type Req={method:string;url:string;headers:Record<string,string>;query?:Record<string,string>;body?:unknown};
function req(method:string,url:string,body?:unknown,query:Record<string,string>={}):Req{return{method,url,headers:{},query,body};}
function res(){
  const out:{statusCode:number;headers:Record<string,string>;body:unknown}={statusCode:200,headers:{},body:undefined};
  const api:any={};
  api.status=(c:number)=>{out.statusCode=c;return api;};
  api.setHeader=(k:string,v:string)=>{out.headers[k]=v;};
  api.json=(b:unknown)=>{out.body=b;};
  api.send=(b:unknown)=>{out.body=b;};
  api.end=(b?:unknown)=>{out.body=b;};
  return {out, api};
}
async function call(handler:any,r:Req){const rr=res();await handler.default(r,rr.api);return rr.out;}

const health=await import('../api/health.js');
const appMethod=await import('../api/app/[method].js');
const payConfig=await import('../api/payments/config.js');
const checkout=await import('../api/payments/stripe/checkout.js');
const { db } = await import('../src/db/database.js');

let r=await call(health,req('GET','/api/health')); assert.equal(r.statusCode,200); assert.equal((r.body as any).backend,'typescript');
r=await call(appMethod,req('POST','/api/app/IsLoggedIn',{args:[]},{method:'IsLoggedIn'})); assert.equal(r.body,true);
r=await call(appMethod,req('POST','/api/app/CreateEmptyProject',{args:['TS 测试项目',0]},{method:'CreateEmptyProject'})); assert.equal((r.body as any).success,true);
r=await call(appMethod,req('POST','/api/app/GetAllScriptProjects',{args:[]},{method:'GetAllScriptProjects'})); assert.equal(Array.isArray(r.body),true); assert.equal((r.body as any[]).length,1);
r=await call(payConfig,req('GET','/api/payments/config')); assert.equal(r.statusCode,200); assert.equal((r.body as any).stripe.enabled,false);
r=await call(checkout,req('POST','/api/payments/stripe/checkout',{method:'card',amount_minor:2000,client_request_id:'smoke-test-12345'})); assert.equal(r.statusCode,400); assert.equal((r.body as any).code,'STRIPE_NOT_CONFIGURED');
assert.equal(fs.existsSync('./public/payments.html'),true);
await db.destroy(); fs.rmSync('./data/test.db',{force:true});
console.log('smoke: ok');
