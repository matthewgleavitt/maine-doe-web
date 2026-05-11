# Maine DOE Communications Portal

Internal staff portal for the Maine Department of Education Communications team. Hosted in the Drupal BULK files folder at `maine.gov/doe/sites/maine.gov.doe/files/bulk/communications/`.

## Project owner

Matt Leavitt — Website & Technology Coordinator, Maine DOE
- Email: matthew.g.leavitt@maine.gov
- Other admins: Rachel Paling (rachel.paling@maine.gov), Chloe Teboe (chloe.teboe@maine.gov)

## Architecture

**Hosting:** Static HTML files served from `/DRUPAL_BULK/communications/` on the Drupal site's FTP. Files are standalone HTML with React loaded via CDN (no build step, no Node, no npm). Edit and deploy as plain files.

**Authentication:** Drupal login gate. The portal POSTs credentials to `/doe/user/login?_format=json`. Once logged in, Drupal's session cookie persists and the portal reads the authenticated user's email from JSON:API to detect admin status against the allowlist above.

**Backend:** Google Apps Script web app (`apps-script/Code.gs`) acts as a server-side proxy. Handles:
- GA4 Data API calls (page views, file downloads)
- Drupal JSON:API caching into a Google Sheet
- Mailchimp campaign data
- Form submission tracking (Events, YouTube)
- File-to-page reference mapping

**Apps Script cache Sheet ID:** `1eOicsubyOrzcA4wSuZlBDs6NHUZkIb93mePRp_X5Al4`

**Apps Script triggers:**
- `warmCache` — every 10 minutes, pre-fetches Announcements / YouTube / Events / Templates / Publications / GA4 into CacheService
- `cacheDrupalPages` — every 30 minutes, refreshes the `PagesIndex` tab
- `cacheDrupalFiles` — every 30 minutes, refreshes `FilesIndex` (resumable across runs since there are ~12K files)
- `scanBatch` — every 10 minutes, scans Drupal page bodies for file references → `FilePages` tab
- `processYouTubeUploads` — every 10 minutes, auto-uploads videos from a Drive folder to YouTube

See `apps-script/SHEET-SCHEMA.md` for the full Sheet column layout, endpoint list, and Script Properties reference.

## File layout

```
maine-doe-web/
├── claude.md                            ← this file
├── comms-portal/                        ← gets deployed to FTP
│   ├── index.html                       Portal shell, sidebar, dashboard, auth gate
│   ├── welcome.html                     Tabs: Announcements, News, Social, Calendar, Contact
│   ├── analytics-dashboard.html         GA4 + Drupal page owner cross-ref
│   ├── page-explorer.html               Browse Drupal pages with owners, last edit, audit status
│   ├── file-manager.html                Browsable files, page mapping, admin delete (CSRF)
│   ├── events-tracker.html              Events queue + certificate links
│   ├── youtube-tracker.html             YouTube submission queue
│   ├── publications.html                Mailchimp campaigns + pagination + search
│   ├── processes.html                   Working with Comms, voicemail, signature, resources
│   ├── brandguide.html                  Maine DOE brand guide
│   ├── engine.html                      EnGiNE info + Comms Orientation + Moodle widget
│   ├── templates.html                   Template library
│   ├── tools.html                       Admin-only internal admin tools
│   ├── file-inventory.json              Static export of Drupal file inventory (used by analytics)
│   ├── hero-bg.jpg / maine-doe-logo.png Image assets
│   └── backup/                          Pre-deploy snapshots of index.html
└── apps-script/
    ├── Code.gs                          Apps Script backend (source of truth — deploy via script.google.com)
    └── SHEET-SCHEMA.md                  Sheet tab columns, endpoints, Script Properties
```

## Hard constraints (don't fight these — work around them)

- **No SSH or Drush access** to maine.gov. SFTP only.
- **No build step.** React is loaded via CDN with Babel for in-browser JSX transpilation. Do not introduce npm, webpack, vite, or any compilation step.
- **CKEditor 5 strips `<script>` tags** from Drupal body content. Portal files live in BULK, not Drupal nodes, so this doesn't affect the portal — but it matters for any Drupal page edits.
- **Apache on the Drupal site blocks PATCH/PUT** requests. Use POST workarounds.
- **Apps Script `doGet` endpoints** are the only way to access GA4 / Drupal admin data from the client. Never put credentials in client-side JS.
- **CORS:** The portal must be hosted on `maine.gov` for Drupal auth and JSON:API to work (same-origin requirement). Apps Script proxy endpoints are CORS-friendly and work from anywhere.

## Coding conventions

**Color tokens** (used throughout the portal):
- Navy primary: `#182b3c`
- Teal accent: `#42c3f7`
- Warm white background: `#eee6df`
- Border / muted: `#a8bdd0`

**Card component pattern:** Each file defines its own Card component locally. Cards use white background, subtle shadow, rounded corners. There's no shared component library — each HTML file is self-contained.

**Iframe communication:** When portal pages load inside the main shell iframe, they hide their own `portal-bar` element so the bar isn't duplicated. Pattern at the bottom of each child file:

```js
if (window.self !== window.top) {
  document.addEventListener("DOMContentLoaded", function() {
    var b = document.getElementById("portal-bar");
    if (b) b.style.display = "none";
  });
}
```

**Admin gating in iframes:** The shell passes `?admin=1` to child iframes when the authenticated user is on the admin allowlist. Child files check `new URLSearchParams(window.location.search).get('admin')` to decide whether to show admin-only UI.

**Noindex meta:** Every portal HTML file includes `<meta name="robots" content="noindex,nofollow">` in the `<head>`.

## Deploy process

**Current:** Manual SFTP via FileZilla. Edit files locally → upload to `/DRUPAL_BULK/communications/`.

**Planned (not built yet):**
- Local Python deploy script with staging/production split
- Pre-deploy backup of production folder before overwrite
- Optional GitHub Actions deploy as a secondary path
- Staging folder at `/DRUPAL_BULK/communications-staging/` for testing before promoting

**Apps Script** is deployed separately through the Apps Script web editor at script.google.com — never via FTP. `apps-script/Code.gs` in this repo is the source of truth; keep it in sync with what's deployed (clasp can automate this — see `apps-script/SHEET-SCHEMA.md`).

## Working preferences

- Warm, conversational tone — not corporate-formal.
- Concise drafts. Don't over-explain or pad.
- Visual hierarchy and scannable formatting in communications.
- Skill-aware: Matt is a self-taught developer with strong instincts. Explain reasoning, don't oversimplify.
- The portal is in active production use. Don't break things. Always assume changes need to be tested before going live.

## What's currently working & deployed

- Portal shell with sidebar, dashboard, Drupal auth gate, admin detection
- Welcome page (Announcements, News, Social with Elfsight FB+IG, Calendar, Contact)
- Analytics Dashboard (live GA4 with file downloads, Drupal page owner cross-ref)
- File Manager (cached file index, page mapping, admin delete via CSRF)
- Events Tracker with certificate links
- YouTube Tracker
- Publications (Mailchimp `report_summary`, pagination, search)
- Brand Guide
- EnGiNE page (Communications Orientation course 174, course request, Moodle widget with category filter + pagination)
- Templates library
- Tools page (admin-only)
- Apps Script proxy with caching
- Maine DOE logo replacing ME badge throughout (pill container, 48px height)
- Noindex on all files

## Known pending items

- YouTube/Events "Complete" buttons — admin param passed, but visibility wiring incomplete
- Brand guide logos tab — needs actual logo files uploaded
- Welcome page user greeting ("Welcome, Matt") — not wired to auth username yet
- Full-text body search in Page Explorer — needs GitHub Actions index
- Dead Link Scanner module — scoped, not built as a portal page

## External resources

**Elfsight widgets:**
- Facebook feed: `a4dac8e8-b379-4924-ad3a-1545525eb852`
- Instagram feed: `79f01eec-2f66-4eac-8f82-1679a0cfcfb4`

**Maine DOE site:** https://www.maine.gov/doe
**Portal URL (production):** https://www.maine.gov/doe/sites/maine.gov.doe/files/bulk/communications/index.html
**EnGiNE:** https://engine.maine.gov

## Don't do

- Don't auto-deploy on push. Deploys are manual triggers, not automatic.
- Don't introduce a build step. The no-build, CDN-React pattern is intentional.
- Don't strip the noindex meta from any portal file.
- Don't put credentials, API keys, or secrets into any portal file. Anything sensitive goes in the Apps Script proxy.
- Don't reproduce content from copyrighted sources verbatim in the portal.
- Don't make changes to production files without testing first.
