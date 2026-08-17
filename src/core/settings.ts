import 'dotenv/config';

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
function intEnv(value: string | undefined, fallback: number): number {
  const n=Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function intList(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  const out=value.split(',').map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>0);
  return out.length ? out : fallback;
}

export const settings = {
  appVersion: process.env.APP_VERSION || 'saas-typescript-0.4.7-vercel-fastify-official',
  port: Number(process.env.PORT || 8000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'sqlite:///./data/gs_one.db',
  defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
  defaultUserId: process.env.DEFAULT_USER_ID || 'default',
  upstreamBaseUrl: (process.env.UPSTREAM_BASE_URL || '').replace(/\/$/, ''),
  upstreamAccessToken: process.env.UPSTREAM_ACCESS_TOKEN || '',
  devAllowOfflineUpstream: boolEnv(process.env.DEV_ALLOW_OFFLINE_UPSTREAM, true),

  // NEW payment provider. The original upstream payment adapter stays frozen.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeDefaultCurrency: (process.env.STRIPE_DEFAULT_CURRENCY || 'usd').toLowerCase(),
  stripeMinRechargeMinor: intEnv(process.env.STRIPE_MIN_RECHARGE_MINOR, 500),
  stripeMaxRechargeMinor: intEnv(process.env.STRIPE_MAX_RECHARGE_MINOR, 100_000),
  stripeRechargePresetsMinor: intList(process.env.STRIPE_RECHARGE_PRESETS_MINOR, [1000, 2000, 5000, 10000]),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
};
