# v0.7.0 — Login + API + stale-behavior cleanup

- Real database-backed username/email + password login.
- REST auth API: `/api/v1/auth/register`, `/login`, `/me`, `/logout`.
- GraphQL auth: `register`, `login`, `authMe`, `logout`.
- Signed-in users can create/revoke their own external API keys through `/api/v1/api-keys`.
- First-party project/payment/local-video APIs now require `gs_session_...` instead of trusting browser user-id headers.
- Manual blank projects show `等待内容...` rather than misleading `等待分析...`.
- Wallet/recharge/deduction views use the local Supabase ledger; missing legacy marketing upstream no longer blocks the library.
- User-menu recharge routes to the Card / Alipay payment center.
- Remaining visible old GS-One desktop branding in the Pipeline shell was cleaned up.
- Still 7 Vercel Functions (Hobby-plan compatible when old `api/` files are removed before upload).

See `README-AUTH.md` and `README-MIGRATION-AUDIT.md` for details and remaining unmigrated methods.
