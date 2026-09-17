#!/usr/bin/env python3
"""
Local test for mirror_storyline.py
==================================
Serves a fake Storyline module from 127.0.0.1 and checks the mirror is complete,
byte-identical, resumable, and that dry-run / check / login-wall cases behave.
No real server is contacted.

Usage:
    python tests/test_mirror_local.py
"""
import http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SEL = os.path.dirname(HERE)
MIRROR = os.path.join(SEL, 'mirror_storyline.py')
MODULE = 'Good Sportsmanship 6 2023 - Storyline output'
SAFE = 'Good_Sportsmanship_6_2023_-_Storyline_output'
failures = 0


def check(name, cond, detail=''):
    global failures
    print(('PASS ' if cond else 'FAIL ') + name + (('  ' + str(detail)) if detail and not cond else ''))
    if not cond:
        failures += 1


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class Server:
    """Serve `directory` on a free port. mode: 'listing' (default handler), 'nolist' (403 on folders), 'loginwall' (HTML for everything)."""
    def __init__(self, directory, mode='listing'):
        self.port = free_port()
        directory = os.path.abspath(directory)
        counters = {}

        class H(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k):
                super().__init__(*a, directory=directory, **k)

            def log_message(self, *a):
                pass

            def do_GET(self):
                path = urllib.parse.unquote(self.path.split('?')[0])
                if mode == 'loginwall':
                    body = b'<!DOCTYPE html><html><head><title>Registration &amp; Login</title></head><body>please log in</body></html>'
                    self.send_response(200); self.send_header('Content-Type', 'text/html; charset=UTF-8')
                    self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
                if mode == 'nolist' and path.endswith('/'):
                    self.send_error(403); return
                if mode == 'flaky' and path.endswith(('narration_01.mp3', 'frame.js', 'OpenSans.woff')):
                    counters[path] = counters.get(path, 0) + 1
                    if counters[path] == 1:
                        self.send_error(503); return
                if mode == 'flaky' and path.endswith('main.min.js'):
                    self.send_error(500); return
                return super().do_GET()

        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', self.port), H)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.httpd.shutdown(); self.httpd.server_close()

    def template(self, trailing=True):
        return 'http://127.0.0.1:%d/{id}%s' % (self.port, '/' if trailing else '')


def run(*args):
    p = subprocess.run([sys.executable, MIRROR] + list(args), capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def tree(root):
    out = {}
    for d, _, files in os.walk(root):
        for f in files:
            if f in ('mirror-manifest.json',) or f.endswith('.part'):
                continue
            full = os.path.join(d, f)
            with open(full, 'rb') as fh:
                out[os.path.relpath(full, root).replace(os.sep, '/')] = fh.read()
    return out


def manifest(out):
    with open(os.path.join(out, SAFE, 'mirror-manifest.json')) as f:
        return json.load(f)


def main():
    tmp = tempfile.mkdtemp(prefix='mirror_test_')
    try:
        src_root = os.path.join(tmp, 'src')
        subprocess.check_call([sys.executable, os.path.join(HERE, 'make_fake_storyline.py'), '--root', src_root, '--module', MODULE])
        expected = tree(os.path.join(src_root, MODULE))
        decoy = 'story_content/unreferenced_note.txt'

        # 1. Directory listings available: everything, including the decoy, byte-identical
        srv = Server(src_root, 'listing')
        out1 = os.path.join(tmp, 'out1')
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out1, '--delay', '0')
        got = tree(os.path.join(out1, SAFE))
        check('listing mode: exit 0', code == 0, log[-800:])
        check('listing mode: every file mirrored byte-identically (%d files)' % len(expected), got == expected,
              'missing=%s extra=%s' % (sorted(set(expected) - set(got))[:5], sorted(set(got) - set(expected))[:5]))
        m = manifest(out1)
        check('manifest entry is story.html', m['entry'] == 'story.html')
        check('manifest lists all files', {f['path'] for f in m['files']} == set(expected))
        check('report written', os.path.isfile(os.path.join(out1, 'mirror-report.json')))
        # resume: nothing re-downloaded
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out1, '--delay', '0')
        m2 = manifest(out1)
        check('re-run: all files cached', all(f['status'] == 'cached' for f in m2['files']) and code == 0)
        # delete two, truncate one -> exactly those re-downloaded
        for rel in ('story_content/narration_01.mp3', 'html5/data/js/frame.js'):
            os.remove(os.path.join(out1, SAFE, rel))
        with open(os.path.join(out1, SAFE, 'story_content/intro_video.mp4'), 'wb') as f:
            f.write(b'short')
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out1, '--delay', '0')
        m3 = manifest(out1)
        redl = {f['path'] for f in m3['files'] if f['status'] == 'downloaded'}
        check('resume re-downloads the deleted files', {'story_content/narration_01.mp3', 'html5/data/js/frame.js'} <= redl, redl)
        check('resume repairs a truncated file', tree(os.path.join(out1, SAFE))['story_content/intro_video.mp4'] == expected['story_content/intro_video.mp4'])
        check('resume leaves untouched files cached', len(redl) == 3, redl)
        # concurrency: identical result
        out1b = os.path.join(tmp, 'out1b')
        run('--template', srv.template(), '--module', MODULE, '--out', out1b, '--delay', '0', '--concurrency', '8')
        check('concurrency 8 gives the same files', tree(os.path.join(out1b, SAFE)) == expected)
        # check mode
        code, log = run('--check', '--template', srv.template(), '--module', MODULE)
        check('--check succeeds for the right address', code == 0 and 'address pattern works' in log, log[-300:])
        code, log = run('--check', '--template', srv.template().replace('{id}', 'wrong/{id}'), '--module', MODULE)
        check('--check fails for a wrong address', code == 1, log[-300:])
        srv.stop()

        # 2. No listings: reference + id following must find everything except the decoy
        srv = Server(src_root, 'nolist')
        out2 = os.path.join(tmp, 'out2')
        code, log = run('--template', srv.template(trailing=False), '--module', MODULE, '--out', out2, '--delay', '0')
        got2 = tree(os.path.join(out2, SAFE))
        exp2 = {k: v for k, v in expected.items() if k != decoy}
        check('no-listing mode: exit 0', code == 0, log[-800:])
        check('no-listing mode: all referenced files found, incl. chained and mobile ids', got2 == exp2,
              'missing=%s extra=%s' % (sorted(set(exp2) - set(got2))[:8], sorted(set(got2) - set(exp2))[:5]))
        check('no-listing mode: decoy absent', decoy not in got2)
        # dry run
        out3 = os.path.join(tmp, 'out3')
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out3, '--delay', '0', '--dry-run')
        check('dry-run downloads nothing', not os.path.isdir(os.path.join(out3, SAFE)) or not tree(os.path.join(out3, SAFE)))
        check('dry-run still reports the entry', 'entry story.html' in log, log[-400:])
        srv.stop()

        # 3. Flaky server: 503 once then 200 is recovered; permanent 500 is reported
        srv = Server(src_root, 'flaky')
        out4 = os.path.join(tmp, 'out4')
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out4, '--delay', '0', '--retries', '3')
        got4 = tree(os.path.join(out4, SAFE))
        m4 = manifest(out4)
        check('flaky: temporarily failing files recovered', all(k in got4 for k in ('story_content/narration_01.mp3', 'html5/data/js/frame.js', 'html5/data/fonts/OpenSans.woff')))
        check('flaky: permanent 500 listed as a problem file', any(p['path'] == 'html5/lib/scripts/main.min.js' for p in m4['problem_files']))
        check('flaky: module still has an entry, exit 0', code == 0 and m4['entry'] == 'story.html')
        srv.stop()

        # 4. Login wall: nothing saved, failure reported, exit 1
        srv = Server(src_root, 'loginwall')
        out5 = os.path.join(tmp, 'out5')
        code, log = run('--template', srv.template(), '--module', MODULE, '--out', out5, '--delay', '0')
        check('login wall: exit 1 with a hint', code == 1 and 'login' in log.lower(), log[-400:])
        check('login wall: no module files written', not os.path.isdir(os.path.join(out5, SAFE)) or not tree(os.path.join(out5, SAFE)))
        code, log = run('--check', '--template', srv.template(), '--module', MODULE)
        check('login wall: --check exits 1 and says so', code == 1 and 'not a Storyline launcher' in log, log[-300:])
        srv.stop()

        # 5. Hostile references never escape the output folder
        hostile_root = os.path.join(tmp, 'hostile')
        subprocess.check_call([sys.executable, os.path.join(HERE, 'make_fake_storyline.py'), '--root', hostile_root, '--module', 'Evil'])
        with open(os.path.join(hostile_root, 'Evil', 'html5/data/js/data.js'), 'a') as f:
            f.write('\nvar bad = ["../../escape.js", "/etc/passwd", "C:/x.js", "https://evil.example/x.js", "javascript:alert(1)", "data:text/plain,x", "..\\\\..\\\\win.js"];\n')
        with open(os.path.join(hostile_root, 'escape.js'), 'w') as f:
            f.write('should never be fetched')
        srv = Server(hostile_root, 'nolist')
        out6 = os.path.join(tmp, 'out6')
        code, log = run('--template', srv.template(), '--module', 'Evil', '--out', out6, '--delay', '0')
        written = tree(out6)
        check('hostile refs: nothing written outside the module folder', all(k.startswith('Evil/') or k == 'mirror-report.json' for k in written), [k for k in written if not k.startswith('Evil/')][:5])
        check('hostile refs: no escape.js / passwd / win.js anywhere', not any(k.endswith(('escape.js', 'passwd', 'win.js', 'x.js')) for k in written))
        m6 = json.load(open(os.path.join(out6, 'Evil', 'mirror-manifest.json')))
        check('hostile refs: external URL recorded in manifest', any('evil.example' in r for r in m6['external_refs']), m6['external_refs'])
        check('hostile refs: run still completes', code == 0)
        srv.stop()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print('\n%s' % ('ALL PASSED' if not failures else '%d FAILED' % failures))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
