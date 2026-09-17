#!/usr/bin/env python3
"""
Fake Storyline module generator (for local tests only)
=====================================================
Builds a folder that looks like a published Articulate Storyline module, so
mirror_storyline.py can be tested without touching any real server.

Usage:
    python tests/make_fake_storyline.py --root /tmp/fake --module "Good Sportsmanship 6 2023 - Storyline output"

Slides are referenced inside html5/data/js/data.js by 11-character ids only,
one slide references another id that appears nowhere else (chained discovery),
and story_content/unreferenced_note.txt is referenced by nothing, so only a
directory listing can find it.
"""
import argparse, json, os, random

SLIDE_IDS = ['6cR1x8KUx0n', '5fTgdvj1MhS', '6LqW2d0PZbA', '5Xp3kQ9mT2b', '6hJ7nL4vC1d', '5aB9cD2eF3g', '6zY8xW7vU6t', '5mN4bV3cX2z']
CHAINED_ID = '6QqQ1wWeE2r'
MOBILE_ID = '5tT6yY7uU8i'


def w(root, rel, data):
    path = os.path.join(root, *rel.split('/'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = 'wb' if isinstance(data, bytes) else 'w'
    with open(path, mode, **({} if mode == 'wb' else {'encoding': 'utf-8'})) as f:
        f.write(data)


def build(root):
    rnd = random.Random(1234)
    w(root, 'story.html', '''<!DOCTYPE html><html><head><title>Fake Storyline</title>
<link rel="stylesheet" href="html5/lib/stylesheets/main.min.css">
<script src="html5/lib/scripts/bootstrapper.min.js"></script>
<script src="html5/data/js/data.js"></script>
</head><body><img src="story_content/thumbnail.jpg"><div id="preso"></div>
<script>var g_strLaunch = "story_content/user.js"; globalProvideData('x', 'html5/data/js/paths.js');</script>
</body></html>''')
    w(root, 'story_html5.html', '<html><head><script src="html5/lib/scripts/app.min.js"></script></head><body>html5</body></html>')
    w(root, 'meta.xml', '<?xml version="1.0"?><meta title="Fake" thumbnail="story_content/thumbnail.jpg" />')
    w(root, 'analytics-frame.html', '<html><body><script src="html5/lib/scripts/main.min.js"></script></body></html>')
    w(root, 'story_content/thumbnail.jpg', bytes(rnd.getrandbits(8) for _ in range(4096)))
    w(root, 'story_content/user.js', '// user script\n')
    w(root, 'story_content/unreferenced_note.txt', 'nobody links to me\n')
    w(root, 'story_content/intro_video.mp4', bytes(rnd.getrandbits(8) for _ in range(5 * 1024 * 1024)))
    w(root, 'story_content/narration_01.mp3', bytes(rnd.getrandbits(8) for _ in range(20000)))
    w(root, 'story_content/intro_video.vtt', 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n')
    w(root, 'story_content/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')
    w(root, 'story_content/5fTgdvj1MhS_80_DX300_DY300.png', bytes(rnd.getrandbits(8) for _ in range(3000)))
    w(root, 'story_content/6cR1x8KUx0n_80_DX600_DY400.jpg', bytes(rnd.getrandbits(8) for _ in range(3500)))
    w(root, 'story_content/space name.png', bytes(rnd.getrandbits(8) for _ in range(1500)))

    data = {'title': 'Fake', 'slides': [{'id': sid, 'title': 'Slide %d' % i, 'lmsId': 'Scene1_Slide%d' % i} for i, sid in enumerate(SLIDE_IDS, 1)]}
    w(root, 'html5/data/js/data.js', "globalProvideData('data', '%s');\n" % json.dumps(data).replace("'", "\\'"))
    w(root, 'html5/data/js/paths.js', "globalProvideData('paths', '{\"slides\":{}}');\n")
    w(root, 'html5/data/js/frame.js', "globalProvideData('frame', '{\"title\":\"Fake\",\"slides\":[]}');\n")
    media = ['story_content/intro_video.mp4', 'story_content/narration_01.mp3', 'story_content/intro_video.vtt',
             'story_content/icon.svg', 'story_content/5fTgdvj1MhS_80_DX300_DY300.png',
             'story_content/6cR1x8KUx0n_80_DX600_DY400.jpg', 'story_content/space%20name.png', 'story_content/thumbnail.jpg']
    for i, sid in enumerate(SLIDE_IDS):
        extra = (', "next": "%s"' % CHAINED_ID) if i == 3 else ''
        w(root, 'html5/data/js/%s.js' % sid, 'globalProvideData(\'slide\', \'{"id":"%s","media":"%s"%s}\');\n' % (sid, media[i % len(media)], extra))
    w(root, 'html5/data/js/%s.js' % CHAINED_ID, 'globalProvideData(\'slide\', \'{"id":"%s","media":"story_content/space%%20name.png?v=7#x"}\');\n' % CHAINED_ID)
    w(root, 'html5/data/css/output.min.css', '@font-face{src:url(../fonts/OpenSans.woff)}@font-face{src:url("../fonts/OpenSans-Bold.woff2")}')
    w(root, 'html5/data/fonts/OpenSans.woff', bytes(rnd.getrandbits(8) for _ in range(2000)))
    w(root, 'html5/data/fonts/OpenSans-Bold.woff2', bytes(rnd.getrandbits(8) for _ in range(2100)))
    w(root, 'html5/lib/scripts/bootstrapper.min.js', 'var css="html5/data/css/output.min.css"; load("html5/lib/scripts/app.min.js");\n')
    w(root, 'html5/lib/scripts/app.min.js', 'load("html5/lib/scripts/main.min.js"); load("mobile/data.js");\n')
    w(root, 'html5/lib/scripts/main.min.js', '// main\n')
    w(root, 'html5/lib/stylesheets/main.min.css', '.bg{background:url(../../../story_content/icon.svg)}')
    w(root, 'mobile/data.js', "globalProvideData('mobile', '{\"id\":\"%s\"}');\n" % MOBILE_ID)
    w(root, 'mobile/%s.js' % MOBILE_ID, '// mobile slide\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--module', required=True)
    args = ap.parse_args()
    root = os.path.join(args.root, args.module)
    build(root)
    count = sum(len(f) for _, _, f in os.walk(root))
    print('Fake module written: %s (%d files)' % (root, count))


if __name__ == '__main__':
    main()
