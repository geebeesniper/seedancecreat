# Local Video Library (v0.5.0)

This layer intentionally does **not** modify payment or generation API integrations.

## Behavior

- First local save/setup: user selects a parent directory in a Chromium desktop browser.
- App creates `SeedanceVideos` inside that directory.
- The selected parent directory handle is stored in IndexedDB.
- On later visits, the app restores the handle and looks for `SeedanceVideos`.
- If `SeedanceVideos` was removed, it is recreated with `create:true`.
- If access/recreation fails, the UI shows `ERROR` instead of reporting a false success.
- Completed generation records with a `video_url`/`result_url` are mirrored locally when the existing generation queue is polled and local write permission is already granted.
- `/local-videos` scans and lists all local video files recursively. Clicking a file plays the local file directly; it is not uploaded to Vercel.
- Queue records with no matching local file are marked `ERROR` once a remote video URL exists.
- Any queue record can be removed from the database.
- Removing a queue record **never deletes a local video file**. There is deliberately no local-video delete function in this feature.

## Storage layout

```text
<chosen parent>/SeedanceVideos/
  project_<project id>/
    episode_<episode id>/
      shot_<shot seq>/
        generation_<generation id>.mp4
```

The extension is inferred from response content type/URL when possible.

## Browser limitation

Direct local-directory access uses the File System Access API and is intended for desktop Chromium browsers such as Chrome/Edge. If the browser cannot provide this API, the local-library page reports the limitation and does not pretend a file was saved.
