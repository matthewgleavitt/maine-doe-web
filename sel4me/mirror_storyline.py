#!/usr/bin/env python3
"""
SEL4ME Storyline Module Mirror
==============================
Copies a published Articulate Storyline module (the static folder that
contains story.html) from a web address into a local folder, so it can be
re-hosted next to the reconstructed SEL4ME lessons.

A published Storyline module is not a video — it is a small web app:
story.html + html5/ (player scripts, one data file per slide) + story_content/
(images, audio, video, captions). This script fetches story.html, follows every
file it references, and keeps following references until nothing new turns up.
Slide files are referenced by id inside html5/data/js/data.js rather than by
path, so those ids are collected and fetched as html5/data/js/<id>.js too.

Usage:
    # 1. Confirm the address pattern for ONE module (fetches only story.html):
    python mirror_storyline.py --check \
        --template "https://example.org/path/{id}/" \
        --module Good_Sportsmanship_6_2023

    # 2. Mirror one or more modules:
    python mirror_storyline.py --template "https://example.org/path/{id}/" \
        --module Good_Sportsmanship_6_2023 --module Athletic_Recruitment_G10 \
        --out modules

    # 3. Mirror everything listed in storyline_modules.json (see build_module_inventory.py):
    python mirror_storyline.py --template "https://example.org/path/{id}/" \
        --modules storyline_modules.json --out modules

{id} in the template is replaced with the module id (URL-encoded, so spaces
become %20). Each module lands in <out>/<safe_folder>/ where safe_folder is the
module id with spaces turned into underscores and any other odd characters
dropped — the same rule the lesson converter uses to find the folder.

The script is resumable: files already on disk are skipped on a re-run
(unless their size no longer matches the last manifest, e.g. a damaged copy).
A mirror-manifest.json is written inside each module folder and a
mirror-report.json at the top of --out.
"""

import argparse
import concurrent.futures
import json
import os
import posixpath
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

# Same rule as sel4me_converter.py and build_module_inventory.py — keep identical.
def safe_module_folder(module_id):
    """Spaces -> underscores, then drop any char not in A-Za-z0-9._-"""
    return re.sub(r'[^A-Za-z0-9._-]', '', module_id.replace(' ', '_'))


DEFAULT_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36')

# Files a published Storyline folder normally contains. Whichever of these
# exist are fetched first; everything else is discovered by following references.
SEED_PATHS = [
    'story.html',
    'story_html5.html',
    'index.html',
    'meta.xml',
    'analytics-frame.html',
    'story_content/frame.xml',
    'story_content/user.js',
    'story_content/thumbnail.jpg',
    'html5/data/js/data.js',
    'html5/data/js/paths.js',
    'html5/data/js/frame.js',
    'html5/data/css/output.min.css',
    'html5/lib/scripts/bootstrapper.min.js',
    'html5/lib/stylesheets/main.min.css',
    'mobile/data.js',
]
ENTRY_CANDIDATES = ['story.html', 'story_html5.html', 'index.html']

TEXT_EXT = {'.html', '.htm', '.js', '.css', '.xml', '.json', '.vtt', '.txt', '.svg'}
ASSET_EXT = ('js|css|json|xml|html?|png|jpe?g|gif|svg|webp|mp4|m4v|webm|mp3|m4a|ogg|wav|'
             'vtt|srt|woff2?|ttf|eot|otf|swf|pdf|ico|cur')

# Quoted / parenthesised relative paths with a known extension
RE_QUOTED = re.compile(r'''["'(]\s*([^"'()<>\s]+?\.(?:%s))(?:[?#][^"'()\s]*)?\s*["')]''' % ASSET_EXT, re.I)
# Bare Storyline folder fragments that may be built up in code
RE_FRAGMENT = re.compile(r'(?<![A-Za-z0-9_./-])((?:story_content|html5|mobile)/[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,5})', re.I)
# Storyline object ids (11 chars, letters+digits). Only harvested from the data files.
RE_ID = re.compile(r'(?<![A-Za-z0-9])([A-Za-z0-9]{11})(?![A-Za-z0-9])')
ID_SOURCE_RE = re.compile(r'^html5/data/js/[A-Za-z0-9_-]+\.js$|^mobile/.*\.js$|^story_content/frame\.xml$', re.I)


def log(msg):
    print(msg, flush=True)


class IndexParser(HTMLParser):
    """Pulls hrefs out of an Apache/python 'Index of' directory listing."""
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            for k, v in attrs:
                if k == 'href' and v:
                    self.hrefs.append(v)


STORYLINE_MARKERS = ('story_content', 'html5/', 'globalProvideData', 'story_html5', 'articulate')


def is_login_page(text):
    m = re.search(r'<title>(.*?)</title>', text[:4000], re.I | re.S)
    title = (m.group(1) if m else '').lower()
    return any(w in title for w in ('login', 'log in', 'sign in', 'registration'))


def looks_like_launcher(text):
    low = text.lower()
    return any(k.lower() in low for k in STORYLINE_MARKERS)


def is_dir_listing(body):
    head = body[:2000].lower()
    return '<title>index of' in head or 'directory listing for' in head


def normalise_rel(path):
    """Return a clean module-relative posix path, or None if it escapes the module."""
    if not path:
        return None
    path = path.split('#', 1)[0].split('?', 1)[0]
    path = urllib.parse.unquote(path).replace('\\', '/')
    if path.startswith('/') or '://' in path or re.match(r'^[A-Za-z]:', path):
        return None
    norm = posixpath.normpath(path)
    if norm in ('.', '') or norm.startswith('../') or norm == '..' or ':' in norm:
        return None
    parts = norm.split('/')
    if any(p in ('', '.', '..') for p in parts):
        return None
    return norm


class Fetcher:
    def __init__(self, ua, timeout, retries, delay, headers):
        self.ua = ua
        self.timeout = timeout
        self.retries = retries
        self.delay = delay
        self.headers = headers
        self.lock = threading.Lock()
        self.requests_made = 0

    def get(self, url):
        """Return (status, content_type, body_bytes). status 0 = network failure."""
        last_err = None
        for attempt in range(self.retries + 1):
            if self.delay:
                time.sleep(self.delay)
            req = urllib.request.Request(url, headers={'User-Agent': self.ua, **self.headers})
            try:
                with self.lock:
                    self.requests_made += 1
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.status, resp.headers.get('Content-Type', ''), resp.read()
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < self.retries:
                    time.sleep(min(2 ** attempt, 20))
                    last_err = e
                    continue
                return e.code, e.headers.get('Content-Type', '') if e.headers else '', b''
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last_err = e
                if attempt < self.retries:
                    time.sleep(min(2 ** attempt, 20))
                    continue
        return 0, str(last_err), b''


class ModuleMirror:
    def __init__(self, module_id, template, out_root, fetcher, args):
        self.module_id = module_id
        self.folder = safe_module_folder(module_id) or 'module'
        self.out_dir = os.path.abspath(os.path.join(out_root, self.folder))
        self.base_url = self.build_base(template, module_id)
        self.fetcher = fetcher
        self.args = args
        self.files = {}          # rel path -> record
        self.seen = set()        # rel paths queued or done
        self.ids_seen = set()
        self.external_refs = set()
        self.listing_dirs_seen = set()
        self.html_for_binary = 0
        self.lock = threading.Lock()
        self.prev_sizes = {}
        try:
            with open(os.path.join(self.out_dir, 'mirror-manifest.json'), 'r', encoding='utf-8') as f:
                for rec in json.load(f).get('files', []):
                    self.prev_sizes[rec['path']] = rec.get('bytes')
        except (OSError, ValueError, KeyError, TypeError):
            pass

    @staticmethod
    def build_base(template, module_id):
        if '{id}' not in template:
            raise SystemExit("--template must contain {id}, e.g. https://host/path/{id}/")
        base = template.replace('{id}', urllib.parse.quote(module_id, safe=''))
        if not base.endswith('/'):
            base += '/'
        return base

    def url_for(self, rel):
        return self.base_url + urllib.parse.quote(rel, safe='/')

    def local_path(self, rel):
        target = os.path.abspath(os.path.join(self.out_dir, *rel.split('/')))
        if os.path.commonpath([self.out_dir, target]) != self.out_dir:
            return None
        return target

    # ---- discovery helpers -------------------------------------------------
    def refs_from_text(self, rel, text):
        found = set()
        base_dir = posixpath.dirname(rel)
        for m in RE_QUOTED.finditer(text):
            found.add((base_dir, m.group(1)))
        for m in RE_FRAGMENT.finditer(text):
            found.add(('', m.group(1)))
        out = set()
        for base_dir, raw in found:
            if '://' in raw or raw.startswith('//'):
                self.external_refs.add(raw)
                continue
            if raw.startswith('data:') or raw.startswith('javascript:'):
                continue
            for candidate in (posixpath.join(base_dir, raw) if base_dir else raw, raw):
                norm = normalise_rel(candidate)
                if norm:
                    out.add(norm)
        if ID_SOURCE_RE.match(rel) and not self.args.no_id_follow:
            for m in RE_ID.finditer(text):
                sid = m.group(1)
                if sid.isdigit() or sid.isalpha():
                    continue
                if sid in self.ids_seen:
                    continue
                self.ids_seen.add(sid)
                out.add('html5/data/js/%s.js' % sid)
                out.add('mobile/%s.js' % sid)
        return out

    def refs_from_listing(self, rel_dir, body):
        p = IndexParser()
        p.feed(body)
        out = set()
        for href in p.hrefs:
            href = urllib.parse.unquote(href)
            if href.startswith(('?', '/', '#')) or '://' in href or href in ('../', '..', './'):
                continue
            if href.endswith('/'):
                sub = normalise_rel(posixpath.join(rel_dir, href.rstrip('/')))
                if sub and sub not in self.listing_dirs_seen:
                    self.listing_dirs_seen.add(sub)
                    out.add(sub + '/')
            else:
                norm = normalise_rel(posixpath.join(rel_dir, href))
                if norm:
                    out.add(norm)
        return out

    # ---- one fetch ----------------------------------------------------------
    def process(self, rel):
        """Fetch one path (file or 'dir/' listing). Returns set of new rel paths."""
        is_dir = rel.endswith('/')
        url = self.base_url + urllib.parse.quote(rel.rstrip('/'), safe='/') + ('/' if is_dir else '')
        if is_dir:
            status, ctype, body = self.fetcher.get(url)
            if status == 200 and 'html' in ctype.lower():
                text = body.decode('utf-8', 'replace')
                if is_dir_listing(text):
                    return self.refs_from_listing(rel.rstrip('/'), text)
            return set()

        target = self.local_path(rel)
        if target is None:
            return set()
        ext = posixpath.splitext(rel)[1].lower()

        if (os.path.isfile(target) and not self.args.refresh
                and self.prev_sizes.get(rel, os.path.getsize(target)) == os.path.getsize(target)):
            with open(target, 'rb') as f:
                body = f.read()
            with self.lock:
                self.files[rel] = {'path': rel, 'bytes': len(body), 'status': 'cached', 'content_type': ''}
            return self.refs_from_text(rel, body.decode('utf-8', 'replace')) if ext in TEXT_EXT else set()

        status, ctype, body = self.fetcher.get(url)
        rec = {'path': rel, 'bytes': len(body), 'status': status, 'content_type': ctype}
        if status != 200:
            if status not in (404, 403):
                rec['note'] = 'fetch failed'
            with self.lock:
                if status not in (404,):
                    self.files[rel] = rec
            return set()

        looks_html = body[:512].lstrip().lower().startswith((b'<!doctype', b'<html'))
        if ext not in ('.html', '.htm') and ('text/html' in ctype.lower() or looks_html):
            # A web page came back where a script/media file should be: wrong address
            # or the folder needs a login. Don't save it as if it were the file.
            rec['status'] = 'html-instead-of-file'
            with self.lock:
                self.html_for_binary += 1
                self.files[rel] = rec
            return set()
        if ext in ('.html', '.htm'):
            text = body.decode('utf-8', 'replace')
            if is_dir_listing(text):
                rec['status'] = 'listing'
                with self.lock:
                    self.files[rel] = rec
                return set()
            if is_login_page(text) or (rel in ENTRY_CANDIDATES and not looks_like_launcher(text)):
                # A login/registration page, or an HTML page that is not a Storyline launcher
                rec['status'] = 'html-instead-of-file'
                with self.lock:
                    self.html_for_binary += 1
                    self.files[rel] = rec
                return set()

        if not self.args.dry_run:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            tmp = target + '.part'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, target)
        rec['status'] = 'downloaded'
        with self.lock:
            self.files[rel] = rec
        if ext in TEXT_EXT:
            return self.refs_from_text(rel, body.decode('utf-8', 'replace'))
        return set()

    # ---- the loop -------------------------------------------------------------
    def run(self):
        started = time.strftime('%Y-%m-%d %H:%M:%S')
        pending = list(SEED_PATHS) + ['']  # '' = module root (directory listing, if any)
        pending = [p if p else 'ROOT/' for p in pending]
        for p in pending:
            self.seen.add(p)
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.args.concurrency) as pool:
            while pending:
                batch, pending = pending, []
                futures = {}
                for rel in batch:
                    real = '' if rel == 'ROOT/' else rel
                    if rel == 'ROOT/':
                        futures[pool.submit(self.process_root)] = rel
                    else:
                        futures[pool.submit(self.process, real)] = rel
                for fut in concurrent.futures.as_completed(futures):
                    try:
                        new = fut.result()
                    except Exception as e:  # keep going; record it
                        with self.lock:
                            self.files.setdefault(futures[fut], {'path': futures[fut]})['error'] = repr(e)
                        continue
                    for n in new:
                        if n not in self.seen:
                            self.seen.add(n)
                            pending.append(n)
        return self.finish(started)

    def process_root(self):
        status, ctype, body = self.fetcher.get(self.base_url)
        if status == 200 and 'html' in ctype.lower():
            text = body.decode('utf-8', 'replace')
            if is_dir_listing(text):
                return self.refs_from_listing('', text)
        return set()

    def finish(self, started):
        downloaded = [r for r in self.files.values() if r.get('status') in ('downloaded', 'cached')]
        entry = None
        for cand in ENTRY_CANDIDATES:
            if cand in self.files and self.files[cand].get('status') in ('downloaded', 'cached'):
                entry = cand
                break
        missing_seeds = [s for s in SEED_PATHS if s not in self.files or self.files[s].get('status') not in ('downloaded', 'cached')]
        total_bytes = sum(r.get('bytes', 0) for r in downloaded)
        manifest = {
            'module_id': self.module_id,
            'folder': self.folder,
            'base_url': self.base_url,
            'entry': entry,
            'file_count': len(downloaded),
            'total_bytes': total_bytes,
            'files': sorted(downloaded, key=lambda r: r['path']),
            'problem_files': sorted([r for r in self.files.values() if r.get('status') not in ('downloaded', 'cached')], key=lambda r: str(r.get('path'))),
            'missing_seeds': missing_seeds,
            'external_refs': sorted(self.external_refs),
            'slide_ids_followed': len(self.ids_seen),
            'html_instead_of_file': self.html_for_binary,
            'dry_run': bool(self.args.dry_run),
            'started': started,
            'finished': time.strftime('%Y-%m-%d %H:%M:%S'),
        }
        if entry and not self.args.dry_run:
            os.makedirs(self.out_dir, exist_ok=True)
            with open(os.path.join(self.out_dir, 'mirror-manifest.json'), 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=1)
        return manifest


def load_module_ids(args):
    ids = []
    if args.modules:
        with open(args.modules, 'r', encoding='utf-8') as f:
            data = json.load(f)
        items = data.get('modules', data) if isinstance(data, dict) else data
        for item in items:
            ids.append(item['id'] if isinstance(item, dict) else str(item))
    ids.extend(args.module or [])
    if args.module and args.modules:
        # --module narrows the inventory when both are given
        wanted = set(args.module)
        ids = [i for i in ids if i in wanted]
    seen, ordered = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            ordered.append(i)
    return ordered


def check_one(module_id, template, fetcher):
    base = ModuleMirror.build_base(template, module_id)
    log("Checking %s" % base)
    ok = False
    for cand in ENTRY_CANDIDATES:
        url = base + cand
        status, ctype, body = fetcher.get(url)
        note = ''
        if status == 200:
            text = body.decode('utf-8', 'replace')
            if looks_like_launcher(text) and not is_login_page(text):
                note = 'looks like a Storyline launcher'
                ok = True
            elif 'html' in ctype.lower():
                note = 'HTML, but not a Storyline launcher (login page or wrong folder?)'
        log("  %-18s -> %s  %s  %s bytes  %s" % (cand, status, ctype.split(';')[0], len(body), note))
        if ok:
            break
    status, ctype, body = fetcher.get(base)
    if status == 200 and is_dir_listing(body.decode('utf-8', 'replace')):
        log("  folder listing is available at the module root (full mirror will be easy)")
    log("Result: %s" % ("address pattern works" if ok else "no Storyline launcher found at this address"))
    return ok


def main():
    ap = argparse.ArgumentParser(description='Mirror published Articulate Storyline modules to a local folder')
    ap.add_argument('--template', required=True, help='Module address with {id}, e.g. https://host/path/{id}/')
    ap.add_argument('--module', action='append', help='Module id (repeatable). With --modules, limits the run to these ids')
    ap.add_argument('--modules', help='storyline_modules.json from build_module_inventory.py')
    ap.add_argument('--out', default='modules', help='Output folder (default: modules)')
    ap.add_argument('--check', action='store_true', help='Only test that story.html exists for the first module')
    ap.add_argument('--dry-run', action='store_true', help='Discover and report, download nothing')
    ap.add_argument('--refresh', action='store_true', help='Re-download files that already exist')
    ap.add_argument('--no-id-follow', action='store_true', help='Do not fetch slide files by id from data.js')
    ap.add_argument('--concurrency', type=int, default=3, help='Parallel downloads per module (default 3)')
    ap.add_argument('--delay', type=float, default=0.1, help='Pause before each request, seconds (default 0.1)')
    ap.add_argument('--retries', type=int, default=3, help='Retries on temporary errors (default 3)')
    ap.add_argument('--timeout', type=int, default=60, help='Per-request timeout, seconds')
    ap.add_argument('--user-agent', default=DEFAULT_UA, help='User-Agent header to send')
    ap.add_argument('--header', action='append', default=[], help='Extra request header, KEY=VALUE (repeatable)')
    args = ap.parse_args()

    headers = {}
    for h in args.header:
        if '=' not in h:
            ap.error('--header expects KEY=VALUE')
        k, v = h.split('=', 1)
        headers[k.strip()] = v.strip()

    ids = load_module_ids(args)
    if not ids:
        ap.error('give --module ID and/or --modules storyline_modules.json')

    fetcher = Fetcher(args.user_agent, args.timeout, args.retries, args.delay, headers)

    if args.check:
        sys.exit(0 if check_one(ids[0], args.template, fetcher) else 1)

    os.makedirs(args.out, exist_ok=True)
    report = {'template': args.template, 'out': os.path.abspath(args.out), 'modules': []}
    failures = 0
    for n, module_id in enumerate(ids, 1):
        log("\n[%d/%d] %s" % (n, len(ids), module_id))
        mm = ModuleMirror(module_id, args.template, args.out, fetcher, args)
        manifest = mm.run()
        summary = {k: manifest[k] for k in ('module_id', 'folder', 'entry', 'file_count', 'total_bytes', 'missing_seeds', 'html_instead_of_file')}
        summary['problem_count'] = len(manifest['problem_files'])
        report['modules'].append(summary)
        if manifest['entry']:
            log("  ok: %d files, %.1f MB, entry %s -> %s" % (manifest['file_count'], manifest['total_bytes'] / 1e6, manifest['entry'], mm.out_dir))
            if manifest['html_instead_of_file']:
                log("  warning: %d files came back as web pages instead of module files (login wall or wrong address?)" % manifest['html_instead_of_file'])
        else:
            failures += 1
            log("  FAILED: no story.html found at %s" % mm.base_url)
            if manifest['html_instead_of_file']:
                log("  the server returned web pages instead of files — check the address, or the folder may need a login")
    report['failed'] = failures
    report['requests_made'] = fetcher.requests_made
    with open(os.path.join(args.out, 'mirror-report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    log("\nDone: %d of %d modules mirrored, %d requests. Report: %s" % (len(ids) - failures, len(ids), fetcher.requests_made, os.path.join(args.out, 'mirror-report.json')))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
