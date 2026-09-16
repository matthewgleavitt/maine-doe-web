# Maine DOE YouTube Auto-uploader — Cloud Run Setup

The Apps Script version hit Apps Script's 6-min execution ceiling and 100 MB
heap on large videos. This version runs on Google Cloud Run functions instead
— no time/memory limits worth caring about, ~$0/month at your usage, uploads
at native speed (a 500 MB video finishes in ~30 seconds).

Setup is ~30 minutes of one-time clicking, then it runs unattended forever.

You'll do this **once per YouTube channel** — one deployment for Main, a
separate one for EnGiNE (because YouTube uploads land on whichever Brand
Account the OAuth token was consented for; there's no way to target a
specific channel per-upload).

---

## Prerequisites

- A Google Cloud Platform account signed in as `mdoecomm@gmail.com`
  (or whichever Google account you use for YouTube uploads)
- A credit card on file (GCP requires one, but you almost certainly won't
  be charged — free tier covers 2M function invocations/month and 400K
  GB-sec compute; you'll use a few thousand)
- The `gcloud` CLI installed on your Mac: <https://cloud.google.com/sdk/docs/install>
- Python 3.11 or 3.12 installed on your Mac (for the one-time OAuth grant)

---

## Step 1 — Create the GCP project (~5 min)

1. Go to <https://console.cloud.google.com/>
2. Sign in as `mdoecomm@gmail.com`
3. Top-left project picker → **New Project**
4. Name it something like `maine-doe-yt-uploader`
5. Wait for creation (~30 sec)
6. Set up billing: hamburger menu → **Billing** → link a payment method
   - You will not be charged for the volume this uses. Free tier handles it.

## Step 2 — Enable APIs (~2 min)

In the console, go to **APIs & Services → Library** and enable each of these
(search by name, click the API, click Enable):

- Cloud Functions API
- Cloud Run Admin API
- Cloud Build API
- Cloud Scheduler API
- Secret Manager API
- Google Drive API
- Google Sheets API
- YouTube Data API v3

## Step 3 — Create an OAuth client (~5 min)

The Cloud Function needs to authenticate as *you* (the account that owns the
YouTube channel), so it needs an OAuth client and a stored refresh token.

1. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name: `Maine DOE YouTube Uploader`
   - User support email: your maine.gov email
   - Developer contact: same
   - Save & Continue through the rest (Scopes, Test users, Summary) — don't
     add anything, just click through
   - Back on the OAuth consent screen page: **Audience → Test users → Add**
     → add `mdoecomm@gmail.com`. This lets you grant consent without
     Google's app-verification review, since it's just you using it.

2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name: `yt-uploader-desktop-client`
   - Create
   - **Download** the JSON (little download icon on the row). Save it as
     `oauth-client.json` in the `cloud-uploader/` folder.
   - Keep this file — you'll need it again for the EnGiNE deployment.

## Step 4 — Get the refresh token (~2 min)

This is the one part where you *have to* pick which YouTube channel this
deployment uploads to.

Open Terminal on your Mac, cd into the repo, then:

```bash
cd cloud-uploader
python3 -m venv .venv
source .venv/bin/activate
pip install google-auth-oauthlib
python get_refresh_token.py oauth-client.json
```

Your browser will open. Sign in as `mdoecomm@gmail.com` and — **this is the
key step** — when Google asks which channel to grant access to, pick
**Maine DOE (Main)** for the main deployment. For the EnGiNE deployment
(later), you'll repeat this step and pick EnGiNE instead.

After you grant, the script prints a JSON blob like this:

```json
{"client_id": "...", "client_secret": "...", "refresh_token": "1//..."}
```

Copy the entire JSON. Save it to a file called `oauth-creds-main.json` (for
the Main channel) — you'll need it in the next step.

## Step 5 — Store the OAuth creds in Secret Manager (~1 min)

```bash
gcloud config set project maine-doe-yt-uploader
gcloud secrets create yt-uploader-creds-main --data-file=oauth-creds-main.json
```

(Later, for EnGiNE, you'll `gcloud secrets create yt-uploader-creds-engine
--data-file=oauth-creds-engine.json`.)

## Step 6 — Deploy the function (~5 min)

Edit `deploy.sh` and set these variables at the top:

```bash
PROJECT_ID="maine-doe-yt-uploader"
FUNCTION_NAME="yt-uploader-main"
UPLOAD_FOLDER_ID="1i5Hp9HSxyya3sgVA4HSMmMosIYRCLlv1"    # the Main Drive folder
SHEET_ID="<your YouTubeSubmissions Sheet ID>"           # optional but recommended
TEAMS_WEBHOOK="<your Teams incoming webhook URL>"       # optional
OAUTH_SECRET_NAME="yt-uploader-creds-main"
```

Grab the Sheet ID from the URL of your YouTubeSubmissions spreadsheet:
`https://docs.google.com/spreadsheets/d/[SHEET_ID_IS_HERE]/edit`.

Then:

```bash
./deploy.sh
```

The first deploy takes ~3 minutes (Cloud Build compiles the container). It'll
print the function URL and a scheduler-job name when done.

## Step 7 — Test it right now

```bash
gcloud scheduler jobs run yt-uploader-main-cron --location=us-central1
```

Then either:

- Go to <https://console.cloud.google.com/functions> and open the function's
  **Logs** tab — you'll see it running in real time
- Or drop a small video in the Main Drive folder before you run the manual
  trigger; it'll upload it right away

## Step 8 — Add EnGiNE (~10 min, when ready)

Repeat steps 3.2 → 6 with these swaps:

- Step 4 (`get_refresh_token.py`): pick **EnGiNE** at the channel picker
- Step 5: name the secret `yt-uploader-creds-engine`
- Step 6: in `deploy.sh` set:
  - `FUNCTION_NAME="yt-uploader-engine"`
  - `UPLOAD_FOLDER_ID="1tVV6XLt33yNhfrgqqfxaW1bzH0Q9s6Dc"` (EnGiNE folder)
  - `OAUTH_SECRET_NAME="yt-uploader-creds-engine"`

Two totally independent functions, two totally independent cron jobs. Each has
its own YouTube API quota (~6 uploads per function per day on the default;
plenty).

---

## Once it's running

Nothing to do. Every 10 minutes, Cloud Scheduler pings each function. If the
Drive folder has any video files, they get uploaded to YouTube as Private,
the sheet row flips to Uploaded, the file moves to `Processed`, and Teams
gets pinged.

If you want the ping cadence tighter or looser, edit the cron in `deploy.sh`
and re-run it (`SCHEDULE_CRON="*/5 * * * *"` for every 5 min, etc.).

## When Apps Script goes away

Once both channels are on Cloud Run and you've watched a couple of upload
cycles work, you can:

1. Remove the `processYouTubeUploads` trigger in the Apps Script editor
   (Triggers → the row for that function → delete). Don't remove the
   function itself yet — the code is there in case you ever need to fall
   back.
2. That's it. The Cloud Run functions are now your only auto-uploader.

## Cost check

Realistic monthly cost for typical Maine DOE volume (~30 uploads/mo across
both channels, total ~10 GB of transfer):

- Cloud Functions invocations: 4,320/mo (both channels, every 10 min) → **$0** (free tier: 2M/mo)
- Cloud Functions compute: ~1,500 GB-sec/mo → **$0** (free tier: 400K GB-sec)
- Cloud Scheduler: 2 jobs → **$0** (free tier: 3 jobs)
- Cloud Build: 720 min/mo redeploys → **$0** (free tier: 120 build-min/day)
- Secret Manager: 2 secrets, ~4,320 accesses/mo → **$0** (free tier: 10K/mo)
- Egress: ~10 GB/mo → **$0** (Google-to-Google traffic is free)

Total: **$0/mo** at your volume. GCP shows you a bill anyway — it'll say $0.

## What to check if something's wrong

- **Function fails on startup with "Missing scope"** — you forgot to check
  a scope during OAuth consent. Rerun step 4 with `prompt=consent` (it does
  that by default) and grant every scope Google asks for.
- **Video uploads to the wrong channel** — the refresh token was granted for
  the wrong Brand Account. Delete the secret, rerun step 4, pick the right
  channel this time.
- **"Refresh token expired"** — Google invalidates refresh tokens if unused
  for 6 months, or if the OAuth consent screen is still in "Testing" mode
  after 7 days (which is why we added your email as a test user). If this
  happens, rerun step 4.
- **Nothing shows up in logs** — Cloud Scheduler job is disabled. Check
  <https://console.cloud.google.com/cloudscheduler> and make sure the job
  has status "Enabled".
