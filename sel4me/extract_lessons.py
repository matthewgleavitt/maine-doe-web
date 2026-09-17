import zipfile, os, sys

zips_folder = sys.argv[1] if len(sys.argv) > 1 else "."
output = "batch_htmls"
os.makedirs(output, exist_ok=True)

count = 0
for f in sorted(os.listdir(zips_folder)):
    if f.endswith('.zip'):
        path = os.path.join(zips_folder, f)
        with zipfile.ZipFile(path, 'r') as z:
            for name in z.namelist():
                if name.endswith('.html'):
                    z.extract(name, output)
                    count += 1
        print(f"Extracted: {f}")

# Flatten - move files from subfolders to batch_htmls root
for root, dirs, files in os.walk(output):
    for name in files:
        if name.endswith('.html') and root != output:
            src = os.path.join(root, name)
            dst = os.path.join(output, name)
            os.rename(src, dst)

print(f"\nDone: {count} lesson HTMLs in {output}/")
