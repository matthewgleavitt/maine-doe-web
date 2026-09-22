# /data — mirrored portal endpoints

The JSON files in this folder are **auto-generated** by
`.github/workflows/refresh-portal-data.yml`.

They mirror read-only Apps Script endpoints so that Gateway pages can
fetch from GitHub's raw-content CDN (~100 ms globally, always available)
instead of waiting on Apps Script (2–10 s cold, sometimes 30 s+ during
Google's flaky-edge periods).

Do NOT edit these files by hand — they get overwritten on every workflow
run. Edits belong in the source (the Google Sheet, Apps Script code, or
whichever system feeds the endpoint).

## URLs

Once committed to `main`, each file is served at:

```
https://raw.githubusercontent.com/matthewgleavitt/maine-doe-web/main/data/<name>.json
```

CORS is permitted, so browsers can fetch these directly from any origin
(including gateway.maine.gov).

## Wrapper shape

Every file wraps the Apps Script response in a small envelope:

```json
{
  "_fetched": "2026-09-22T14:15:00.000Z",
  "_sourceType": "calendar",
  "_description": "Public calendar feed",
  ...original Apps Script response fields...
}
```

Frontends can use `_fetched` to show a "data as of X" indicator, and
fall back to live Apps Script if the static JSON is missing or older
than N minutes.

## What's mirrored, what isn't

**Mirrored** (safe to be public — same content is already served by the
Apps Script endpoint without auth):
- `calendar.json`       — Public calendar feed
- `publications.json`   — Mailchimp campaigns + blog
- `youtube_videos.json` — YouTube library band
- `youtube_stats.json`  — YouTube analytics
- `commons.json`        — Maine DOE Commons posts
- `store.json`          — Maine DOE Store catalog

**NOT mirrored** (would leak submitter emails, admin-only queues, or
per-user data):
- Submission trackers (events, youtube submissions)
- Moderation queue
- Per-user my_events
- Any POST/write endpoints
