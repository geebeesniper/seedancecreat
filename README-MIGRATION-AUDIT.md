# Migration audit — v0.7.0

This audit separates **fixed stale desktop/upstream behavior** from methods that are intentionally still pending migration.

## Fixed in v0.7.0

- Real first-party login replaces the previous `IsLoggedIn=true` / fake `SaaS User` fallback.
- User-menu avatar/display name now comes from the authenticated account; the temporary `U` fallback is no longer what a signed-in user should see.
- Manual blank projects show `等待内容... / Waiting for content...` instead of the misleading `等待分析... / Waiting for analysis...`.
- User-menu version label is `SaaS`, not `本地版`; remaining visible `金铲子·一键` branding in the Pipeline shell was replaced with `GS-One`.
- Legacy wallet, recharge history, and deduction history now read the local Supabase `local_wallets` / `credit_ledger` data instead of failing with `UPSTREAM_NOT_CONFIGURED`.
- Legacy WeChat checkout is explicitly disabled; the user-menu recharge button now opens the Card / Alipay payment center.
- `/api/app/*`, local-video queue, and payment endpoints now use the signed-in session instead of trusting browser-supplied `x-user-id` / `x-tenant-id` headers.
- REST and GraphQL login APIs were added without increasing the Vercel Function count.

## Still intentionally uses optional legacy upstream

These methods still need `UPSTREAM_BASE_URL` if the original provider behavior is required:

- `GetAIModels`
- `GetFeaturePointInfo`
- `ListSaaSScripts`

`GetMarketingActivities` now safely returns an empty local activity list when no upstream is configured, so a missing marketing service no longer blocks the project library.

They are not silently replaced because their original provider/business behavior is not present in the extracted frontend.

## Still not migrated (26 legacy methods)

- AppendSegmentPromptVersion
- CancelArchitectAnalysis
- CancelEditorPipeline
- CancelTask
- ChatStream
- CreateSaasDramaOnly
- DeleteSegment
- DeleteSegmentPromptVersion
- DownloadVideoFile (browser bridge overrides this for local saving)
- GenerateAssetPrompt
- GenerateVideo
- GetSaaSScriptDetail
- InsertSegmentAfter
- ReinjectProjectRefs
- ReinjectSegmentRefs
- SegmentHasVideos
- SelectScriptFile (browser bridge overrides this with a file picker)
- SetSegmentActiveVersion
- SetVideoGenerationFeatured
- StartDirectorPipelineV2
- StartEditorPipelineRange
- StartSubSplitEpisode
- UpdateProjectModel
- UpdateSegmentAssociatedRoles
- UpdateSegmentDismissedRefs
- UpdateSegmentNotes

In addition, asset image/audio upload methods are retained as explicit `error:...尚未迁移到 SaaS` responses rather than pretending success.

## Important

The UI can now authenticate and isolate users, but the core video/Director/Editor pipeline is still not fully migrated. Do not interpret a working login, wallet, or project library as proof that `GenerateVideo` itself is complete.

## Local development server note

The production Vercel API routes enforce database-backed sessions. `src/localServer.ts` is retained as a development/debug helper and is not the production authentication boundary. Do not expose that local Fastify development server directly to the public Internet without applying the same session middleware.
