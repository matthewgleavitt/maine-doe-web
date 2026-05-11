# EnGiNE Course View — Live Stage DOM Audit

**Captured:** 2026-05-11 from `https://learn.moodle.rrev-engine.com/course/view.php?id=174` (Comms Orientation, prod-equivalent Moodle, logged in as Matt).

This doc is the source of truth for mapping the mockup design to actual Moodle DOM. Update as we discover more.

---

## Containment strategy

- **CSS file upload IS supported** in the New Learning theme Custom CSS area (correcting earlier note in dashboard handoff). We can upload `engine-course-css.css` as a standalone file.
- **JS** still goes in the Additional HTML "Before BODY is closed" textarea (no separate file path).
- **Kill switch:** JS adds `body.engine-course-v1` only on course pages. All course CSS rules scope under that class. Remove one JS line → reverts to stock Moodle without touching dashboard.

---

## Body classes (course landing, view mode)

Course-page-specific body classes Moodle sets:

```
format-topics            ← topics course format (most common; could also be format-weeks)
limitedwidth             ← user pref; not all users
path-course              ← any /course/* page
path-course-view         ← /course/view.php only
pagelayout-course        ← course landing layout
course-174               ← numeric course id (unstable selector)
category-49              ← course category id
noediting                ← edit mode OFF; switches to "editing" when ON
tgsdb tgsdb_open         ← theme sidebar present + open (engine-specific)
issection                ← engine-theme class for any "section view"
coursenav1               ← engine-theme class
```

**Scoping recommendation:** `body.path-course-view.engine-course-v1` for landing list; add `body.format-topics` if we ever need to fork topics-vs-weeks rendering.

---

## Section structure

```
ul.topics  (the section list container, no wrapping ID)
  └── li.section.course-section.main#section-{N}
        └── div.section-item
              ├── div.course-section-header.d-flex                    ← header bar (always visible)
              │     ├── div.bulkselect.align-self-center.d-none       ← visible in edit/bulk mode only
              │     ├── div.d-flex.align-items-center.position-relative
              │     │     └── a[data-toggle="collapse"]               ← collapse/expand chevron
              │     │           ├── span.expanded-icon (Collapse)
              │     │           └── span.collapsed-icon (Expand)
              │     ├── h3.sectionname   (or div.sectionname)          ← title
              │     └── (right-side controls: edit, completion, "Collapse all" on section 0 only)
              └── div.content.course-content-item-content#coursecontentcollapseid{SECTIONID}
                    └── div.my-3
                          ├── div.summarytext                          ← section intro + banner image
                          │     └── div.no-overflow
                          │           └── p > img.img-fluid             ← **THE BANNER**
                          └── (activity list — typically ul.section_modchooser or ul.activity-list — verify)
```

**Important corrections from earlier handoff:**

| Old guess | Actual |
|---|---|
| Banner img in `.summary` | Banner img in `.summarytext` |
| Section header `h3.sectionname` | `div.course-section-header.d-flex` — h3 nested inside |
| Section name selector | Hidden `Select section` SR text precedes the visible name |

**Section data attributes** (for JS hooks):
- `data-for="section_title"` on `.course-section-header`
- `data-id="{sectionid}"` (DB id, not section number)
- `data-number="{sectionnum}"` (0-7 in Comms course)

**Banner facts** (Comms course):
- 7 of 8 sections have banner images (sections 0–6). Section 7 (Congratulations) has text-only summary.
- Section 0 banner dimensions: 1200×400 (not the 1575×300 we expected — older spec)
- Sections 1–6 banners: 1575×300 (matches handoff)
- Banner img location: `li.section .summarytext img.img-fluid` (first img inside summarytext)

**Section name extraction:** strip leading "Select section " (SR text label) before using as title.

---

## Activity structure

```
li.activity.activity-wrapper.modtype_{TYPE}.hasinfo#module-{CMID}
  data-for="cmitem" data-id="{cmid}" data-indexed="true"
  └── div.activity-item.focus-control
        data-region="activity-card" data-activityname="{name}"
        ├── div.bulkselect.d-none                       ← bulk-select checkbox (edit mode)
        ├── div.activity-grid (or div.activity-grid.noname-grid for labels)
        │     ├── div.activity-icon.activityiconcontainer.smaller.content.courseicon  ← icon container
        │     ├── div.activityname > a (href to mod/view.php)                          ← title link
        │     ├── div.activity-description (.contentafterlink)                          ← intro text (NOT for labels)
        │     ├── div.activity-altcontent.text-break                                    ← label body OR
        │     ├── div.activity-completion.align-self-start.ms-sm-2                     ← completion zone
        │     │     └── div[data-region="activity-information"]                         ← contains pill or button
        │     └── div.activity-dates                                                    ← due dates if any
        └── div.activity-tertiary                                                       ← edit menu (edit mode)
```

**Activity type classes confirmed in Comms course:**
- `modtype_page` — pages (most common — 19 in this course)
- `modtype_label` — labels (1 in this course, in section 0)
- `modtype_forum` — forum (1, "Announcements")
- `modtype_customcert` — certificate (1, section 7)

**Selector mapping (mockup → Moodle):**

| Mockup element | Moodle selector | Notes |
|---|---|---|
| `.lesson` | `li.activity.activity-wrapper` | Wrapper |
| `.lesson__icon` (gradient circle) | `.activity-icon.activityiconcontainer` | Currently rendered as Moodle's own icon — we HIDE it via CSS + inject our gradient via JS keyed on `modtype_*` |
| `.lesson__title` | `.activityname > a` | Title link |
| `.lesson__desc` | `.activity-description` (pages/forums) OR `.activity-altcontent` (labels) | Two different DOM paths |
| `.lesson__completion` | `.activity-completion` | Both manual button and auto pill live here |

**Label needs special handling:** `noname-grid` modifier removes the title row, so labels render as text-only. Our mockup renders the welcome label as an inline callout — we'll need to detect `.noname-grid` and apply our `.section-label` callout styling.

---

## Completion DOM (confirmed)

**Wrapper (all modtypes that track completion):**
```
div.activity-completion.align-self-start.ms-sm-2
  └── div[data-region="activity-information"][data-activityname="..."]
        └── div[data-region="completion-info"]
              ├── (manual) → button.btn.btn-success.btn-sm.text-nowrap[data-action="toggle-manual-completion"]
              │                                                        [data-toggletype="manual:undo"|"manual:done"]
              │                                                        [data-cmid="..."] (~"Done" or "Mark as done")
              │
              └── (auto)   → div[data-region="completionrequirements"]
                              └── div.dropdown.completion-dropdown (Bootstrap dropdown)
```

**Per-modtype reality in Comms course:**

| Modtype | Completion mode | DOM | Visual |
|---|---|---|---|
| `page` (cv=1) | Auto (view-based) | Dropdown with completion requirements | Green "Done" pill is dropdown trigger |
| `page` (manual) | Manual | `<button class="btn btn-success btn-sm">` | Green "Done" pill is a real button |
| `label` | Manual | Same button pattern | Same |
| `forum` (completion=0) | None | `.activity-completion` element **missing entirely** | No pill rendered |
| `customcert` | Manual | Same button pattern | Same |

**Key data attributes for JS hooks:**
- `data-cmid` — Moodle CM ID (unique per activity instance)
- `data-toggletype="manual:undo"` = currently completed; `"manual:done"` = not yet completed
- `data-withavailability` — set if availability restrictions apply

**Styling implication:** override `.activity-completion .btn.btn-success` for our mint pill treatment. Bootstrap's `.btn-success` (default green `#28a745`) is what's currently rendered.

---

## Availability info ("Not available unless...")

Confirmed on the customcert section (gated by 16+ activity completions):

```
div.availabilityinfo.isrestricted.isfullinfo
  └── div.showmore-container.collapsed
        ├── button.showmore-button.btn.btn-sm  (toggles full text)
        └── span.collapsed-content / span.full-content  (the text)
```

**Visual baseline:** rendered as a light-blue Bootstrap-info pill with a lock icon. Production already shows: 🔒 "Not available unless: The activity **Meet the Team!** is marked complete..." with a "Show more" toggle.

**Our treatment** should keep the lock icon but restyle to match our card aesthetic — gold-tinted pill with our gold lock icon.

---

## Tertiary nav / breadcrumb

Visible at top: "Home > My courses > Communications Orientation" + right side "Course management" gear + "Turn editing on" pencil.

Selector capture pending — will confirm during edit-mode pass.

---

## Course index drawer

**Not present** on this theme. The check returned `false` for `[data-region="courseindex"]` and `#courseindex`. Moodle's native drawer is suppressed by the EnGiNE theme.

**Implication for activity-view mockup:** the right-rail outline we designed is not replacing anything — it would be a new addition. Either we build it ourselves in JS (rendered from M.cfg.courseinfo or scraped from a hidden source) OR we skip it for v1 and let users use the existing left sidebar's "Sections" menu (which is in the EnGiNE theme sidebar already).

**Recommendation:** v1 skips the outline rail. The left sidebar "Sections" menu already gives navigation; adding a second rail is redundant. Save the outline rail for v1.1 if users request it.

---

## Course landing — current visual reality (screenshots audited)

Looking at the actual production state, **the current rendering is closer to our mockup than expected.** Things that already work:

- Section bars: navy gradient with chevron-toggle on left, section name center, "Collapse all" on right (only on first section in the list)
- Section banners: rendered inline at full width below section bar, in `.summarytext`
- Activity row: small Moodle-icon + activity name + green "Done" pill (already styled by Moodle)
- Activity body: shows the activity's intro field inline — including its own banner image (each page has its OWN 1575×300 banner above the description preview)

Things that need our redesign:
1. **Activity rendering on the landing**: currently each activity has its full intro (banner + description) rendered inline. This is verbose. Our mockup shows compact one-line activity cards. Decision needed: hide intro on landing, OR keep current verbose mode? Recommend: hide intros via CSS to get compact list, banner stays only at section level.
2. **Activity icons**: small Moodle stock icons (12-16px) — replace with our gradient circles.
3. **Section bar**: currently teal/cyan chevron on left + plain navy. Mockup has section number badge + banner overlay scrim. Big restyle.
4. **Section banner placement**: currently below section bar with intro paragraph. We want it AS the section bar background. Need JS to move it.
5. **Done pill**: currently `.btn.btn-success` (Bootstrap default green). Need to restyle to mint.
6. **Cert terminal node**: section 7 currently looks like every other section. Need JS detection + full visual swap.

---

## Edit mode

**Body class:** `editing` replaces `noediting`. Scope all edit-mode CSS overrides under `body.editing.engine-course-v1` if needed.

**Per-activity additions in edit mode:**
- Classes added to `li.activity`: `.draggable.dropready`
- New kebab dropdown: `.action-menu.moodle-actionmenu.section-cm-edit-actions.commands`
- `.bulkselect` becomes visible (no longer `.d-none`)
- Inline edit pencil for activity name: `.inplaceeditable` / `.quickeditlink`

**Per-section additions:**
- Inline edit pencil on section name (`.inplaceeditable`)
- Section kebab: `.section_action_menu`
- "Add an activity or resource" button: `.add-modchooser` / `[data-action="open-chooser"]`

**Page-level additions:**
- "Bulk actions" pencil top-right
- `#block-region-side-pre` blocks panel slides open (4 admin blocks: Course completion status, Administration, Quickmail, etc.)

**Critical preservation rules for our CSS:**

| Element | Selector | Rule |
|---|---|---|
| Activity edit kebab | `.action-menu.section-cm-edit-actions` | NEVER hide; ensure it remains clickable above our card |
| Section edit kebab | `.section_action_menu` | NEVER hide |
| Inline rename pencil | `.inplaceeditable .quickeditlink` | NEVER hide; should sit next to title in our restyled header |
| Add activity button | `.add-modchooser` | NEVER hide; style consistent with our design |
| Bulk select checkbox | `.bulkselect` (only `.d-none` removed in edit mode) | Don't override its hide-when-`.d-none` |
| Drag handles | (none separate — whole `li.activity.draggable` is the handle) | Don't break draggable transform-origin |

**Implementation tip:** scope our visual changes to elements that don't conflict with edit-mode UI. Inject our gradient icon BEFORE Moodle's `.activityiconcontainer` (which we hide) — the kebab and other edit chrome sit OUTSIDE `.activity-grid` so they're safe.

---

## Activity views per modtype

### Page view (audited — Meet the Team!)

**URL:** `/mod/page/view.php?id={cmid}`

**Body classes (mod page):**
```
path-mod
path-mod-page
pagelayout-incourse
cmid-2659           ← unstable (numeric cmid)
```

**Scoping recommendation for activity views:** `body.path-mod.engine-course-v1` for all activities, narrow further with `.path-mod-page`, `.path-mod-forum`, etc. as needed.

**Page-level chrome (top to bottom):**
1. **Course header block** (EnGiNE theme): "← COURSE" back link, course title as hero, right-side Course management/Turn editing buttons
2. **Breadcrumb:** `.breadcrumb > nav > ol.breadcrumb > li.breadcrumb-item` × 5 (Dashboard › My courses › Comms › Section name › Activity name)
   - Note `data-section-name-for="{sectionid}"` on the section breadcrumb item — JS hook for "back to section" navigation
3. **Secondary navigation tabs:** `.secondary-navigation` with pills (Page | Settings | More)
4. **Activity header:** `.activity-header.d-flex.justify-content-between.align-items-center`
5. **Activity title:** `<h1>` or `.activity-title` — "Meet the Team!"
6. **Completion info pill at top:** `div[data-region="activity-information"][data-activityname="..."]` — shows "✓ Done: View" or "Mark as done" button
7. **Activity body content** (mod-specific — page renders the `content` field as HTML)
8. **Last modified timestamp** at bottom
9. **Activity navigation:** `.activity_navigation` (Previous/Next buttons)

**Mockup-to-Moodle mapping for activity view:**

| Mockup element | Moodle reality | Approach |
|---|---|---|
| Compact breadcrumb at top | Already there as `.breadcrumb` | Restyle for compactness |
| "Back to course" link | Already there as "← COURSE" link above breadcrumb | Restyle |
| Activity title + meta | `<h1>` + `.activity-header` | Add type/time badges via JS based on modtype |
| Top completion strip | `[data-region="activity-information"]` already at top | Restyle as our gradient strip |
| Activity body | Already rendered | Style child elements (img, table, headings) via `body.path-mod.engine-course-v1 #region-main` scope |
| Mark as done button | `.btn.btn-success` within `.activity-completion` | Restyle (same as landing) |
| Activity nav (prev/next) | `.activity_navigation` already there | Restyle as our card-pair |
| Sticky outline rail | **Not present** — no course index drawer | Skip for v1 (left sidebar already has section nav) |

**Existing visual baseline:** the page activity view is already pretty clean — "Page | Settings | More" tab pills, breadcrumb, title, then content. The redesign is cosmetic (typography, button styling, spacing), not structural.

### Forum view (TO CAPTURE)

Pending v1.1.

### Customcert view (TO CAPTURE)

Pending v1.1.

---

## Activity modtype catalog (audited across 2 courses)

Audited courses: id=174 (Comms Orientation), id=205 (School Nurse Information Portal).

### Confirmed modtypes seen in the wild

| Modtype | DOM grid | Has description? | Has completion? | Notes |
|---|---|---|---|---|
| `page` | `activity-grid` | yes | yes/no varies | Most common — pages with intro+content |
| `label` | `activity-grid noname-grid` | no | yes/no | No title shown; content is in `.activity-altcontent` |
| `forum` | `activity-grid` | yes | rarely | Description is forum intro text |
| `customcert` | `activity-grid` | yes | yes | Looks like normal activity on landing — JS must detect to apply cert treatment |
| `feedback` | `activity-grid` | yes | no | Surveys — likely needs gold/teal "form" icon |
| `subsection` | `activity-grid noname-grid` | yes | no | **Special: contains nested activities + own `ul.topics`.** Renders as embedded mini-section. |
| `url` | `activity-grid` | yes | no | External links |
| `folder` | `activity-grid noname-grid` | no | no | File tree rendered inline with Download folder button |
| `jitsi` | `activity-grid` | yes | no | Video conferencing |
| `h5pactivity` | `activity-grid` | no | no | Interactive content |
| `book` | `activity-grid` | no | no | Multi-page reading content |

### Common DOM contract (verified)

ALL modtypes use:
- `li.activity.activity-wrapper.modtype_{type}#module-{cmid}`
- `div.activity-item.focus-control[data-region="activity-card"]`
- `div.activity-grid` (or `activity-grid noname-grid` for label/folder/subsection)
- `div.activity-icon.activityiconcontainer` containing `<img class="activityicon">` whose src is `<themedir>/monologo` (standardized mod icon)
- `div.activityname` with anchor (except when `noname-grid`)
- `div.activity-description.contentafterlink` for intro (when configured)
- `div.activity-altcontent.text-break` for the body content (always present, may be empty)
- `div.activity-completion` (only present when completion tracking is enabled)

### Modtype → icon mapping (for our CSS gradient circles)

Recommended gradient + Remix icon mapping. JS reads `modtype_*` class and applies the matching class to a `.engine-icon` element we inject:

| Modtype | Gradient | Remix icon | Class |
|---|---|---|---|
| `page` | teal→mint (default) | `ri-book-open-line` | `.engine-icon` |
| `label` | navy→teal | (none — rendered as callout, not icon) | — |
| `forum` | purple gradient | `ri-discuss-line` | `.engine-icon--forum` |
| `customcert` | gold gradient | `ri-award-fill` | (replaces card entirely) |
| `feedback` | indigo gradient | `ri-survey-line` | `.engine-icon--feedback` |
| `subsection` | (none — rendered as inset mini-section) | — | — |
| `url` | teal gradient | `ri-external-link-line` | `.engine-icon--url` |
| `folder` | amber gradient | `ri-folder-line` | `.engine-icon--folder` |
| `jitsi` | pink/red gradient | `ri-vidicon-line` | `.engine-icon--video` |
| `h5pactivity` | rose gradient | `ri-cursor-line` | `.engine-icon--interactive` |
| `book` | navy/slate gradient | `ri-book-2-line` | `.engine-icon--book` |
| `quiz` (not yet audited) | pink gradient | `ri-questionnaire-line` | `.engine-icon--quiz` |
| `assign` (not yet audited) | teal gradient | `ri-file-upload-line` | `.engine-icon--assign` |
| `lesson` (not yet audited) | teal gradient | `ri-roadmap-line` | `.engine-icon--lesson` |
| `glossary` (not yet audited) | mint gradient | `ri-book-marked-line` | `.engine-icon--glossary` |
| `choice` (not yet audited) | indigo gradient | `ri-checkbox-multiple-line` | `.engine-icon--choice` |
| `workshop` (not yet audited) | rose gradient | `ri-team-line` | `.engine-icon--workshop` |
| `resource` (not yet audited) | amber gradient | `ri-file-text-line` | `.engine-icon--file` |

### Subsection — special handling

Subsections are nested sections inside a section. Their DOM contains:
- `.noname-grid` (no top-level title)
- A nested `ul.topics` or similar with `li.activity` children
- `.activity-altcontent` holds the rendered subsection content (large — 35KB+ in our sample)

**Design treatment:** render as an inset card with a left border accent + slightly recessed background. Children render as our standard lesson cards.

### Folder — special handling

Folder activity renders the file tree INLINE on the landing page — up to 20+ files listed with PDF icons. That's a lot of visual real estate. 

**Design options:**
- A: Restyle the file tree to match our card aesthetic (matching fonts, hover, etc.)
- B: Collapse it by default; show "X files" count + expand button
- C: Leave it as-is and just style the wrapper

**Recommendation:** Option A for v1 — minimal change, just consistent typography and hover styling. Defer the collapse pattern (Option B) until users say it's too noisy.

---

## Updated mockup-to-Moodle action items

1. **Section banner JS**: `qsa('li.section .summarytext img.img-fluid')` → extract first img per section, set as `background-image` on a wrapper div around the section header, hide the original `.summarytext` paragraph on landing only.
2. **Activity icon JS**: For each `li.activity`, read `modtype_*` class, inject `.engine-icon.engine-icon--{variant}` next to (and replacing visually) Moodle's `.activityiconcontainer`.
3. **Label detection**: `li.modtype_label` → apply `.engine-label-callout` styling (callout, not card). Distinct from folder/subsection which also use `noname-grid`.
4. **Customcert detection**: `li.modtype_customcert` is the trigger; the parent `li.section` should get `.engine-section--cert` so CSS swaps to terminal cert visual.
5. **Subsection detection**: `li.modtype_subsection` → apply `.engine-subsection` styling (inset card with border-left accent).
6. **Task page detection**: regex `/^Task:?\s/i` on `.activityname` text → add `.engine-task` to `li.activity`.
7. **First-incomplete detection**: find first `li.activity` that has `.activity-completion` but NOT `.btn-success` text "Done" → add `.engine-current`.
8. **Hide activity intros on landing only**: CSS `body.path-course-view.engine-course-v1 .activity-description, .activity-altcontent { display: none }` — but EXCEPT for label, subsection, folder where altcontent IS the content.

---

## Quiz/assign coverage (TO CAPTURE)

Pending — a second course with these modtypes.

---

## Mobile (TO CAPTURE)

Pending.

---

## Mockup-to-Moodle action items (so far)

1. **Section banner JS**: `qsa('li.section .summarytext > div.no-overflow > p > img.img-fluid')` → extract first img per section, set as `background-image` on the parent `.course-section-header`, then hide the original `.summarytext` (or just hide the img).
2. **Section name JS**: strip "Select section " SR prefix from section title text.
3. **Activity icon JS**: for each `li.activity`, read `modtype_*` class, inject `.lesson__icon` with our gradient classes, hide `.activityiconcontainer`.
4. **Label detection**: `li.modtype_label` (or `.noname-grid` inside) → apply `.section-label` callout styling instead of normal lesson card.
5. **Customcert detection**: `li.modtype_customcert` is the trigger; the parent `li.section` (section 7 in Comms) should get a section-level class so CSS swaps to terminal cert visual.
6. **Course id stability**: `body.course-174` is unstable — never selector on it.
