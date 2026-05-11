# Sheet schema — Apps Script cache Sheet

Sheet ID: `1eOicsubyOrzcA4wSuZlBDs6NHUZkIb93mePRp_X5Al4`

The Apps Script reads and writes by **column index** (not by header name), so reordering or inserting columns will silently break things. Every tab below shows column index → header name → notes.

If you add or move a column in the Sheet, update both the Sheet AND `Code.gs`. The matching `row[N]` reads in `Code.gs` are noted next to each tab.

---

## YouTubeSubmissions

User-facing form posts to this tab via `youtube_submit`. Status updates by `youtube_complete`. Read by `getYouTubeSubmissions` (`Code.gs`).

| Idx | Header | Source |
|----:|--------|--------|
| 0 | date | `youtube_submit` (server-stamped, `M/D/YYYY`) |
| 1 | requestor | form |
| 2 | email | form |
| 3 | team | form |
| 4 | title | form (also used as match key by `youtube_complete`) |
| 5 | description | form |
| 6 | mediaType | form |
| 7 | playlist | form |
| 8 | privacy | form (default `Public`) |
| 9 | engine | form (`Yes`/`No`) |
| 10 | engineCourse | form |
| 11 | notes | form |
| 12 | status | server (`Received` → `Complete`) |
| 13 | url | server (set by `youtube_complete`) |

`processYouTubeUploads` and `markSubmissionUploaded` look up `status` and `notes`/`videoid` columns by **header name** (case-insensitive) — those two functions are header-resilient. Everything else is index-based.

## EventSubmissions

User-facing form posts via `event_submit`. Updated by `event_complete`. Read by `getEventSubmissions`.

| Idx | Header | Source |
|----:|--------|--------|
| 0 | dateSubmitted | `event_submit` (server-stamped) |
| 1 | requestor | form |
| 2 | email | form |
| 3 | focus | form |
| 4 | eventTitle | form (match key for `event_complete`) |
| 5 | eventType | form |
| 6 | dateTime | form |
| 7 | audience | form |
| 8 | description | form |
| 9 | location | form (`Virtual` / `In-Person` / `Hybrid`) |
| 10 | regLink | form |
| 11 | address | form |
| 12 | coincides | form (`Yes`/`No`) |
| 13 | notes | form |
| 14 | status | server (`Received` → `Complete`) |
| 15 | calUrl | server (set by `event_complete`) |
| 16 | adminNotes | (reserved — read but never written) |

## Announcements

Read by `getAnnouncements`, written by `announcement_add`.

| Idx | Header |
|----:|--------|
| 0 | date |
| 1 | title |
| 2 | message |
| 3 | priority (`normal` / `important` / `urgent`) |

## Templates

Read by `getTemplates`. Manually edited in the Sheet — no write path.

| Idx | Header |
|----:|--------|
| 0 | name |
| 1 | category (`Design` / `Documents` / `Presentations`) |
| 2 | subcategory |
| 3 | description |
| 4 | source (`Canva` / `SharePoint` / `Download` / `Google Drive`) |
| 5 | url |
| 6 | thumbnail |

---

## Auto-managed tabs (don't edit manually)

These are written by Apps Script triggers. Editing them will be wiped on the next run.

### FilePages

Written by `scanBatch` (every 10 min). Read by `getFilePages`.

| Idx | Header |
|----:|--------|
| 0 | file_path |
| 1 | file_name |
| 2 | pages_json (JSON array of `{t,p,o}` per page) |
| 3 | scanned_at |

### ScanMeta

Written by `scanBatch` on completion.

| Idx | Header |
|----:|--------|
| 0 | last_scan |
| 1 | total_files |

### PagesIndex

Written by `cacheDrupalPages` (every 30 min). Read by `getDrupalPages`.

| Idx | Header |
|----:|--------|
| 0 | nid |
| 1 | title |
| 2 | path |
| 3 | owner |
| 4 | ownerEmail |
| 5 | changed |
| 6 | created |
| 7 | published |
| 8 | type |

### FilesIndex

Written by `cacheDrupalFiles` (every 30 min, resumable). Read by `getDrupalFiles`.

| Idx | Header |
|----:|--------|
| 0 | fid |
| 1 | name |
| 2 | path |
| 3 | ext |
| 4 | size |
| 5 | mime |
| 6 | created |

---

## Script Properties

These live in Apps Script **Project Settings → Script Properties**, not in the Sheet. Required for the script to work:

**Required**
- `GA4_PROPERTY_ID` — GA4 property numeric ID
- `SA_EMAIL` — service account email
- `SA_PRIVATE_KEY` — service account private key (PEM with `\n` literals)
- `CACHE_SHEET_ID` — `1eOicsubyOrzcA4wSuZlBDs6NHUZkIb93mePRp_X5Al4`

**Optional**
- `MAILCHIMP_API_KEY` — for Publications tab
- `MAILCHIMP_DC` — Mailchimp data center, defaults to `us2`
- `TEAMS_WEBHOOK` — Teams webhook URL for submission notifications

**Auto-managed (don't set manually)**
- `STAT_TOTAL_PAGES`, `STAT_TOTAL_FILES`, `STAT_PAGE_VIEWS` — dashboard hero stats
- `LAST_FULL_SCAN`, `SCAN_OFFSET`, `SCAN_STATUS` — file scanner state
- `FILES_RESUME_URL` — resumable file index pagination cursor
- `PAGES_CACHED_AT`, `FILES_CACHED_AT` — last cache timestamps

---

## Triggers

Set up in Apps Script **Triggers** panel:

| Function | Frequency | Purpose |
|----------|-----------|---------|
| `scanBatch` | every 10 min | Scan Drupal page bodies for file references → `FilePages` |
| `cacheDrupalPages` | every 30 min | Refresh `PagesIndex` |
| `cacheDrupalFiles` | every 30 min | Refresh `FilesIndex` (resumable across runs) |
| `warmCache` | every 10 min | Pre-warm CacheService for Announcements/YouTube/Events/Templates/Publications/GA4 |
| `processYouTubeUploads` | every 10 min | Auto-upload videos from Drive folder `1i5Hp9HSxyya3sgVA4HSMmMosIYRCLlv1` to YouTube |

---

## Endpoints (web app `doGet`)

`?type=` controls what comes back:

| `type` | Returns | Cached |
|--------|---------|:---:|
| `pages` | GA4 page views (default 30 days, `?days=N`) | 10 min |
| `files` | GA4 file downloads | 10 min |
| `file_pages` | `FilePages` rows | 5 min |
| `youtube` | `YouTubeSubmissions` rows | 5 min |
| `events` | `EventSubmissions` rows | 5 min |
| `templates` | `Templates` rows | 5 min |
| `announcements` | `Announcements` rows | 5 min |
| `publications` | Mailchimp campaigns + summary | 5 min |
| `drupal_pages` | `PagesIndex` rows | 5 min |
| `drupal_files` | `FilesIndex` rows | 5 min |
| `web_stats` | `STAT_*` properties | none |

POST actions (`doPost`, JSON body with `action`):
`youtube_submit`, `youtube_complete`, `event_submit`, `event_complete`, `save_stats`, `announcement_add`, `moderation_notify`.

> **CORS note:** clients send `Content-Type: text/plain` to skip the preflight; the body is still JSON. `doPost` parses `e.postData.contents` directly.
