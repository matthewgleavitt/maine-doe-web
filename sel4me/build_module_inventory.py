#!/usr/bin/env python3
"""
SEL4ME Storyline Module Inventory
=================================
Lists every Articulate Storyline module the lessons reference, and which
lessons use each one, so the modules can be mirrored and wired back in.

Usage:
    python build_module_inventory.py
    python build_module_inventory.py --data data/SEL4ME_all_lesson_data.json \
        --catalog data/sel4me_full_catalog.json --out storyline_modules

Writes storyline_modules.json and storyline_modules.csv next to this script
(or wherever --out points, without extension).

The data files are not in git. Download them from the public BULK folder:
https://www.maine.gov/doe/sites/maine.gov.doe/files/bulk/sel4me/
"""

import argparse
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DATA_URL = 'https://www.maine.gov/doe/sites/maine.gov.doe/files/bulk/sel4me/'

# Copied verbatim from sel4me_converter.py
GRADE_MAP = {
    '201273': 'Preschool', '201272': 'Grade K', '201384': 'Grade 1',
    '201385': 'Grade 2', '201381': 'Grade 3', '201323': 'Grade 4',
    '201324': 'Grade 5', '201325': 'Grade 6', '201326': 'Grade 7',
    '201327': 'Grade 8', '201328': 'Grade 9', '200982': 'Grade 10',
    '200983': 'Grade 11', '200984': 'Grade 12'
}


# Same rule as sel4me_converter.py and mirror_storyline.py — keep identical.
def safe_module_folder(module_id):
    """Spaces -> underscores, then drop any char not in A-Za-z0-9._-"""
    return re.sub(r'[^A-Za-z0-9._-]', '', module_id.replace(' ', '_'))


def main():
    ap = argparse.ArgumentParser(description='Build the SEL4ME Storyline module inventory')
    ap.add_argument('--data', default=os.path.join(HERE, 'data', 'SEL4ME_all_lesson_data.json'))
    ap.add_argument('--catalog', default=os.path.join(HERE, 'data', 'sel4me_full_catalog.json'))
    ap.add_argument('--out', default=os.path.join(HERE, 'storyline_modules'), help='Output path without extension')
    args = ap.parse_args()

    for path in (args.data, args.catalog):
        if not os.path.isfile(path):
            print("Missing data file: %s" % path)
            print("Download it from %s and place it there (or pass --data/--catalog)." % PUBLIC_DATA_URL)
            sys.exit(2)

    with open(args.data, 'r', encoding='utf-8') as f:
        all_data = json.load(f)
    with open(args.catalog, 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    cat_lookup = {c['id']: c for c in catalog}

    modules = {}
    lessons_with_modules = set()
    multi = []
    for lesson_id, lesson in all_data.items():
        ids = lesson.get('assets', {}).get('articulate', []) or []
        if not ids:
            continue
        lessons_with_modules.add(lesson_id)
        if len(set(ids)) > 1:
            multi.append({'lesson_id': lesson_id, 'title': lesson.get('title', ''), 'modules': sorted(set(ids))})
        cat = cat_lookup.get(lesson_id, {})
        entry = {
            'lesson_id': lesson_id,
            'title': lesson.get('title') or cat.get('t', ''),
            'grades': [GRADE_MAP.get(g, g) for g in cat.get('r', [])],
            'competencies': cat.get('co', []),
            'slug': cat.get('u', ''),
        }
        for mid in ids:
            m = modules.setdefault(mid, {'id': mid, 'safe_folder': safe_module_folder(mid), 'occurrences': 0, 'lessons': []})
            m['occurrences'] += 1
            if not any(l['lesson_id'] == lesson_id for l in m['lessons']):
                m['lessons'].append(entry)

    ordered = sorted(modules.values(), key=lambda m: m['id'].lower())
    for m in ordered:
        m['lessons'].sort(key=lambda l: int(l['lesson_id']) if l['lesson_id'].isdigit() else l['lesson_id'])

    folders = {}
    for m in ordered:
        folders.setdefault(m['safe_folder'], []).append(m['id'])
    collisions = {k: v for k, v in folders.items() if len(v) > 1}
    if collisions:
        print("WARNING: these module ids collide after folder-name sanitising:", collisions)

    inventory = {
        'generated_from': {'data': os.path.basename(args.data), 'catalog': os.path.basename(args.catalog)},
        'module_count': len(ordered),
        'lesson_count': len(lessons_with_modules),
        'modules': ordered,
        'lessons_with_multiple_modules': sorted(multi, key=lambda x: int(x['lesson_id']) if x['lesson_id'].isdigit() else 0),
        'modules_named_like_storyline_output': sorted([m['id'] for m in ordered if m['id'].endswith(' - Storyline output')]),
        'folder_collisions': collisions,
    }

    json_path = args.out + '.json'
    csv_path = args.out + '.csv'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(inventory, f, indent=1, ensure_ascii=False)
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['module_id', 'safe_folder', 'lesson_id', 'lesson_title', 'grades', 'competencies', 'slug'])
        for m in ordered:
            for l in m['lessons']:
                w.writerow([m['id'], m['safe_folder'], l['lesson_id'], l['title'], '; '.join(l['grades']), '; '.join(l['competencies']), l['slug']])

    print("Modules: %d   Lessons using a module: %d   Lessons with 2+ modules: %d" % (
        inventory['module_count'], inventory['lesson_count'], len(multi)))
    print("Wrote %s and %s" % (json_path, csv_path))


if __name__ == '__main__':
    main()
