#!/usr/bin/env python3
"""
SEL4ME Batch Lesson Converter
==============================
Converts ALL lesson HTML files into standalone interactive lessons.

Setup:
  Place this script in your sel4me-preview folder alongside:
    - sel4me_converter.py
    - SEL4ME_all_lesson_data.json
    - sel4me_full_catalog.json
    - SEL4ME_all_answer_keys.json
    - A folder containing all lesson HTML files (from batches 1-10)

Usage:
  python batch_convert.py --lessons "path/to/lesson/htmls" --output "lessons"

  Example:
  python batch_convert.py --lessons "batch_htmls" --output "lessons"

This will create a 'lessons/' folder with all 499 converted lesson HTML files.
The library page (sel4me_library.html) links to these files.
"""

import os
import sys
import time
import argparse
import importlib.util

def main():
    parser = argparse.ArgumentParser(description='SEL4ME Batch Lesson Converter')
    parser.add_argument('--lessons', required=True, help='Folder containing lesson HTML files')
    parser.add_argument('--data', default='SEL4ME_all_lesson_data.json', help='Path to lesson data JSON')
    parser.add_argument('--catalog', default='sel4me_full_catalog.json', help='Path to catalog JSON')
    parser.add_argument('--answers', default='SEL4ME_all_answer_keys.json', help='Path to answer keys JSON')
    parser.add_argument('--output', default='lessons', help='Output folder for converted lessons')
    parser.add_argument('--converter', default='sel4me_converter.py', help='Path to converter script')
    parser.add_argument('--modules-dir', default=None, help='Folder of mirrored Storyline modules (default: <output>/modules if it exists)')
    parser.add_argument('--modules-url', default=None, help='Public URL prefix of the modules folder (iframe src instead of a relative path)')
    args = parser.parse_args()

    # Verify all required files exist
    missing = []
    for f, label in [
        (args.converter, 'Converter script'),
        (args.data, 'Lesson data JSON'),
        (args.catalog, 'Catalog JSON'),
        (args.answers, 'Answer keys JSON'),
        (args.lessons, 'Lessons folder'),
    ]:
        if not os.path.exists(f):
            missing.append(f'{label}: {f}')
    
    if missing:
        print('ERROR: Missing required files:')
        for m in missing:
            print(f'  - {m}')
        sys.exit(1)

    # Import the converter module dynamically
    spec = importlib.util.spec_from_file_location('converter', args.converter)
    converter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(converter)

    # Load shared data files once
    import json
    print('Loading data files...')
    with open(args.data, 'r') as f:
        all_data = json.load(f)
    with open(args.catalog, 'r') as f:
        catalog = json.load(f)
    
    answer_keys = None
    if os.path.exists(args.answers):
        with open(args.answers, 'r') as f:
            ak_data = json.load(f)
            answer_keys = ak_data.get('answer_keys', {})
        print(f'  Answer keys loaded for {len(answer_keys)} lessons')
    
    print(f'  Lesson data: {len(all_data)} lessons')
    print(f'  Catalog: {len(catalog)} entries')
    print()

    # Find all lesson HTML files
    lesson_files = sorted([
        f for f in os.listdir(args.lessons) 
        if f.endswith('.html')
    ])
    
    print(f'Found {len(lesson_files)} lesson HTML files in {args.lessons}/')
    print(f'Output: {args.output}/')
    print()

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Mirrored Storyline modules (see mirror_storyline.py) get embedded in place of the placeholder
    modules_dir = args.modules_dir
    if modules_dir is None and os.path.isdir(os.path.join(args.output, 'modules')):
        modules_dir = os.path.join(args.output, 'modules')
    if modules_dir:
        print(f'Storyline modules folder: {modules_dir}')

    # Convert each lesson
    start_time = time.time()
    converted = 0
    failed = 0
    skipped = 0
    errors = []

    for i, fname in enumerate(lesson_files):
        lesson_path = os.path.join(args.lessons, fname)
        
        try:
            result = converter.convert_lesson(
                lesson_path, 
                all_data, 
                catalog, 
                args.output, 
                answer_keys,
                modules_dir=modules_dir,
                modules_url=args.modules_url
            )
            if result:
                converted += 1
            else:
                skipped += 1
                print(f'  SKIPPED: {fname} (no pages found)')
        except Exception as e:
            failed += 1
            errors.append((fname, str(e)))
            print(f'  FAILED: {fname} — {e}')
        
        # Progress every 25 lessons
        if (i + 1) % 25 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = (len(lesson_files) - i - 1) / rate
            print(f'  Progress: {i+1}/{len(lesson_files)} ({converted} converted, {failed} failed) — ~{remaining:.0f}s remaining')

    elapsed = time.time() - start_time

    print()
    print('=' * 50)
    print(f'BATCH CONVERSION COMPLETE')
    print(f'  Total files: {len(lesson_files)}')
    print(f'  Converted: {converted}')
    print(f'  Skipped: {skipped}')
    print(f'  Failed: {failed}')
    print(f'  Time: {elapsed:.1f} seconds')
    print(f'  Output: {os.path.abspath(args.output)}/')
    print('=' * 50)

    if errors:
        print()
        print('ERRORS:')
        for fname, err in errors:
            print(f'  {fname}: {err}')
        
        # Write error log
        with open('batch_convert_errors.txt', 'w') as f:
            for fname, err in errors:
                f.write(f'{fname}: {err}\n')
        print(f'\nError log saved to batch_convert_errors.txt')


if __name__ == '__main__':
    main()
