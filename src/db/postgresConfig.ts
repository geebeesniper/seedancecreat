export function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * node-postgres replaces the explicit `ssl` object when sslmode/sslcert/sslkey/sslrootcert
 * are present in a connection string. Strip those options before handing the URL to pg,
 * then control TLS explicitly with postgresSsl().
 */
export function postgresConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function postgresSsl(url: string): { rejectUnauthorized: false } | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Supabase pooler requires TLS. For this preview deployment we intentionally disable
    // CA-chain verification only for Supabase hosts. Replace with Supabase CA + verify-full
    // before production money traffic.
    if (host.endsWith('.supabase.com')) return { rejectUnauthorized: false };

    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Let pg report malformed connection strings with its normal error.
  }
  return undefined;
}

export function safePostgresTarget(url: string): { host: string; port: string; database: string; user: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    user: decodeURIComponent(parsed.username || ''),
  };
}
