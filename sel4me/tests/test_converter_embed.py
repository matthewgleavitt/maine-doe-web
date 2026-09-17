#!/usr/bin/env python3
"""
Converter embed test
====================
Checks that the Storyline-embed patch in sel4me_converter.py changes nothing
except the interactive-module block.

Usage:
    python tests/test_converter_embed.py [--original path/to/unpatched_sel4me_converter.py]

Without --original, the unpatched converter is fetched from git history
(sel4me/sel4me_converter.py at the first commit that added it) when available;
otherwise the placeholder/embed assertions still run against the current code.
Needs the data files in sel4me/data/ (see README).
"""
import argparse, difflib, importlib.util, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SEL = os.path.dirname(HERE)
FIXTURE = os.path.join(HERE, 'fixtures', '1834_Good_Sportsmanship.html')
MODULE_ID = 'Good_Sportsmanship_6_2023'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def convert(mod, out_dir, **kw):
    with open(os.path.join(SEL, 'data', 'SEL4ME_all_lesson_data.json'), encoding='utf-8') as f:
        all_data = json.load(f)
    with open(os.path.join(SEL, 'data', 'sel4me_full_catalog.json'), encoding='utf-8') as f:
        catalog = json.load(f)
    path = mod.convert_lesson(FIXTURE, all_data, catalog, out_dir, None, False, **kw)
    assert path and os.path.isfile(path), 'converter produced no file'
    with open(path, encoding='utf-8') as f:
        return path, f.read()


def find_original(explicit):
    if explicit:
        return explicit
    try:
        first = subprocess.run(['git', '-C', SEL, 'log', '--diff-filter=A', '--format=%H', '--', 'sel4me/sel4me_converter.py'],
                               capture_output=True, text=True, check=True).stdout.split()
        if first:
            src = subprocess.run(['git', '-C', SEL, 'show', f'{first[-1]}:sel4me/sel4me_converter.py'],
                                 capture_output=True, text=True, check=True).stdout
            tmp = os.path.join(tempfile.mkdtemp(prefix='orig_conv_'), 'sel4me_converter.py')
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(src)
            return tmp
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return None


def only_diff_lines(a, b):
    return [l for l in difflib.unified_diff(a.splitlines(), b.splitlines(), lineterm='', n=0)
            if (l.startswith('+') or l.startswith('-')) and not l.startswith(('+++', '---'))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--original', default=None, help='Path to the unpatched converter for a before/after diff')
    args = ap.parse_args()
    patched = load(os.path.join(SEL, 'sel4me_converter.py'), 'patched_conv')
    original_path = find_original(args.original)
    original = load(original_path, 'orig_conv') if original_path else None
    failures = 0

    def check(name, cond, detail=''):
        nonlocal failures
        print(('PASS ' if cond else 'FAIL ') + name + (('  ' + detail) if detail and not cond else ''))
        if not cond:
            failures += 1

    tmp = tempfile.mkdtemp(prefix='sel4me_embed_test_')
    try:
        # 1. No modules folder: placeholder stays, only gains data-module
        out1 = os.path.join(tmp, 'lessons')
        _, html_plain = convert(patched, out1)
        check('placeholder kept when no modules dir', 'articulate-placeholder' in html_plain and '<iframe' not in html_plain)
        check('placeholder carries data-module', f'data-module="{MODULE_ID}"' in html_plain)
        if original:
            _, html_orig = convert(original, os.path.join(tmp, 'orig'))
            # The patch adds one CSS block for embeds; drop it, then nothing but data-module may differ
            stripped = re.sub(r'/\* Embedded Storyline module \*/.*?(?=/\* Articulate placeholder \*/)', '', html_plain, flags=re.S)
            check('patched output contains the new embed CSS block', stripped != html_plain)
            d = only_diff_lines(html_orig, stripped)
            unexpected = [l for l in d if 'data-module' not in l and 'class="articulate-placeholder"' not in l]
            check('unpatched vs patched output differs only by data-module', not unexpected, '\n'.join(unexpected[:10]))
        else:
            print('SKIP before/after diff (no original converter available; pass --original)')

        # 2. Mirrored module present: iframe with a relative src that resolves on disk
        out2 = os.path.join(tmp, 'site', 'lessons')
        modules = os.path.join(tmp, 'site', 'modules')
        folder = os.path.join(modules, patched.safe_module_folder(MODULE_ID))
        os.makedirs(folder)
        with open(os.path.join(folder, 'story.html'), 'w') as f:
            f.write('<html><body>story</body></html>')
        path2, html_embed = convert(patched, out2, modules_dir=modules)
        m = re.search(r'<iframe src="([^"]+)"', html_embed)
        check('iframe emitted when module is mirrored', bool(m))
        if m:
            resolved = os.path.normpath(os.path.join(os.path.dirname(path2), m.group(1)))
            check('iframe src resolves to story.html on disk', os.path.isfile(resolved), resolved)
            check('iframe src uses forward slashes and is relative', '\\' not in m.group(1) and not m.group(1).startswith('/'))
            check('open-in-new-tab link matches iframe src', f'href="{m.group(1)}" target="_blank"' in html_embed)
        check('placeholder removed when embedded', 'articulate-placeholder"' not in html_embed.replace('.articulate-placeholder', ''))
        d2 = only_diff_lines(html_plain, html_embed)
        stray = [l for l in d2 if not any(k in l for k in ('module-embed', 'iframe', 'articulate-placeholder', 'placeholder-icon', 'Interactive', 'Articulate Storyline', MODULE_ID, 'placeholder-note', 'Open in a new tab', '</div>', '<h3>', '<p>', '<code>', '<span>'))]
        check('embedding changes only the module block', not stray, '\n'.join(stray[:10]))

        # 3. Folder exists but has no entry file: fall back to placeholder
        empty = os.path.join(tmp, 'site2', 'modules', patched.safe_module_folder(MODULE_ID))
        os.makedirs(empty)
        _, html_noentry = convert(patched, os.path.join(tmp, 'site2', 'lessons'), modules_dir=os.path.join(tmp, 'site2', 'modules'))
        check('placeholder when module folder has no story.html', '<iframe' not in html_noentry and 'articulate-placeholder' in html_noentry)

        # 4. Manifest entry is honoured; --modules-url replaces the relative path
        with open(os.path.join(folder, 'mirror-manifest.json'), 'w') as f:
            json.dump({'entry': 'story_html5.html'}, f)
        with open(os.path.join(folder, 'story_html5.html'), 'w') as f:
            f.write('x')
        _, html_url = convert(patched, os.path.join(tmp, 'site3'), modules_dir=modules, modules_url='https://example.org/sel4me/modules/')
        check('modules-url used as src and manifest entry honoured',
              f'src="https://example.org/sel4me/modules/{MODULE_ID}/story_html5.html"' in html_url)
        _, html_url2 = convert(patched, os.path.join(tmp, 'site4'), modules_url='https://example.org/sel4me/modules')
        check('modules-url alone assumes story.html (no trailing slash ok)',
              f'src="https://example.org/sel4me/modules/{MODULE_ID}/story.html"' in html_url2)

        # 5. Ids with spaces map to the sanitised folder and are escaped in attributes
        spaced = 'College_Words_to_Know_G2_2023 - Storyline output'
        check('safe folder rule', patched.safe_module_folder(spaced) == 'College_Words_to_Know_G2_2023_-_Storyline_output')
        src = patched.module_embed_src(spaced, '/x/lessons/a.html', None, 'https://h/m/')
        check('spaced id url-encoded in modules-url src', src == 'https://h/m/College_Words_to_Know_G2_2023_-_Storyline_output/story.html', src)
        check('traversal-looking id cannot escape', patched.module_embed_src('../../etc', '/x/a.html', modules) is None)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print('\n%s' % ('ALL PASSED' if not failures else '%d FAILED' % failures))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
