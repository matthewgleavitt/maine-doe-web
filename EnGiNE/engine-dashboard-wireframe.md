# EnGiNE Dashboard Redesign — v1 Wireframe

**Target:** Moodle `/my` Dashboard at stage.moodle.rrev-engine.com (then production)
**Scope:** Singular dashboard for all roles in v1 (educator/admin/teacher all see same)
**Approach:** One Custom HTML block in `#block-region-content` + scoped CSS in theme settings + restyled native Moodle blocks

---

## Wrapper class

Everything in the new HTML block lives under `<div class="ep-dash">…</div>`.
All CSS in theme settings is scoped under `body.path-my .ep-dash` (and `body.path-my` for the native blocks below).
This guarantees nothing leaks to course pages, admin pages, or other layouts.

---

## Section 1 — Hero

**Visual:** Dark navy gradient card (echoes homepage hero), full content-width, rounded 24px, teal accent line. The only dark element on the page — anchors the design. Subtle teal glow on border. Responsive: stacks on mobile.

**Layout (desktop):**
```
┌─────────────────────────────────────────────────────────┐
│  ╲ DASHBOARD              (teal section label)           │
│                                                            │
│  Good morning, Matt                                       │
│  ────────────────                                         │
│  Maine's Professional Learning Ecosystem                  │
│  for Educators & School Staff                             │
│                                                            │
│  [ Browse All Courses ]  [ EnGiNE Homepage ]             │
│                                                            │
└─────────────────────────────────────────────────────────┘
```

**Content rules:**
- `Good morning,` / `Good afternoon,` / `Good evening,` — JS time-of-day greeting
- First name pulled from page DOM (avatar menu / Moodle config) — no API call needed
- Tagline copy is a direct echo of the homepage hero subtitle
- Primary CTA: `Browse All Courses` → `learn.moodle.rrev-engine.com/course/index.php`
- Secondary CTA: `EnGiNE Homepage` → `https://engine.maine.gov/`

**Style notes:**
- Background: `linear-gradient(135deg, #0c1926 0%, #162d44 100%)`
- Section label: teal `#42c3f7`, 0.7rem, uppercase, letter-spacing 0.15em, with leading 20px teal line (matches homepage)
- Heading: Plus Jakarta Sans 800, 2.5rem desktop / 1.75rem mobile, white, letter-spacing -0.03em
- Tagline: `rgba(255,255,255,0.85)` — WCAG-fixed value
- Primary CTA: teal `#42c3f7` background, navy text, hover lifts 2px + teal glow
- Secondary CTA: transparent, 2px white border, hover fills white at 0.1 alpha
- Reduced-motion: animations disabled

**Personalization fallback:**
- If first name not available: fall back to `Welcome to EnGiNE`
- If time-of-day fails: fall back to `Welcome back,` greeting

---

## Section 2 — Discover by Discipline

**Visual:** Section label + 5×2 grid of light cards (homepage's Option C card style). Tiles are uniform-height. Each tile = icon + category title + course count badge.

**Layout (desktop, 5 across):**
```
┌─ EXPLORE BY DISCIPLINE ─────────────────────────────────┐

  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │  🎓  │ │  🩺  │ │  💻  │ │  🌐  │ │  🍎  │
  │Educa │ │School│ │Tech &│ │Inter │ │Child │
  │tor   │ │Health│ │Learn │ │discip│ │Nutri │
  │Suppt │ │      │ │ing   │ │      │ │tion  │
  │  35  │ │   8  │ │  12  │ │   6  │ │   4  │
  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘

  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │  🪶  │ │  🛡  │ │  🌲  │ │  ♿  │ │  💡  │
  │Wabana│ │School│ │Outdoo│ │Spec &│ │Innov │
  │ki Stu│ │Safety│ │r Ed  │ │Inclu │ │ &    │
  │dies  │ │      │ │      │ │ Ed   │ │Resrch│
  │   3  │ │   5  │ │  10  │ │   7  │ │   4  │
  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘

```

**Responsive collapse:**
- ≥1100px: 5 columns
- 768–1099px: 3 columns (last row has fewer)
- <768px: 2 columns

**Content:**
- 10 tiles, all 10 categories from homepage curated set (locked above)
- Course-count badge uses live data from existing course-widget API call (we already proved we can fetch it from the dashboard JS context)
- Each tile is a link to `learn.moodle.rrev-engine.com/course/index.php?categoryid={id}`

**Style notes:**
- Card: `#fff` background, `1px solid #dce4ed`, **`4px solid #42c3f7`** left accent, 10px right radius (flat left, rounded right — matches homepage Option C)
- Padding: 24px
- Title: navy `#162d44`, weight 700, 1.05rem, line-height 1.3
- Count: slate `#475569`, 0.85rem, weight 500, e.g., "12 courses"
- Icon: 32px, colored `#42c3f7` with `2px solid #162d44` ring (matches homepage Option C)
- Hover: lift 2px, shadow `0 8px 24px rgba(0,0,0,0.12)`, teal accent grows to 6px
- Focus ring: `3px solid #42c3f7` outline, 2px offset
- Reduced-motion: hover translate disabled

**Icon choices (proposal):**
- Educator Supports → `🎓` or graduation cap SVG
- School Health → cross / plus medical
- Technology and Learning → laptop or chip
- Interdisciplinary Instruction → connection nodes
- Child Nutrition → apple / leaf
- Wabanaki Studies → feather (consult with Brianne Lolar — culturally appropriate icon choice should not be unilateral)
- School Safety → shield
- Outdoor Education → tree / mountain
- Special and Inclusive Education → universal access
- Innovation and Research → lightbulb / spark

> ⚠️ **Wabanaki Studies icon:** I'm flagging this for consultation with Brianne. A feather has cultural significance — I'm not the right person to pick this unilaterally. Options: ask Brianne for her preference, or use a neutral abstract symbol. Don't ship without her input.

---

## Section 3 — Native Moodle Blocks (restyled, kept in place)

These already exist in `#block-region-content`. We don't add or remove — we restyle via the `body.path-my` scope so they harmonize with sections 1–2 above.

### 3a. Course Overview block (`block_courseoverview` / `block_myoverview`)

Currently shows: filter tabs, search, sort dropdown, then course cards in grid/list.

Style changes:
- Block heading restyled to match section labels: teal accent line + uppercase tracked label
- Filter tabs: teal underline on active, navy text
- Course cards: white surface, `#dce4ed` border, 16:9 thumbnail (via existing padding-top trick), navy heading, slate body, teal "Enter this course" button
- Card hover: 2px lift, teal accent shadow

### 3b. Recently Accessed Courses (`block_recentlyaccessedcourses`)

Currently empty for Matt on stage; in production shows 4 cards.

Style changes:
- Same card treatment as Course Overview
- Empty state: replace generic "No recent courses" with friendlier copy + CTA: *"Nothing recent — start with [Browse All Courses]"*

### 3c. Latest Announcements (`block_news_items`)

Currently above-the-fold on stage. **Demote to bottom** by adjusting the layout/order via CSS `order:` on the block-region-content's grid children, OR by ordering blocks via Turn editing on → drag.

Style changes:
- White card, light border, teal accent line on the heading
- Posts: smaller, with avatar + name + date + headline
- "Older topics…" link styled as button-link

### Stage cleanup (separate task)
The two duplicate `block_news_items` blocks in `#block-region-side-pre` (`inst749`, `inst750`) on stage should be removed via Turn editing on → block actions → Delete. Stage data artifact, not blocking.

---

## Footer (existing — unchanged)

Already styled per the homepage. Inherits from theme. No work needed.

---

## What gets pasted where

| Asset | Destination | Notes |
|---|---|---|
| HTML for `.ep-dash` (sections 1 + 2) | A new **Custom HTML block** in `#block-region-content`, dragged to top | Turn editing on → Add a block → Text/HTML |
| CSS | Site Admin → Appearance → Themes → New Learning → Style → Custom CSS **(text field, NEVER file upload)** | Purge caches after |
| JS (greeting, tile counts, link-rewriter not needed here) | Site Admin → Appearance → Additional HTML → Before BODY is closed | Wrapped in `if (document.querySelector('body.path-my .ep-dash')) {…}` |

---

## Open questions before build

1. **Wabanaki Studies icon** — defer to Brianne, or use a placeholder (e.g., "circle" / "star") for v1 launch with note to update?
2. **Tile links — Moodle (`/course/index.php?categoryid=X`) confirmed?** Or do you have a Drupal landing per category that's better?
3. **Time-of-day greeting** — is the casual "Good morning, Matt" tone right for educators/admins? Some govt platforms keep it formal ("Welcome, Matthew Leavitt"). I assumed warm based on your homepage tone.
4. **First-name source** — pull from the Moodle user menu DOM, or call `M.cfg.user` at page load? Both work; DOM is simpler.

---

## What's *not* in v1 (parking lot)

These are good ideas, just out of scope for first ship:
- Live stats tiles (badges, contact hours, courses-in-progress count with progress bars)
- Onboarding interactive tour — use Moodle's built-in **User Tours** feature (Site Admin → Appearance → User tours) when ready
- Role-specific dashboards (educator vs admin vs teacher) — body classes are already there; we just add another scope `body.roleshortname-X .ep-dash` when we're ready to differentiate
- New-user empty-state hero variant
- Course progress integration in the Recently Accessed cards
- Replacing the duplicate announcement blocks in side-pre (manual cleanup needed via Turn editing on)
- Cleaning up the "themedesignermode" body class (means designer mode is on in stage — fine for dev, should be off in prod)
