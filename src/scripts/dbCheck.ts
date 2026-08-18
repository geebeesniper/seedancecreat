import 'dotenv/config';
import { Pool } from 'pg';
import { isPostgresUrl, postgresConnectionString, postgresSsl, safePostgresTarget } from '../db/postgresConfig.js';

const url = process.env.DATABASE_URL || '';
const onVercel = Boolean(process.env.VERCEL);

async function main(): Promise<void> {
  if (!url) {
    if (onVercel) throw new Error('DATABASE_URL is missing. Add the Supabase Transaction Pooler URL in Vercel Environment Variables.');
    console.log('[db:check] DATABASE_URL not set; local build will use SQLite. Remote DB preflight skipped.');
    return;
  }

  if (!isPostgresUrl(url)) {
    if (onVercel) throw new Error('DATABASE_URL must be postgres:// or postgresql:// on Vercel. SQLite is not supported for persistent Vercel storage.');
    console.log('[db:check] Non-Postgres DATABASE_URL detected; remote DB preflight skipped.');
    return;
  }

  const target = safePostgresTarget(url);
  console.log(`[db:check] Connecting to ${target.host}:${target.port}/${target.database} as ${target.user || '(no user)'} ...`);

  const pool = new Pool({
    connectionString: postgresConnectionString(url),
    ssl: postgresSsl(url),
    max: 1,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 2000,
  });

  try {
    const result = await pool.query<{ database: string; user_name: string; server_time: string }>(
      `select current_database() as database, current_user as user_name, now()::text as server_time`
    );
    const row = result.rows[0];
    console.log(`[db:check] OK database=${row?.database ?? target.database} user=${row?.user_name ?? target.user} server_time=${row?.server_time ?? 'unknown'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db:check] FAILED ${message}`);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(() => process.exit(1));
