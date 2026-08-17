export function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

export function postgresSsl(url: string): { rejectUnauthorized: false } | undefined {
  try {
    const parsed = new URL(url);
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    const host = parsed.hostname.toLowerCase();
    if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full' || host.endsWith('.supabase.com')) {
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
