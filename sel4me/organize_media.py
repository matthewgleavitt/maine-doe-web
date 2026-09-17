#!/usr/bin/env python3
"""
SEL4ME Media Organizer
Put ALL your downloaded zips in one folder, run this script,
and it creates the organized asset structure.

Usage:
    python organize_media.py --zips "C:/Users/Matt/Downloads" --output "C:/Users/Matt/Desktop/sel4me"

It will find all SEL4ME zip files, extract them, and organize into:
    sel4me/
    └── assets/
        ├── images/
        ├── thumbnails/
        ├── video-posters/
        ├── captions/
        └── pdfs/
"""

import os, sys, zipfile, glob, shutil, argparse

def organize(zips_folder, output_folder):
    assets_dir = os.path.join(output_folder, 'assets')
    
    # Create folders
    for sub in ['images', 'thumbnails', 'video-posters', 'captions', 'pdfs']:
        os.makedirs(os.path.join(assets_dir, sub), exist_ok=True)
    
    # Also create a flat assets/ folder for the converter's simple references
    os.makedirs(os.path.join(assets_dir, 'all'), exist_ok=True)
    
    # Find all SEL4ME zip files
    patterns = ['SEL4ME_media_batch_*.zip', 'SEL4ME_Lessons_batch_*.zip', 
                'SEL4ME_quiz_assets_batch_*.zip']
    
    all_zips = []
    for pattern in patterns:
        all_zips.extend(glob.glob(os.path.join(zips_folder, pattern)))
    
    if not all_zips:
        # Try finding ANY zip with SEL4ME in the name
        all_zips = glob.glob(os.path.join(zips_folder, '*SEL4ME*.zip'))
    
    if not all_zips:
        print(f"No SEL4ME zip files found in {zips_folder}")
        print(f"Looking for files matching: SEL4ME_*.zip")
        return
    
    print(f"Found {len(all_zips)} zip files to process\n")
    
    total_extracted = 0
    
    for zpath in sorted(all_zips):
        zname = os.path.basename(zpath)
        print(f"Processing: {zname}")
        
        try:
            with zipfile.ZipFile(zpath, 'r') as z:
                count = 0
                for member in z.namelist():
                    if member.endswith('/'):
                        continue
                    
                    fname = os.path.basename(member)
                    if not fname:
                        continue
                    
                    # Determine destination based on file type and source folder
                    ext = fname.lower().rsplit('.', 1)[-1] if '.' in fname else ''
                    parent_folder = os.path.dirname(member).lower()
                    
                    if ext in ('png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'):
                        if 'thumbnail' in parent_folder:
                            dest_sub = 'thumbnails'
                        elif 'poster' in parent_folder or 'video' in parent_folder:
                            dest_sub = 'video-posters'
                        else:
                            dest_sub = 'images'
                    elif ext == 'pdf':
                        dest_sub = 'pdfs'
                    elif ext == 'vtt':
                        dest_sub = 'captions'
                    elif ext == 'json':
                        # Data files go to output root
                        dest_path = os.path.join(output_folder, 'data', fname)
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        with z.open(member) as src, open(dest_path, 'wb') as dst:
                            dst.write(src.read())
                        count += 1
                        continue
                    elif ext == 'html' and 'lessons/' in member:
                        # Lesson HTML files
                        dest_path = os.path.join(output_folder, 'lessons-raw', fname)
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        with z.open(member) as src, open(dest_path, 'wb') as dst:
                            dst.write(src.read())
                        count += 1
                        continue
                    else:
                        continue
                    
                    # Extract to categorized folder
                    dest_path = os.path.join(assets_dir, dest_sub, fname)
                    with z.open(member) as src, open(dest_path, 'wb') as dst:
                        dst.write(src.read())
                    
                    # Also copy to flat 'all' folder (what the converter references)
                    flat_path = os.path.join(assets_dir, 'all', fname)
                    if not os.path.exists(flat_path):
                        shutil.copy2(dest_path, flat_path)
                    
                    count += 1
                
                print(f"  Extracted: {count} files")
                total_extracted += count
                
        except zipfile.BadZipFile:
            print(f"  WARNING: Bad zip file, skipping")
        except Exception as e:
            print(f"  ERROR: {e}")
    
    # Summary
    print(f"\n{'='*50}")
    print(f"DONE! {total_extracted} files extracted total\n")
    
    for sub in ['images', 'thumbnails', 'video-posters', 'captions', 'pdfs']:
        path = os.path.join(assets_dir, sub)
        count = len(os.listdir(path)) if os.path.exists(path) else 0
        print(f"  {sub}: {count} files")
    
    flat = os.path.join(assets_dir, 'all')
    print(f"  all (flat): {len(os.listdir(flat))} files")
    
    print(f"\nTo preview a lesson with images:")
    print(f"  1. Copy a converted HTML file into: {output_folder}")
    print(f"  2. Rename '{os.path.join('assets', 'all')}' to 'assets'")
    print(f"     (or create a symlink/shortcut)")
    print(f"  3. Open the HTML file in your browser")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SEL4ME Media Organizer')
    parser.add_argument('--zips', required=True, help='Folder containing all SEL4ME zip files (e.g., Downloads)')
    parser.add_argument('--output', required=True, help='Output folder for organized structure')
    args = parser.parse_args()
    organize(args.zips, args.output)
