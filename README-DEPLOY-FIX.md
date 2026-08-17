# v0.4.7 Vercel Fastify official-entry fix

This release changes only the Vercel runtime entry strategy and keeps the existing API/payment boundaries.

Key changes:
- Removed duplicate root `server.ts`.
- `src/server.ts` is the sole Fastify entrypoint.
- Restored `app.listen(...)`, matching Vercel's current Fastify zero-config deployment model.
- Database remains lazily initialized for `/api/*` and `/health/db` only.
- Supabase Build preflight remains enabled.
- `/health/runtime` and `/health` do not initialize the schema.

After pushing to `main`, test in this order:
1. `/health/runtime`
2. `/health`
3. `/health/db`
4. `/library`
