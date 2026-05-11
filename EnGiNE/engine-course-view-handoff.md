# EnGiNE Course View — Build Handoff

## Status as of this writing (2026-05-11)

**Course view styling: in design phase.** Dashboard polish complete and deployed to stage. Course view mockup approved by user, now needs:
1. Two more mockup additions (section banner images, certificate terminal node)
2. Implementation against Moodle's actual course-view DOM
3. JS layer for completion/progress data

## Where everything lives

All in `~/Documents/Claude/`:

| File | Purpose |
|---|---|
| `engine-dashboard-css.css` | Current production CSS (dashboard + sidebar + header/footer brand) |
| `engine-dashboard-js.html` | Current production JS (sidebar canonical menu + dashboard hero behavior) |
| `engine-dashboard-html-hero.html` | Hero block contents on /my |
| `engine-dashboard-html-disciplines.html` | Disciplines block contents on /my |
| `engine-dashboard-mockup.html` | Original dashboard visual reference |
| `engine-dashboard-handoff.md` | Prior dashboard handoff (still relevant for sidebar/dashboard context) |
| **`engine-course-mockup.html`** | **NEW — course view design, user approved, awaits two additions** |
| `engine-course-view-handoff.md` | THIS FILE |

## Brand reference (in memory)

See `~/.claude/projects/-Users-mattmini-Documents-Claude/memory/maine_doe_brand_colors.md`:
- **Skill (beige)** `#eee6df` — page bg on /my
- **Navy** `#182b3c` — header band base
- **Navy-mid** `#162d44` — gradient stop
- **Navy-light** `#1e3a56` — gradient end
- **Teal** `#42c3f7` — accent, CTAs, hover tint
- **Mint** `#34d399` — active state, completion done
- **Mint-light** `#6df2c1` — gradient mid-stop

## Course view mockup — what's there now

Standalone HTML at `engine-course-mockup.html`. Open in browser to see.

**Layout components built:**
- **Course hero** — navy gradient, ombre title, course meta, progress card on right, two CTAs
- **Tabs row** — Overview / Lessons / Resources / Discussion / Grades on white pill
- **Section accordion cards** — teal left border, navy gradient header band, numbered badge (mint→teal gradient), expandable bodies
- **Lesson cards** inside sections — icon (with color variants for activity types), title/description/footer, completion UI on right
- **Completion patterns** (current):
  - Manual completion: solid mint "Done" pill button OR outlined "Mark as done" button
  - Auto completion: solid mint "Done" indicator OR dashed gray "To do"
  - Current lesson: teal "Up next" badge stacked above mark-as-done button
- **Activity-type icon variants**: page/lesson (teal-mint gradient), resource/video (amber), forum (purple), quiz (pink), download (compact + amber)

## What's still needed in the mockup (next mission step 1)

1. **Section banner image variant** — production courses (per MBZ sample) embed 1575×300 PNGs in section summaries. Need a section-header variant where the navy gradient band is replaced (or layered) with the banner image. Title overlay treatment TBD — probably gradient scrim like the homepage hero.
2. **Certificate terminal node** — Moodle's `customcert` plugin renders as a final activity. Needs distinct visual: bigger card, gold or mint accent, "Claim certificate" CTA, maybe a certificate-shape icon. Should be visually different from regular lessons.

## Sample course inspected (MBZ)

`backup-moodle2-course-174-mdoemc-ori-20260511-0830.mbz` ("Communications Orientation"):
- 8 sections, 22 activities (19 page, 1 label, 1 forum, 1 customcert)
- Section names ARE populated; section summaries have rich HTML with banner imgs
- Completion is mostly automatic view-based (`completionview=1`) — "Mark as done" buttons rare; "Done" indicator dominates
- No availability restrictions in this course (other courses will have them — design supports)

## Implementation plan (after mockup additions sign-off)

### CSS — map mockup to Moodle selectors

| Mockup element | Moodle selector |
|---|---|
| Section accordion card | `li.section.course-section` |
| Section header band | `h3.sectionname` or `.section-header` (theme-specific) |
| Section summary intro | `.summary` inside section |
| Section banner image | `.summary img.img-fluid` (move to header bg via JS or CSS background-image) |
| Lesson card | `li.activity` (each `modtype_*` variant) |
| Activity icon container | `.activityiconcontainer` (replace with our gradient circle) |
| Activity name | `.instancename` |
| Activity description | `.contentafterlink` or `.activity-description` |
| Completion button (manual) | `button[data-action="toggle-manual-completion"]` |
| Completion indicator (auto) | `.activity-completion` (text content "To do" / "Done") |

### JS additions needed

- **Section banner extraction**: pull `<img>` out of section summary, set as section-header background-image
- **"Up next" detection**: find first incomplete activity, add `.is-current` class
- **Section numbering**: replace Moodle's section number with our computed visible-section index (handles hidden/reordered sections)
- **Activity type → icon class mapping**: convert `modtype_*` → gradient color variant
- **Certificate node detection**: `li.modtype_customcert` → render as terminal certificate card

### Activity types to handle

Confirmed from MBZ + stage course `id=38`:
- `modtype_page` → reading/lesson (most common)
- `modtype_label` → section intro snippet (suppress card chrome, render as text)
- `modtype_forum` → discussion (purple variant)
- `modtype_quiz` → quiz (pink variant)
- `modtype_assign` → assignment (teal variant + upload-icon)
- `modtype_glossary` → reference (teal variant)
- `modtype_customcert` → certificate terminal node (special treatment)
- Probably more in other courses: `modtype_lesson`, `modtype_book`, `modtype_resource`, `modtype_url`, `modtype_h5pactivity`, `modtype_workshop`

### Things to NOT do (lessons from dashboard work)

- Don't apply transforms or `display:flex` to parents that contain fixed-positioned elements (breaks fixed reference frame).
- Don't compress padding/margin on theme's internal elements (e.g., `.sidebar-footer`) without testing — theme has interdependent rules.
- Pre-test selectors with browser MCP `getBoundingClientRect` + computed styles BEFORE writing CSS — theme has higher-specificity rules everywhere.
- When CSS rules don't load, suspect Moodle's SCSS pipeline stripping them. JS inline-style fallback is the escape hatch.

## How to resume in a new session

Open a fresh Claude Code session. First message should be:

> "Continuing EnGiNE course view work. Read `~/Documents/Claude/engine-course-view-handoff.md` first, then `~/Documents/Claude/engine-dashboard-handoff.md` for dashboard context. Brand colors are in memory. Open `engine-course-mockup.html` to see the current design state. Tell me what you understand before I describe the next step."

Memory files will auto-load. Combined with the two handoff docs and the mockup file, the new session has full context.

## Outstanding non-course-view items

- **Default Dashboard config**: admin still needs to add hero + disciplines blocks to the Default Dashboard page so all users inherit them on `/my`. Without this, only the admin account has the styled dashboard.
- **Footer HTML paste**: cleaner 3-column footer HTML provided; user needs to paste into wherever theme footer content is configured.
- **Course-builder auto-importer**: prior conversation attempt, deferred. MBZ is a viable source format for it. Pick up as separate task.

## Conversation context not memorialized

Everything else from this conversation chain is in stage CSS/JS + the dashboard handoff. If something seems important and isn't here, check `engine-dashboard-handoff.md` first.
