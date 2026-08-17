import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.DATABASE_URL='sqlite:///./data/test.db';
process.env.STRIPE_SECRET_KEY='';
process.env.STRIPE_WEBHOOK_SECRET='';
fs.rmSync('./data/test.db',{force:true});

const { app } = await import('../src/server.js');
const { db } = await import('../src/db/database.js');

let r=await app.inject({method:'GET',url:'/health'}); assert.equal(r.statusCode,200); assert.equal(r.json().backend,'typescript'); assert.equal(r.json().stripe,false);
r=await app.inject({method:'POST',url:'/api/app/IsLoggedIn',payload:{args:[]}}); assert.equal(r.json(),true);
r=await app.inject({method:'POST',url:'/api/app/CreateEmptyProject',payload:{args:['TS 测试项目',0]}}); const created=r.json(); assert.equal(created.success,true); assert.equal(created.project.fileName,'TS 测试项目');
r=await app.inject({method:'POST',url:'/api/app/GetAllScriptProjects',payload:{args:[]}}); assert.equal(r.json().length,1);
r=await app.inject({method:'POST',url:'/api/app/DetectScriptStructure',payload:{args:['第1集\nA\n第2集\nB']}}); assert.equal(r.json().hasEpisodeMarkers,true);
r=await app.inject({method:'POST',url:'/api/app/GetWallet',payload:{args:[]}}); assert.equal(r.json().error,'UPSTREAM_NOT_CONFIGURED');
r=await app.inject({method:'GET',url:'/api/payments/config'}); assert.equal(r.statusCode,200); assert.equal(r.json().stripe.enabled,false); assert.equal(r.json().local_wallet.balance_minor,0);
r=await app.inject({method:'POST',url:'/api/payments/stripe/checkout',payload:{method:'card',amount_minor:2000,client_request_id:'smoke-test-12345'}}); assert.equal(r.statusCode,400); assert.equal(r.json().code,'STRIPE_NOT_CONFIGURED');
r=await app.inject({method:'GET',url:'/payments.html'}); assert.equal(r.statusCode,200);
await app.close(); await db.destroy(); fs.rmSync('./data/test.db',{force:true});
console.log('smoke: ok');
