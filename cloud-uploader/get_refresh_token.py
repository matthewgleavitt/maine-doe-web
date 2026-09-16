"""
One-time OAuth grant → prints the refresh token you paste into deployment.

Run this on your Mac, NOT in the cloud. It launches a browser, asks you to
sign into a Google account and grant Drive + Sheets + YouTube-upload access,
and prints back the credentials JSON that the Cloud Function needs to run
unattended.

You do this ONCE per YouTube channel:
  • Main channel:   sign in as mdoecomm@gmail.com, pick "Maine DOE" channel
  • EnGiNE channel: same login, but pick EnGiNE Brand Account at consent

Usage:
  python get_refresh_token.py path/to/oauth-client.json
  # follow the browser prompts, then copy the JSON it prints
"""

import json
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/youtube.upload",
]

if len(sys.argv) < 2:
    print("Usage: python get_refresh_token.py path/to/oauth-client.json")
    sys.exit(1)

client_secrets_path = sys.argv[1]

flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, SCOPES)
# Force offline access + consent prompt every time so we always get a refresh token.
creds = flow.run_local_server(
    port=0,
    prompt="consent",
    access_type="offline",
    include_granted_scopes="true",
)

with open(client_secrets_path) as f:
    client_data = json.load(f)

# Support both "installed" (Desktop app) and "web" client types.
client_info = client_data.get("installed") or client_data.get("web")
if not client_info:
    print("ERROR: Could not find 'installed' or 'web' section in the OAuth client JSON.")
    sys.exit(1)

payload = {
    "client_id": client_info["client_id"],
    "client_secret": client_info["client_secret"],
    "refresh_token": creds.refresh_token,
}

print()
print("=" * 60)
print("Copy the JSON below and save it — you'll paste it into the")
print("Cloud Function deploy as OAUTH_CREDS_JSON.")
print("=" * 60)
print()
print(json.dumps(payload))
print()
print("=" * 60)
