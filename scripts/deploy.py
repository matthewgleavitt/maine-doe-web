#!/usr/bin/env python3
"""
Deploy comms-portal to maine.gov via SFTP.

Modes:
    ./scripts/deploy.py                              Push to staging
    ./scripts/deploy.py --prod                       Push to production (with confirmation + backup)
    ./scripts/deploy.py --files index.html foo.html  Only push specific files
    ./scripts/deploy.py --diff                       Show what would change, don't upload
    ./scripts/deploy.py --backup                     Snapshot prod locally and exit

Reads SFTP credentials from .env in the repo root. See .env.example.

Requires: pip3 install paramiko
"""
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from stat import S_ISDIR

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_DIR = REPO_ROOT / 'comms-portal'
ENV_FILE = REPO_ROOT / '.env'

# Paths on the Drupal SFTP. Adjust if the actual base differs.
PROD_REMOTE = '/DRUPAL_BULK/communications'
STAGING_REMOTE = '/DRUPAL_BULK/communications-staging'

# Files/dirs in comms-portal/ that should never be deployed.
EXCLUDE_FILES = {'.DS_Store'}
EXCLUDE_DIRS = {'backup', '.git', '__pycache__'}


def die(msg, code=1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_env():
    if not ENV_FILE.exists():
        die(f"No .env at {ENV_FILE}. Copy .env.example to .env and fill it in.")
    cfg = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        cfg[k.strip()] = v.strip().strip('"').strip("'")
    required = ['DEPLOY_FTP_HOST', 'DEPLOY_FTP_USER', 'DEPLOY_FTP_PASS']
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        die(f".env is missing required keys: {', '.join(missing)}")
    return cfg


def collect_local_files(filter_names=None):
    """Return list of relative Paths under LOCAL_DIR, filtering excludes and optional filter list."""
    files = []
    for p in LOCAL_DIR.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(LOCAL_DIR)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if p.name in EXCLUDE_FILES:
            continue
        if filter_names:
            rel_str = str(rel).replace(os.sep, '/')
            if rel_str not in filter_names and p.name not in filter_names:
                continue
        files.append(rel)
    return files


def connect(cfg):
    try:
        import paramiko
    except ImportError:
        die("paramiko not installed. Run: pip3 install paramiko")
    transport = paramiko.Transport((cfg['DEPLOY_FTP_HOST'], int(cfg.get('DEPLOY_FTP_PORT') or 22)))
    transport.connect(username=cfg['DEPLOY_FTP_USER'], password=cfg['DEPLOY_FTP_PASS'])
    return paramiko.SFTPClient.from_transport(transport)


def remote_files(sftp, remote_dir):
    """Walk remote dir and return {posix_relative_path: size_bytes}."""
    out = {}

    def walk(dir_path, prefix=''):
        try:
            entries = sftp.listdir_attr(dir_path)
        except IOError:
            return
        for entry in entries:
            name = entry.filename
            if S_ISDIR(entry.st_mode):
                if name in EXCLUDE_DIRS:
                    continue
                walk(f"{dir_path}/{name}", f"{prefix}/{name}" if prefix else name)
            else:
                key = f"{prefix}/{name}" if prefix else name
                out[key] = entry.st_size

    walk(remote_dir)
    return out


def diff_files(local_files, remote_index):
    """Yield (rel_path, status, local_size, remote_size_or_None)."""
    for rel in local_files:
        rel_str = str(rel).replace(os.sep, '/')
        local_size = (LOCAL_DIR / rel).stat().st_size
        remote_size = remote_index.get(rel_str)
        if remote_size is None:
            yield rel_str, 'new', local_size, None
        elif remote_size != local_size:
            yield rel_str, 'changed', local_size, remote_size
        else:
            yield rel_str, 'same', local_size, remote_size


def ensure_remote_dir(sftp, path):
    parts = [p for p in path.split('/') if p]
    cur = ''
    for p in parts:
        cur = f"{cur}/{p}" if cur else f"/{p}"
        try:
            sftp.stat(cur)
        except IOError:
            try:
                sftp.mkdir(cur)
            except IOError as e:
                die(f"Cannot create remote dir {cur}: {e}")


def upload(sftp, local_path, remote_path):
    parent = '/'.join(remote_path.split('/')[:-1])
    ensure_remote_dir(sftp, parent)
    sftp.put(str(local_path), remote_path)


def backup_prod(sftp):
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    dest_dir = REPO_ROOT / 'backups' / f"communications-{ts}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"Snapshotting prod → backups/communications-{ts}/")
    files = remote_files(sftp, PROD_REMOTE)
    for rel in files:
        local_dst = dest_dir / rel
        local_dst.parent.mkdir(parents=True, exist_ok=True)
        sftp.get(f"{PROD_REMOTE}/{rel}", str(local_dst))
    print(f"   {len(files)} files backed up")
    return dest_dir


def confirm_prod():
    print()
    print("=" * 50)
    print(" PRODUCTION DEPLOY")
    print(f" Target: {PROD_REMOTE}")
    print(" This will modify the live portal at maine.gov.")
    print("=" * 50)
    response = input("Type 'deploy' to confirm: ").strip()
    if response != 'deploy':
        die("Aborted.")


def main():
    ap = argparse.ArgumentParser(
        description="Deploy comms-portal to maine.gov via SFTP.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument('--prod', action='store_true', help="Deploy to production (default: staging)")
    ap.add_argument('--files', nargs='+', help="Only deploy these files (by name or relative path)")
    ap.add_argument('--diff', action='store_true', help="Show what would change, don't upload")
    ap.add_argument('--backup', action='store_true', help="Snapshot prod locally and exit")
    args = ap.parse_args()

    cfg = load_env()
    target_remote = PROD_REMOTE if args.prod else STAGING_REMOTE
    target_label = 'PRODUCTION' if args.prod else 'staging'

    print(f"Connecting to {cfg['DEPLOY_FTP_HOST']} ...")
    sftp = connect(cfg)

    try:
        if args.backup:
            backup_prod(sftp)
            return

        local_files = collect_local_files(args.files)
        if not local_files:
            die("No local files matched.")

        print(f"Indexing remote {target_remote} ...")
        remote_index = remote_files(sftp, target_remote)

        diff = list(diff_files(local_files, remote_index))
        new = [d for d in diff if d[1] == 'new']
        changed = [d for d in diff if d[1] == 'changed']
        same = [d for d in diff if d[1] == 'same']

        print()
        print(f"Target: {target_label} ({target_remote})")
        print(f"  {len(new)} new, {len(changed)} changed, {len(same)} unchanged")
        for rel, _, ls, _ in new:
            print(f"   + {rel} ({ls} bytes)")
        for rel, _, ls, rs in changed:
            print(f"   ~ {rel} ({rs} → {ls} bytes)")

        if not new and not changed:
            print("\nAlready in sync. Nothing to do.")
            return

        if args.diff:
            print("\n(--diff: not uploading)")
            return

        if args.prod:
            backup_prod(sftp)
            confirm_prod()

        print(f"\nUploading to {target_remote} ...")
        for rel, status, _, _ in diff:
            if status in ('new', 'changed'):
                upload(sftp, LOCAL_DIR / rel, f"{target_remote}/{rel}")
                print(f"   ↑ {rel}")

        url_path = 'communications' if args.prod else 'communications-staging'
        print()
        print(f"Done. {len(new) + len(changed)} files uploaded.")
        print(f"   https://www.maine.gov/doe/sites/maine.gov.doe/files/bulk/{url_path}/index.html")
    finally:
        sftp.close()


if __name__ == '__main__':
    main()
