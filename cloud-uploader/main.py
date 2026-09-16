"""
Maine DOE YouTube auto-uploader — Cloud Function replacement for the
Apps Script version that couldn't handle multi-hundred-MB files inside
Apps Script's 6-min execution / 100 MB heap / 50 MB blob ceilings.

Runs on Google Cloud Run functions (Gen 2). Cloud Scheduler pings the
HTTP endpoint every 10 minutes. Each invocation:

  1. Scans the configured Google Drive folder for new video files
  2. For each video: streams the file from Drive to disk (constant
     memory), then streams from disk to YouTube using the resumable
     upload protocol built into google-api-python-client
  3. Marks the matching row in the YouTubeSubmissions Google Sheet
     as Uploaded with the YouTube URL
  4. Moves the file to the `Processed` subfolder
  5. Pings the Teams webhook

Uploads land on whichever YouTube channel the stored refresh token was
consented for. See setup.md for the one-time OAuth consent that fixes
the target channel (Main by default; separate deployment for EnGiNE).
"""

import io
import json
import logging
import os
import re
import tempfile
from typing import Dict, List, Optional

import functions_framework
import requests
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Config from env ────────────────────────────────────────────────
UPLOAD_FOLDER_ID = os.environ["UPLOAD_FOLDER_ID"]
SHEET_ID = os.environ.get("SHEET_ID", "")
TEAMS_WEBHOOK = os.environ.get("TEAMS_WEBHOOK", "")
DEFAULT_DESCRIPTION = os.environ.get(
    "DEFAULT_DESCRIPTION",
    "Uploaded via Maine DOE Communications Portal",
)
DEFAULT_CATEGORY_ID = "27"  # Education
VIDEO_EXTENSIONS = {
    "mp4", "mov", "avi", "wmv", "flv", "mkv", "webm", "m4v", "mpg", "mpeg", "3gp",
}
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/youtube.upload",
]


def load_credentials() -> Credentials:
    """
    Load OAuth credentials from a stored refresh token.

    The refresh token was captured once during setup (see get_refresh_token.py)
    and lives in the OAUTH_CREDS_JSON env var — set from Secret Manager on
    Cloud Function deploy. We only ever use the refresh token to mint fresh
    access tokens; the access token itself is short-lived (1 hour).
    """
    creds_json = os.environ["OAUTH_CREDS_JSON"]
    data = json.loads(creds_json)
    creds = Credentials(
        token=None,
        refresh_token=data["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=data["client_id"],
        client_secret=data["client_secret"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


def get_or_create_processed_folder(drive) -> str:
    """Find the `Processed` subfolder inside the upload folder, or create it."""
    q = (
        f"'{UPLOAD_FOLDER_ID}' in parents "
        "and mimeType='application/vnd.google-apps.folder' "
        "and name='Processed' and trashed=false"
    )
    res = drive.files().list(q=q, fields="files(id,name)", pageSize=1).execute()
    files = res.get("files", [])
    if files:
        return files[0]["id"]
    body = {
        "name": "Processed",
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [UPLOAD_FOLDER_ID],
    }
    created = drive.files().create(body=body, fields="id").execute()
    log.info("Created Processed subfolder: %s", created["id"])
    return created["id"]


def list_pending_videos(drive) -> List[Dict]:
    """List video files sitting in the root of the upload folder."""
    q = (
        f"'{UPLOAD_FOLDER_ID}' in parents "
        "and mimeType != 'application/vnd.google-apps.folder' "
        "and trashed=false"
    )
    res = drive.files().list(
        q=q,
        fields="files(id,name,size,mimeType)",
        pageSize=100,
    ).execute()
    files = res.get("files", [])
    videos = []
    for f in files:
        name = f["name"]
        dot = name.rfind(".")
        ext = name[dot + 1:].lower() if dot >= 0 else ""
        if ext in VIDEO_EXTENSIONS:
            videos.append(f)
    return videos


def match_to_submission(sheets, filename: str) -> Dict:
    """
    Try to match a Drive filename to a row in the YouTubeSubmissions sheet.

    Returns a dict with title/description/requestor/email/rowIndex — or an
    empty dict if no match. Same behavior as the Apps Script matchToSubmission,
    ported to Sheets API.
    """
    if not SHEET_ID:
        return {}
    try:
        result = sheets.spreadsheets().values().get(
            spreadsheetId=SHEET_ID,
            range="YouTubeSubmissions!A1:N",
        ).execute()
    except HttpError as e:
        log.warning("Sheet read failed: %s", e)
        return {}
    rows = result.get("values", [])
    if not rows:
        return {}
    clean = re.sub(r"\.[^.]+$", "", filename).lower().strip()
    # Walk from bottom (newest) up for best match — matches Apps Script logic
    for i in range(len(rows) - 1, 0, -1):
        row = rows[i]
        title = (row[4] if len(row) > 4 else "").lower().strip()
        row_filename = (row[12] if len(row) > 12 else "").lower().strip()
        if row_filename and (row_filename == clean or row_filename in filename.lower()):
            return _row_to_meta(row, i + 1)
        if title and (title in clean or clean in title):
            return _row_to_meta(row, i + 1)
    return {}


def _row_to_meta(row: List, row_index: int) -> Dict:
    def get(i):
        return row[i] if len(row) > i else ""
    return {
        "title": get(4),
        "description": get(5),
        "requestor": get(1),
        "email": get(2),
        "privacy": get(8) or "Private",
        "rowIndex": row_index,
    }


def mark_submission_uploaded(sheets, row_index: int, video_id: str):
    """Flip the sheet row to Uploaded and append the YT URL."""
    if not SHEET_ID or row_index <= 0:
        return
    try:
        # Column M (13, 1-indexed) is Status; column N (14) is the URL/notes.
        sheets.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f"YouTubeSubmissions!M{row_index}:N{row_index}",
            valueInputOption="RAW",
            body={"values": [["Uploaded", f"YT: https://youtu.be/{video_id}"]]},
        ).execute()
    except HttpError as e:
        log.warning("Sheet write failed: %s", e)


def download_from_drive(drive, file_id: str, dest_path: str):
    """Stream a Drive file to a local temp file. Constant memory usage."""
    request = drive.files().get_media(fileId=file_id)
    # 8 MB chunks — small enough to keep memory tight, large enough for throughput.
    with open(dest_path, "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk(num_retries=3)
            if status:
                log.info("  download: %d%%", int(status.progress() * 100))


def upload_to_youtube(youtube, file_path: str, mime_type: str, title: str, description: str) -> str:
    """Resumable upload from local path to YouTube. Returns the video ID."""
    body = {
        "snippet": {
            "title": title[:100],  # YT title cap
            "description": description[:5000],  # YT description cap
            "categoryId": DEFAULT_CATEGORY_ID,
        },
        "status": {
            "privacyStatus": "private",
            "selfDeclaredMadeForKids": False,
        },
    }
    # resumable=True + chunksize -1 lets the library manage chunking itself.
    media = MediaFileUpload(
        file_path,
        mimetype=mime_type,
        chunksize=8 * 1024 * 1024,
        resumable=True,
    )
    req = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )
    response = None
    while response is None:
        status, response = req.next_chunk(num_retries=3)
        if status:
            log.info("  upload:   %d%%", int(status.progress() * 100))
    return response["id"]


def move_to_processed(drive, file_id: str, processed_folder_id: str):
    """Move a file into the Processed subfolder."""
    # First read current parents, then swap.
    meta = drive.files().get(fileId=file_id, fields="parents").execute()
    prev_parents = ",".join(meta.get("parents", []))
    drive.files().update(
        fileId=file_id,
        addParents=processed_folder_id,
        removeParents=prev_parents,
        fields="id, parents",
    ).execute()


def notify_teams(title: str, video_id: str, requestor: str):
    if not TEAMS_WEBHOOK:
        return
    url = f"https://www.youtube.com/watch?v={video_id}"
    card = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {"type": "TextBlock", "size": "Medium", "weight": "Bolder",
                     "text": "🎬 Auto-uploaded to YouTube"},
                    {"type": "FactSet", "facts": [
                        {"title": "Title", "value": title},
                        {"title": "Video", "value": url},
                        {"title": "Status", "value": "Private (review in YouTube Studio)"},
                        {"title": "Requested by", "value": requestor or "—"},
                    ]},
                    {"type": "TextBlock", "text": "Review metadata and set to Public/Unlisted when ready.",
                     "size": "Small", "isSubtle": True},
                ],
            },
        }],
    }
    try:
        requests.post(TEAMS_WEBHOOK, json=card, timeout=10)
    except Exception as e:
        log.warning("Teams notify failed: %s", e)


def process_one(drive, youtube, sheets, processed_id: str, file: Dict) -> Optional[str]:
    """
    End-to-end for one video. Downloads to a temp file, uploads to YouTube,
    marks the sheet, moves the file, notifies Teams. Returns the video ID on
    success, None on failure. Temp file is always cleaned up.
    """
    name = file["name"]
    mime = file.get("mimeType", "video/mp4")
    size_mb = int(file.get("size", 0)) / 1_048_576 if file.get("size") else 0
    log.info("Uploading to YouTube: %s (%.1f MB)", name, size_mb)

    meta = match_to_submission(sheets, name)
    title = meta.get("title") or re.sub(r"\.[^.]+$", "", name)
    description = meta.get("description") or DEFAULT_DESCRIPTION

    tmp_dir = tempfile.mkdtemp(prefix="yt-")
    tmp_path = os.path.join(tmp_dir, name)
    try:
        download_from_drive(drive, file["id"], tmp_path)
        video_id = upload_to_youtube(youtube, tmp_path, mime, title, description)
        log.info("YouTube upload success: %s — %s", video_id, title)

        move_to_processed(drive, file["id"], processed_id)
        if meta.get("rowIndex", 0) > 0:
            mark_submission_uploaded(sheets, meta["rowIndex"], video_id)
        notify_teams(title, video_id, meta.get("requestor", ""))
        return video_id
    except HttpError as e:
        log.error("YouTube upload FAILED for %s: %s", name, e)
        return None
    except Exception as e:
        log.error("Unexpected error uploading %s: %s", name, e)
        return None
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            os.rmdir(tmp_dir)
        except OSError:
            pass


@functions_framework.http
def process_uploads(request):
    """
    HTTP entry point. Cloud Scheduler pings this every 10 minutes.

    Response is intentionally verbose — Cloud Scheduler logs the response
    body, so you get a plain-text "uploaded 2 videos" summary for each run
    without opening the function logs.
    """
    creds = load_credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)

    processed_id = get_or_create_processed_folder(drive)
    videos = list_pending_videos(drive)

    if not videos:
        return ("No pending videos.", 200)

    uploaded = []
    for f in videos:
        vid = process_one(drive, youtube, sheets, processed_id, f)
        if vid:
            uploaded.append({"name": f["name"], "videoId": vid})

    return (f"Uploaded {len(uploaded)} of {len(videos)} pending: {json.dumps(uploaded)}", 200)
