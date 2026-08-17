# v0.4.6 Vercel runtime/TLS fix

This patch fixes two deployment-specific issues:

- The Vercel-imported Fastify module no longer calls `app.listen()` or `initDb()` during module import, even if the `VERCEL` system variable is unavailable.
- PostgreSQL SSL query options are stripped before passing the connection string to `pg`, preventing them from overriding the explicit TLS object. Build preflight and runtime now use the same connection configuration.
- `/health/runtime` is database-free and should prove the Vercel function can boot.

Use the existing Vercel `DATABASE_URL`; both with and without `?sslmode=require` are tolerated because the pg-facing URL is sanitized.

# v0.4.4 Vercel runtime fix

This build fixes Vercel runtime crashes by:
- not connecting/migrating the database during module import
- lazily initializing PostgreSQL only for `/api/*` requests
- adding `/health/db` for database diagnostics
- avoiding loading the native `better-sqlite3` driver on Vercel/PostgreSQL
- adding short PostgreSQL connection timeouts suitable for serverless

Use Supabase Transaction Pooler (port 6543) with `?sslmode=require`.

# GS-One Web SaaS — TypeScript + Stripe

Version 0.4 adds a second payment provider to the TypeScript SaaS baseline while preserving the original GS-One upstream payment/API boundary.

## Architecture

    Original extracted Vue frontend
           ↓
    web/wails-bridge.js
           ↓
    Fastify + TypeScript
           ↓
    Kysely + PostgreSQL/Neon (SQLite for local test)
           ↓
    ┌──────────────────────┬──────────────────────────┐
    │ Original upstream    │ NEW Stripe provider      │
    │ wallet / WeChat / API│ Card + Alipay Checkout   │
    │ FROZEN               │ webhook → SaaS credits  │
    └──────────────────────┴──────────────────────────┘

There is no Go runtime and no Python runtime.

## What changed in 0.4

- Added Stripe hosted Checkout for credit/debit cards.
- Added Stripe-hosted Alipay Checkout.
- Added signed Stripe webhook processing.
- Added idempotent payment settlement so retries do not double-credit.
- Added local SaaS credit wallet and credit ledger.
- Added Stripe payment order history.
- Added `/payments.html` payment center and a `Card / Alipay` shortcut in the original UI.
- Added a root `server.ts` entry point for Vercel Fastify auto-detection.
- Added `vercel.json` so the extracted `web/**` frontend is included with the function.

## Important payment boundary

The original upstream payment is not replaced or emulated:

- `GetWallet`
- `GetWxPayConfig`
- `ListRechargePackages`
- `CreateWxPayOrder`
- `QueryWxPayOrderStatus`
- `ListRechargeRecords`

still go through `src/integrations/upstream.ts` unchanged.

The original program does not expose an endpoint that lets an external Stripe payment directly credit its upstream wallet. Therefore Stripe payments in this version credit a **separate local SaaS credits wallet**. The code intentionally does not fake a WeChat callback or pretend Stripe money was received by the old payment server.

If the upstream service later provides an official `credit wallet` / `manual recharge` API, add that as a settlement adapter after Stripe webhook verification.

## Local test without Stripe

Install Node.js 22+, then:

    npm install
    npm run dev

Open:

    http://127.0.0.1:8000/library
    http://127.0.0.1:8000/payments.html

With Stripe variables blank the payment page loads, but Card/Alipay buttons are disabled.

## Stripe setup

Copy `.env.example` to `.env` and set:

    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    PUBLIC_BASE_URL=https://your-domain.example

Defaults:

    STRIPE_DEFAULT_CURRENCY=usd
    STRIPE_MIN_RECHARGE_MINOR=500
    STRIPE_MAX_RECHARGE_MINOR=100000
    STRIPE_RECHARGE_PRESETS_MINOR=1000,2000,5000,10000

For USD, `500` means `$5.00`, `2000` means `$20.00`, etc.

### Stripe webhook URL

Register this endpoint in Stripe:

    https://YOUR_DOMAIN/api/payments/stripe/webhook

Events used by this version:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

The handler verifies the `Stripe-Signature` against the raw HTTP body before changing balances.

### Alipay

The application requests `alipay` explicitly when the user clicks the Alipay button. Alipay must also be enabled/eligible on the Stripe account, and the chosen currency/account configuration must support it. This version defaults to USD one-time payments.

## Vercel + Neon

This project now has a root `server.ts`, which is a Vercel-recognized Fastify entry point.

Recommended production environment variables:

    DATABASE_URL=postgresql://...Neon...?sslmode=require
    PUBLIC_BASE_URL=https://YOUR_PROJECT.vercel.app
    STRIPE_SECRET_KEY=sk_...
    STRIPE_WEBHOOK_SECRET=whsec_...

Optional original upstream variables remain:

    UPSTREAM_BASE_URL=
    UPSTREAM_ACCESS_TOKEN=

Do not use SQLite as durable production storage on serverless hosting. Use Neon/PostgreSQL.

## Payment API added

    GET  /api/payments/config
    GET  /api/payments/wallet
    GET  /api/payments/orders
    POST /api/payments/stripe/checkout
    GET  /api/payments/stripe/session/:sessionId
    POST /api/payments/stripe/webhook

`POST /api/payments/stripe/checkout` body:

    {
      "method": "card" | "alipay",
      "amount_minor": 2000,
      "client_request_id": "browser-generated-idempotency-id"
    }

## Security notes

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only.
- Full card numbers never pass through GS-One; Stripe Checkout collects them.
- Balances are changed only after a trusted Stripe result: a signed webhook or a server-to-server Checkout Session lookup.
- Settlement is idempotent at both event and Checkout Session level.
- The visible GS-One login is still removed. Until a parent SaaS authentication layer is added, the default tenant/user represents a shared test account. Do not use this no-login identity model for a real multi-user paid production service.

## Existing migration status

All 83 observed legacy `window.go.main.App.*` method names remain available through the browser compatibility bridge. The deep Director/Editor pipeline, generation workers, RunningHub polling and several upload/segment flows are still migration work and return `NOT_MIGRATED_YET` where appropriate.

## Vercel v0.4.3 deployment fix

Vercel now detects Fastify apps with zero configuration. Do not declare the root `server.ts` under `functions` in `vercel.json`; the `functions` map is for matching Vercel Functions (normally under `api/`) and caused `unmatched-function-pattern` on Drop deployments. This package keeps `vercel.json` schema-only and lets Vercel's Fastify adapter detect `server.ts` automatically.

## v0.4.5 database preflight

Vercel builds now run a real PostgreSQL preflight after TypeScript compilation. The check opens a connection to `DATABASE_URL` and executes `SELECT current_database(), current_user, now()`.

- On Vercel, a missing/invalid `DATABASE_URL` makes the build fail with a clear message instead of deploying a site that later returns HTTP 500.
- Supabase pooler hosts automatically enable TLS even if `?sslmode=require` was omitted.
- The log prints only host, port, database, and user; it never prints the password or full connection URL.
- Run the same check locally with `npm run db:check`.
- Runtime database health remains available at `/health/db`.
