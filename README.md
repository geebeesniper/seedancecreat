# GS-One SaaS TypeScript v0.4.8

This package keeps the extracted original GS-One Vue frontend and the TypeScript business scripts, but changes the Vercel deployment shape.

## What is preserved

- Original extracted frontend files under `public/` and `web/`.
- `public/wails-bridge.js` with the legacy `window.go.main.App.*` compatibility methods.
- `src/services/*` project / episode / asset / storyboard / generation compatibility logic.
- `src/integrations/upstream.ts` original upstream API/payment adapter boundary.
- Stripe/Card/Alipay payment service and webhook code.
- Database schema and Supabase/Postgres preflight.

## What changed in v0.4.8

The Vercel deployment no longer boots Fastify as a whole-site server. Vercel serves the UI statically from `public/`, and backend calls use native serverless functions in `api/`.

Important test URLs:

- `/health/runtime` — native Vercel function, does not touch database.
- `/health` — basic runtime config.
- `/health/db` — initializes schema and tests Supabase/Postgres.
- `/library` — static Vue UI.
- `/payments.html` — SaaS Card/Alipay payment page.

Required Vercel environment variables:

```env
DATABASE_URL=postgres://postgres.xxx:password@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
DEFAULT_TENANT_ID=default
DEFAULT_USER_ID=default
DEV_ALLOW_OFFLINE_UPSTREAM=true
```

For first deployment, leave `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `UPSTREAM_BASE_URL`, and `UPSTREAM_ACCESS_TOKEN` empty until `/health/runtime`, `/health`, `/health/db`, and `/library` work.

## Deploy with GitHub

After replacing files in your local `seedancecreat` clone:

```bash
git add .
git commit -m "Switch to Vercel native API deployment"
git push origin main
```

Vercel will automatically deploy from `main`.

If the Vercel project is still set to Framework Preset `Fastify`, change it once to `Other` in Vercel Project Settings → Build & Development Settings. This version intentionally does not use Vercel Fastify zero-config.
