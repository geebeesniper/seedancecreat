import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import { settings } from '../core/settings.js';
import type { Database } from './types.js';
import { isPostgresUrl, postgresConnectionString, postgresSsl } from './postgresConfig.js';

function sqlitePath(url: string): string {
  const raw = url.replace(/^sqlite:\/\/\//, '');
  return path.resolve(process.cwd(), raw || './data/gs_one.db');
}

const require=createRequire(import.meta.url);

export function createDb(): Kysely<Database> {
  const url = settings.databaseUrl;
  if (isPostgresUrl(url)) {
    const ssl = postgresSsl(url);
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({
        connectionString: postgresConnectionString(url),
        ssl,
        max: 3,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      }) }),
    });
  }
  if (process.env.VERCEL) throw new Error('DATABASE_URL_REQUIRED_ON_VERCEL');
  const filename = sqlitePath(url);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  // Load the native SQLite driver only for local SQLite mode. Vercel/Postgres never imports it.
  const sqliteModule=require('better-sqlite3') as any;
  const DatabaseDriver=sqliteModule.default ?? sqliteModule;
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: new DatabaseDriver(filename) }) });
}

// `db` used to be built eagerly here: `export const db = createDb();`.
// That is dangerous on Vercel: this file is reached via *static* imports
// (api/payments/*.ts -> paymentService.ts -> database.ts, and
// api/app/[method].ts -> dispatcher.ts -> appService.ts -> database.ts),
// so the eager call ran during the serverless function's cold-start module
// evaluation -- before the handler even starts, and before the
// ensureDatabase() try/catch in apiUtils.ts got a chance to run. If
// createDb() threw (e.g. DATABASE_URL_REQUIRED_ON_VERCEL), the whole
// function crashed and Vercel returned a bare platform 500 instead of the
// intended 503 JSON error.
//
// `db` is now a Proxy. Touching any property on it for the first time
// (db.selectFrom, db.schema, db.transaction, ...) creates the real Kysely
// instance on demand, inside whatever try/catch happens to be calling it.
// Module load itself can no longer throw. Every existing call site
// (`db.selectFrom(...)`, `db.transaction().execute(...)`, etc.) keeps
// working unchanged.
let realDb: Kysely<Database> | null = null;

function getRealDb(): Kysely<Database> {
  if (!realDb) realDb = createDb();
  return realDb;
}

export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_target, prop, _receiver) {
    const instance = getRealDb();
    const value = Reflect.get(instance as object, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

let initialized = false;
let initializing: Promise<void> | null = null;

export async function ensureDb(): Promise<void> {
  if (initialized) return;
  if (!initializing) {
    initializing = initDb()
      .then(() => { initialized = true; })
      .finally(() => { initializing = null; });
  }
  await initializing;
}

export async function initDb(): Promise<void> {
  const schema = db.schema;
  await schema.createTable('projects').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull())
    .addColumn('fileName','text',c=>c.notNull()).addColumn('storageKey','text',c=>c.notNull()).addColumn('totalChars','integer',c=>c.notNull())
    .addColumn('sliceCount','integer',c=>c.notNull()).addColumn('outline','text',c=>c.notNull()).addColumn('status','integer',c=>c.notNull())
    .addColumn('errorMsg','text',c=>c.notNull()).addColumn('tokensUsed','text',c=>c.notNull()).addColumn('episodeCount','integer',c=>c.notNull())
    .addColumn('episodeDuration','integer',c=>c.notNull()).addColumn('splitMethod','text',c=>c.notNull()).addColumn('modelId','text',c=>c.notNull())
    .addColumn('unifiedCode','text',c=>c.notNull()).addColumn('saasDramaId','integer').addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('projects_tenant_user_idx').ifNotExists().on('projects').columns(['tenantId','userId']).execute();

  await schema.createTable('episodes').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('projectId','text',c=>c.notNull())
    .addColumn('epNum','integer',c=>c.notNull()).addColumn('title','text',c=>c.notNull()).addColumn('summary','text',c=>c.notNull())
    .addColumn('contentRaw','text',c=>c.notNull()).addColumn('contentFinal','text',c=>c.notNull()).addColumn('status','integer',c=>c.notNull())
    .addColumn('durationEst','real',c=>c.notNull()).addColumn('sliceIds','text',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('episodes_project_idx').ifNotExists().on('episodes').columns(['tenantId','projectId','epNum']).execute();

  await schema.createTable('segments').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('projectId','text',c=>c.notNull()).addColumn('episodeId','text',c=>c.notNull())
    .addColumn('epNum','integer',c=>c.notNull()).addColumn('seq','integer',c=>c.notNull()).addColumn('timeStart','text',c=>c.notNull()).addColumn('timeEnd','text',c=>c.notNull())
    .addColumn('sceneDesc','text',c=>c.notNull()).addColumn('dialogue','text',c=>c.notNull()).addColumn('actionDesc','text',c=>c.notNull()).addColumn('emotion','text',c=>c.notNull())
    .addColumn('videoPrompt','text',c=>c.notNull()).addColumn('associatedRoles','text',c=>c.notNull()).addColumn('dismissedRefs','text',c=>c.notNull())
    .addColumn('startFrame','text',c=>c.notNull()).addColumn('endFrame','text',c=>c.notNull()).addColumn('improvementNotes','text',c=>c.notNull())
    .addColumn('promptVersions','text',c=>c.notNull()).addColumn('activeVersion','integer',c=>c.notNull()).addColumn('isInserted','integer',c=>c.notNull())
    .addColumn('status','integer',c=>c.notNull()).addColumn('videoUrl','text',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('segments_episode_idx').ifNotExists().on('segments').columns(['tenantId','episodeId','seq']).execute();

  await schema.createTable('assets').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('projectId','text',c=>c.notNull())
    .addColumn('name','text',c=>c.notNull()).addColumn('type','text',c=>c.notNull()).addColumn('description','text',c=>c.notNull())
    .addColumn('imagePath','text',c=>c.notNull()).addColumn('audioPath','text',c=>c.notNull()).addColumn('importance','integer',c=>c.notNull())
    .addColumn('styleHint','text',c=>c.notNull()).addColumn('promptVersions','text',c=>c.notNull()).addColumn('activePromptVersion','integer',c=>c.notNull())
    .addColumn('posX','real',c=>c.notNull()).addColumn('posY','real',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('assets_project_idx').ifNotExists().on('assets').columns(['tenantId','projectId']).execute();

  await schema.createTable('project_settings').ifNotExists()
    .addColumn('projectId','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('segmentCount','integer',c=>c.notNull())
    .addColumn('segmentDuration','integer',c=>c.notNull()).addColumn('splittingMode','text',c=>c.notNull()).addColumn('splittingScript','text',c=>c.notNull())
    .addColumn('videoPromptScript','text',c=>c.notNull()).addColumn('editorModelId','text',c=>c.notNull()).addColumn('directorModelId','text',c=>c.notNull())
    .addColumn('promptModelId','text',c=>c.notNull()).addColumn('preScriptContent','text',c=>c.notNull()).addColumn('selectedSchemeKey','text',c=>c.notNull())
    .addColumn('isConfigured','integer',c=>c.notNull()).execute();

  await schema.createTable('jobs').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull()).addColumn('projectId','text')
    .addColumn('kind','text',c=>c.notNull()).addColumn('status','text',c=>c.notNull()).addColumn('progress','integer',c=>c.notNull()).addColumn('message','text',c=>c.notNull())
    .addColumn('payload','text',c=>c.notNull()).addColumn('result','text').addColumn('error','text').addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('jobs_tenant_user_idx').ifNotExists().on('jobs').columns(['tenantId','userId','createdAt']).execute();

  await schema.createTable('video_generations').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull()).addColumn('projectId','text',c=>c.notNull())
    .addColumn('episodeId','text').addColumn('segmentId','text').addColumn('shotSeq','integer',c=>c.notNull()).addColumn('featurePointKey','text',c=>c.notNull())
    .addColumn('modelName','text',c=>c.notNull()).addColumn('prompt','text',c=>c.notNull()).addColumn('params','text',c=>c.notNull()).addColumn('status','text',c=>c.notNull())
    .addColumn('rhTaskId','text',c=>c.notNull()).addColumn('resultUrl','text',c=>c.notNull()).addColumn('videoUrl','text',c=>c.notNull()).addColumn('error','text',c=>c.notNull())
    .addColumn('isFeatured','integer',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('videos_tenant_user_idx').ifNotExists().on('video_generations').columns(['tenantId','userId','createdAt']).execute();

  await schema.createTable('local_wallets').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull())
    .addColumn('currency','text',c=>c.notNull()).addColumn('balanceMinor','integer',c=>c.notNull()).addColumn('totalRechargedMinor','integer',c=>c.notNull())
    .addColumn('totalConsumedMinor','integer',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).execute();
  await schema.createIndex('local_wallets_identity_idx').ifNotExists().on('local_wallets').columns(['tenantId','userId','currency']).unique().execute();

  await schema.createTable('payment_orders').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull())
    .addColumn('provider','text',c=>c.notNull()).addColumn('method','text',c=>c.notNull()).addColumn('amountMinor','integer',c=>c.notNull())
    .addColumn('currency','text',c=>c.notNull()).addColumn('status','text',c=>c.notNull()).addColumn('idempotencyKey','text',c=>c.notNull())
    .addColumn('providerSessionId','text').addColumn('providerPaymentIntentId','text').addColumn('checkoutUrl','text').addColumn('metadata','text',c=>c.notNull())
    .addColumn('createdAt','text',c=>c.notNull()).addColumn('updatedAt','text',c=>c.notNull()).addColumn('paidAt','text').execute();
  await schema.createIndex('payment_orders_identity_idx').ifNotExists().on('payment_orders').columns(['tenantId','userId','createdAt']).execute();
  await schema.createIndex('payment_orders_idempotency_idx').ifNotExists().on('payment_orders').column('idempotencyKey').unique().execute();
  await schema.createIndex('payment_orders_session_idx').ifNotExists().on('payment_orders').column('providerSessionId').execute();

  await schema.createTable('payment_events').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('provider','text',c=>c.notNull()).addColumn('eventType','text',c=>c.notNull())
    .addColumn('payload','text',c=>c.notNull()).addColumn('processedAt','text',c=>c.notNull()).execute();

  await schema.createTable('credit_ledger').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull())
    .addColumn('currency','text',c=>c.notNull()).addColumn('deltaMinor','integer',c=>c.notNull()).addColumn('source','text',c=>c.notNull())
    .addColumn('sourceId','text',c=>c.notNull()).addColumn('description','text',c=>c.notNull()).addColumn('createdAt','text',c=>c.notNull()).execute();
  await schema.createIndex('credit_ledger_identity_idx').ifNotExists().on('credit_ledger').columns(['tenantId','userId','createdAt']).execute();
  await schema.createIndex('credit_ledger_source_idx').ifNotExists().on('credit_ledger').columns(['source','sourceId']).unique().execute();

  await schema.createTable('api_keys').ifNotExists()
    .addColumn('id','text',c=>c.primaryKey()).addColumn('tenantId','text',c=>c.notNull()).addColumn('userId','text',c=>c.notNull())
    .addColumn('name','text',c=>c.notNull()).addColumn('mode','text',c=>c.notNull()).addColumn('keyPrefix','text',c=>c.notNull())
    .addColumn('keyHash','text',c=>c.notNull()).addColumn('scopes','text',c=>c.notNull()).addColumn('status','text',c=>c.notNull())
    .addColumn('lastUsedAt','text').addColumn('createdAt','text',c=>c.notNull()).addColumn('revokedAt','text').execute();
  await schema.createIndex('api_keys_hash_idx').ifNotExists().on('api_keys').column('keyHash').unique().execute();
  await schema.createIndex('api_keys_identity_idx').ifNotExists().on('api_keys').columns(['tenantId','userId','createdAt']).execute();
}

