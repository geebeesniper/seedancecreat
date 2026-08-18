# v0.4.8 Vercel Native API deployment

This version removes the Fastify whole-site entrypoint from Vercel deployment.

What changed:

- `public/` still contains the extracted original GS-One Vue UI and scripts.
- `src/services`, `src/integrations`, `src/db`, prompt/storyboard/payment logic are preserved.
- Vercel now uses native `api/*.ts` serverless functions instead of trying to boot a Fastify app for every route.
- `/`, `/library`, `/pipeline`, `/payments.html` are static pages served by Vercel.
- `/api/*` is handled by Vercel functions.
- `/health/runtime` does not touch the database.
- `/health/db` initializes schema and tests Supabase/Postgres.

Required Vercel environment variables:

- `DATABASE_URL`
- `DEFAULT_TENANT_ID=default`
- `DEFAULT_USER_ID=default`
- `DEV_ALLOW_OFFLINE_UPSTREAM=true`

For this preview, keep Stripe and upstream API empty until the base site loads.
