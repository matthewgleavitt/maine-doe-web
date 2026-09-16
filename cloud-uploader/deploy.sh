#!/usr/bin/env bash
# Deploy the Maine DOE YouTube auto-uploader as a Google Cloud Run function
# and wire up a Cloud Scheduler job to fire it every 10 minutes.
#
# Assumes gcloud CLI is installed and you're logged in as the account that
# owns the GCP project (usually the account that also owns the YouTube
# channel + Drive folder).
#
# One-time preparation (see setup.md for the full walkthrough):
#   1. Create a GCP project, enable billing
#   2. Enable APIs: cloudfunctions, cloudbuild, cloudscheduler, drive, sheets, youtube
#   3. Create an OAuth 2.0 client (Desktop app) → download client secrets JSON
#   4. Run get_refresh_token.py to capture a refresh token
#
# Then edit the CONFIG block below and run this script.

set -euo pipefail

# ─── CONFIG — edit before first run ────────────────────────────────
PROJECT_ID="${PROJECT_ID:-CHANGE_ME}"                    # your GCP project
REGION="${REGION:-us-central1}"                          # closest region
FUNCTION_NAME="${FUNCTION_NAME:-yt-uploader-main}"       # unique per channel
UPLOAD_FOLDER_ID="${UPLOAD_FOLDER_ID:-CHANGE_ME}"        # Drive folder to watch
SHEET_ID="${SHEET_ID:-}"                                 # optional YouTubeSubmissions sheet
TEAMS_WEBHOOK="${TEAMS_WEBHOOK:-}"                       # optional Teams incoming webhook
SCHEDULE_CRON="${SCHEDULE_CRON:-*/10 * * * *}"           # every 10 min

# Secret Manager secret holding the OAuth refresh-token JSON payload.
# Create it FIRST with:
#   printf '%s' "$(cat oauth-creds.json)" | gcloud secrets create yt-uploader-creds --data-file=-
OAUTH_SECRET_NAME="${OAUTH_SECRET_NAME:-yt-uploader-creds}"

# ─── Sanity checks ─────────────────────────────────────────────────
if [[ "$PROJECT_ID" == "CHANGE_ME" || "$UPLOAD_FOLDER_ID" == "CHANGE_ME" ]]; then
  echo "Edit deploy.sh (or set PROJECT_ID / UPLOAD_FOLDER_ID env vars) before running." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"

# ─── Deploy the function ───────────────────────────────────────────
# Gen 2 gives us up to 60-min timeout and up to 16 GB memory — we won't
# need anywhere near that, but it means multi-GB videos are trivial.
echo "Deploying function ${FUNCTION_NAME} to ${REGION}…"
gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=python312 \
  --region="$REGION" \
  --source=. \
  --entry-point=process_uploads \
  --trigger-http \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --timeout=1800s \
  --set-env-vars "UPLOAD_FOLDER_ID=${UPLOAD_FOLDER_ID},SHEET_ID=${SHEET_ID},TEAMS_WEBHOOK=${TEAMS_WEBHOOK}" \
  --set-secrets "OAUTH_CREDS_JSON=${OAUTH_SECRET_NAME}:latest"

FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --gen2 --format="value(serviceConfig.uri)")
echo "Function URL: $FUNCTION_URL"

# ─── Set up the Cloud Scheduler cron ───────────────────────────────
# Uses OIDC auth so only Cloud Scheduler can hit the endpoint.
SCHEDULER_SA="${FUNCTION_NAME}-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SCHEDULER_SA" &>/dev/null; then
  echo "Creating scheduler service account…"
  gcloud iam service-accounts create "${FUNCTION_NAME}-invoker" \
    --display-name="${FUNCTION_NAME} Cloud Scheduler invoker"
fi

gcloud run services add-iam-policy-binding "$FUNCTION_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" >/dev/null

JOB_NAME="${FUNCTION_NAME}-cron"
if gcloud scheduler jobs describe "$JOB_NAME" --location="$REGION" &>/dev/null; then
  echo "Updating scheduler job $JOB_NAME…"
  gcloud scheduler jobs update http "$JOB_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE_CRON" \
    --uri="$FUNCTION_URL" \
    --http-method=POST \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$FUNCTION_URL"
else
  echo "Creating scheduler job $JOB_NAME…"
  gcloud scheduler jobs create http "$JOB_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE_CRON" \
    --uri="$FUNCTION_URL" \
    --http-method=POST \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$FUNCTION_URL"
fi

echo
echo "✅ Deployed."
echo "  Function: $FUNCTION_URL"
echo "  Schedule: $SCHEDULE_CRON (in $REGION)"
echo
echo "Manual invoke to test right now:"
echo "  gcloud scheduler jobs run $JOB_NAME --location=$REGION"
