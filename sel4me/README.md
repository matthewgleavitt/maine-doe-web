# SEL4ME lesson reconstruction

Tooling for the SEL4ME lesson library that lives on the Drupal BULK folder at
`/DRUPAL_BULK/sel4me/` (public URL: https://www.maine.gov/doe/sites/maine.gov.doe/files/bulk/sel4me/sel4me_library.html).

The lessons were reconstructed from the Navigate 360 / Suite360 platform
(sel4me.maine.gov) before access ended. Text, quizzes, teacher notes, videos and
captions were captured. One thing was not: **98 Articulate Storyline interactive
modules**, used by 105 of the 499 lessons. Those lessons currently show an
"Interactive Module — no longer available" placeholder.

## What a Storyline module actually is

It looks like a video in the lesson, but it is a small static web app:

```
Good_Sportsmanship_6_2023/
├── story.html                 launcher (this is what the platform iframes)
├── html5/data/js/data.js      course structure; slides referenced by 11-char ids
├── html5/data/js/<id>.js      one file per slide / layer
├── html5/lib/...              player scripts and stylesheets
└── story_content/             images, audio, video, captions
```

Because it is plain files, it can be copied and re-hosted next to the lessons
with no build step. That is what `mirror_storyline.py` does.

## Files

| File | Purpose |
|---|---|
| `sel4me_converter.py` | Turns a captured lesson HTML + the JSON data into a standalone lesson page. Now embeds a mirrored module when its folder exists (`--modules-dir`), otherwise keeps the placeholder. |
| `batch_convert.py` | Runs the converter over a folder of lesson HTMLs. Passes `--modules-dir` / `--modules-url` through. |
| `build_module_inventory.py` | Reads the lesson data and writes `storyline_modules.json` + `.csv`: every module id, which lessons use it, grades, competencies. |
| `storyline_modules.json` / `.csv` | The inventory (98 modules, 105 lessons). |
| `mirror_storyline.py` | Copies published Storyline module folders from a web address into `modules/<safe_folder>/`. Resumable, writes a manifest per module. |
| `tests/` | Local tests. They fabricate fake Storyline folders and serve them from 127.0.0.1; nothing touches the real platform. |
| `extract_lessons.py`, `organize_media.py`, `download_posters.py` | Earlier capture helpers, kept for reference. |
| `data/` | Large JSON exports (gitignored). Download from the public BULK folder: `SEL4ME_all_lesson_data.json`, `sel4me_full_catalog.json`, `SEL4ME_all_answer_keys.json`. |

## Setup

You need Python 3. If `python` says "command not found", use `py` (Windows
launcher) or `python3` (macOS) instead, in every command below. If neither
exists, install it from https://www.python.org/downloads/ (on Windows, tick
"Add python.exe to PATH"). The converter needs one extra package:

```
py -m pip install beautifulsoup4
```

## Workflow

1. **Where the modules live.** The platform's lesson markup links each module
   as `.../public/articulate/<module id>/story.html` on its static CDN; the
   "Expected URL" column in *SEL4ME - Missing Articulate Modules.xlsx* lists
   that address for all 105 lessons. Everything before the module id is the
   template, e.g. `https://cdn-static.suite360sel.org/public/articulate/{id}/`.
   If the folder has moved, open a lesson with a module in the platform, open
   DevTools → Elements, search for `activity_articulate`, and copy the link
   that points at `story.html`.

2. **Confirm the address pattern** (fetches only `story.html`):

   ```
   python mirror_storyline.py --check --template "https://cdn-static.suite360sel.org/public/articulate/{id}/" --module Good_Sportsmanship_6_2023
   ```

3. **Build the inventory** (once):

   ```
   python build_module_inventory.py
   ```

4. **Mirror the modules:**

   ```
   python mirror_storyline.py --template "https://cdn-static.suite360sel.org/public/articulate/{id}/" --modules storyline_modules.json --out modules
   ```

   Re-running skips files already on disk. Check `modules/mirror-report.json`
   for anything marked failed or "html-instead-of-file" (that means the
   address is wrong or the folder needs a login).

5. **Rebuild the lessons** so they embed the modules:

   ```
   python batch_convert.py --lessons batch_htmls --output lessons --modules-dir modules
   ```

   The iframe `src` is a relative path from each lesson file to
   `modules/<safe_folder>/story.html`, so keep `lessons/` and `modules/` side by
   side when uploading. Use `--modules-url https://.../sel4me/modules/` instead
   if the modules end up somewhere else.

6. **Upload** `modules/` to `/DRUPAL_BULK/sel4me/modules/` and the regenerated
   lessons over the existing ones.

## Hosting notes

- Test **one** module on the BULK folder first and open its `story.html`
  directly. Confirm `.js`, `.css`, `.woff`, `.xml` and `.mp4` files inside it are
  served (not blocked or rewritten) before uploading all 98.
- Keep the folder structure exactly as mirrored; Storyline uses relative paths.
- The lesson pages already carry `noindex`; the module `story.html` files do
  not need to be findable on their own.
- Folder names: module id with spaces turned into underscores and any other odd
  character dropped. `safe_module_folder()` implements this identically in the
  converter, the inventory builder and the mirror script. Keep them in sync.

## Licensing

These modules are Navigate 360 content. Confirm with the vendor or the contract
that Maine DOE may keep and re-host them after the subscription ends before
publishing the mirrored folders.
