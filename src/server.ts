import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import { initDb, db } from './db/database.js';
import { settings } from './core/settings.js';
import { legacyRoutes } from './routes/legacy.js';
import { paymentRoutes } from './routes/payments.js';

const here=path.dirname(fileURLToPath(import.meta.url));
void here;
const root=process.cwd();
const web=path.join(root,'web');
export const app=Fastify({logger:true});
await app.register(cors,{origin:true});
await app.register(rawBody,{field:'rawBody',global:false,encoding:false,runFirst:true});
app.get('/health',async()=>({
  ok:true,
  backend:'typescript',
  login:false,
  frontend:'original-vue-extracted',
  database:settings.databaseUrl.startsWith('post')?'postgresql':'sqlite',
  stripe:Boolean(settings.stripeSecretKey),
  original_payment_preserved:true,
}));
if(!process.env.VERCEL){
  await app.register(fastifyStatic,{root:web,prefix:'/'});
  app.setNotFoundHandler(async(req,reply)=>{
    if(req.method==='GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({error:'Not found'});
  });
}

let initialized=false;
let initializing:Promise<void>|null=null;
async function ensureInitialized(){
  if(initialized)return;
  if(!initializing){
    initializing=initDb().then(()=>{initialized=true;}).finally(()=>{initializing=null;});
  }
  await initializing;
}

// Database-backed API requests initialize the schema lazily. A database problem must not
// crash the whole Vercel function or prevent the static UI and /health from loading.
app.addHook('onRequest',async(req,reply)=>{
  if(!req.url.startsWith('/api/')) return;
  try { await ensureInitialized(); }
  catch(error){
    req.log.error({err:error},'Database initialization failed');
    return reply.code(503).send({
      success:false,
      code:'DATABASE_UNAVAILABLE',
      error:error instanceof Error?error.message:String(error),
    });
  }
});

await app.register(paymentRoutes);
await app.register(legacyRoutes);

app.get('/health/db',async(_req,reply)=>{
  try {
    await ensureInitialized();
    await db.selectFrom('projects').select('id').limit(1).execute();
    return {ok:true,database:'postgresql'};
  } catch(error) {
    app.log.error({err:error},'Database health check failed');
    return reply.code(503).send({ok:false,database:'postgresql',error:error instanceof Error?error.message:String(error)});
  }
});

export async function start(){
  await ensureInitialized();
  await app.listen({port:settings.port,host:settings.host});
}

// Vercel consumes the exported Fastify app. Do not connect to the database at module import time.
export default app;

if(!process.env.VERCEL && process.env.NODE_ENV!=='test') start().catch(err=>{app.log.error(err);process.exit(1)});
process.on('SIGTERM',async()=>{await app.close();await db.destroy();process.exit(0)});
