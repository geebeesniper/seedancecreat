# v0.4.9 legacy response compatibility fix

This patch keeps the extracted Vue/video scripts intact and fixes false success/failure messages caused by response-shape differences between the old Wails backend and the TypeScript SaaS backend.

Fixed:
- CreateEmptyProject: exposes `project_id` / `unified_code` at top level.
- DeleteScriptProject: returns `{ success: true }` after verifying deletion.
- RenameScriptProject: returns `{ success, file_name }` after verifying the stored name.
- CreateAsset: returns the JSON string expected by the original Vue code.
- DeleteAsset: returns legacy `ok` / `error:` string.
- Asset `prompt_versions`: snake_case remains JSON text for the original `JSON.parse(...)` code.
- SaveEpisodeConfig: now actually persists episode count/duration/split mode instead of silently returning NOT_MIGRATED.
- SaveProjectSettings: correctly maps the original positional Wails arguments.
- GetProjectRelations: returns legacy JSON text (`[]`).
- Unmigrated string-returning upload methods return `error:` strings instead of objects that cause `.startsWith` crashes.

No API/payment upstream adapter or original frontend/video bundles were removed.
