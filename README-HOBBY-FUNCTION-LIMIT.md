# Vercel Hobby Function Limit Fix (v0.6.1)

Vercel Hobby currently rejects this app when more than 12 Serverless Functions are detected.
The v0.6.0 layout used 20 files under `api/`, so each file was counted as a separate Function.

v0.6.1 keeps the same public URLs but consolidates routing internally:

- REST v1 routes -> `api/v1-router.ts`
- Payment routes (except Stripe webhook) -> `api/payments-router.ts`
- Health routes -> `api/health-router.ts`
- GraphQL -> `api/graphql.ts`
- Legacy Wails compatibility -> `api/app/[method].ts`
- Local video queue -> `api/local-video-queue.ts`
- Stripe webhook -> remains separate at `api/payments/stripe/webhook.ts` to preserve raw-body behavior

Total Vercel Function source files: **7**.

Public REST/GraphQL/payment URLs remain unchanged through `vercel.json` rewrites.
