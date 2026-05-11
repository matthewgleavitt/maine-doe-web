# EnGiNE Homepage & Sidebar Build Session Summary
## Date: 2026-05-06 through 2026-05-07

---

## What Was Built

### 1. EnGiNE Homepage (Moodle Deployment)
Full custom homepage for engine.maine.gov's Moodle LMS (staged at stage.moodle.rrev-engine.com).

**Architecture:**
- **HTML**: MB2 page builder HTML element (v2.7)
- **CSS**: External file on DOE FTP, loaded via `<link>` tag
- **JS**: Moodle Additional HTML (Before BODY is closed)
- **Widget**: Course catalog loaded from `engine.maine.gov/course-widget`

**Key files:**
| File | Location | Purpose |
|------|----------|---------|
| `moodle-launch-html.html` | MB2 builder HTML element | Full body HTML + style overrides |
| `moodle-launch-css.css` | `DRUPAL_BULK/engine/moodle-launch-css.css` | WCAG 2.0 AA compliant CSS, scoped under `.ep` |
| `moodle-launch-js.html` | Moodle Additional HTML > Before BODY | Widget enhancements, counter, link rewriter |
| `engine-homepage-wcag.css` | Reference/Drupal version | WCAG-fixed standalone CSS |

**Homepage uses `position:fixed` approach:**
```css
.ep {
  width: 100vw !important;
  margin-left: 0 !important;
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  z-index: 9999 !important;
  overflow-y: auto !important;
  height: 100vh !important;
}
```
This bypasses all Moodle container/sidebar layout issues. The `100vw` breakout trick (`margin-left: calc(-50vw + 50%)`) did NOT work because the flex layout offset the calculation.

**Theme element hiding (in `<style>` block in HTML):**
```css
body:has(.ep) .top-bar,
body:has(.ep) .master-header-inner,
body:has(.ep) .main-navigation-inner,
body:has(.ep) #toggle-sidebar,
body:has(.ep) .tgsdb_btn,
body:has(.ep) #page-header,
body:has(.ep) .page-secnav,
body:has(.ep) .theme-footer,
body:has(.ep) .page-c,
body:has(.ep) .theme-coursenav,
body:has(.ep) .drawer { display: none !important }
```

### 2. Course Detail Page
Standalone preview page for individual courses, fetches data from widget API.

**Files:**
| File | Location |
|------|----------|
| `engine-course-detail.html` | DOE FTP: `DRUPAL_BULK/enginecoursedata/` |
| `engine-course-detail.js` | DOE FTP: `DRUPAL_BULK/enginecoursedata/` |
| Drupal page | `engine.maine.gov/coursedetails` (CSS via style trick, JS via `<script src>`) |

**Course detail JS also in Moodle Additional HTML**, scoped with `if(document.getElementById('app-root') && !document.querySelector('.ep'))`.

### 3. Sidebar Labels CSS (v1.6)
Always-visible labels on the New Learning theme sidebar.

**Location:** New Learning > Style > Custom CSS (text field, NOT file upload)

**Key techniques:**
- `.sidebar-content { width: 200px; display: flex; flex-direction: column; height: 100%; overflow: hidden }` — parent container
- `.sidebar-menu { flex: 1; overflow-y: auto }` — scrollable menu area
- `.sidebar-footer { flex-shrink: 0; margin-bottom: 50px }` — pinned admin links
- `.tgsdb-quicklinks { display: block; padding-top: 0 }` — breaks flex stretch distribution
- `.tgsdb-links .item-link { flex-direction: row; gap: 10px }` — icon + label side by side
- `.tgsdb-links .text { position: static; opacity: 1 }` — labels always visible
- `.tgsdb-links .text::before { display: none }` — kills tooltip diamond arrows
- `.tgsdbb_toggle { display: none }` — hides blocks panel close bubble
- `.sidebar-tabs-content { position: fixed; left: 200px; top: var(--tgsdb_cheight) }` — blocks panel position
- `body:has(.ep) #toggle-sidebar { display: none }` — hidden on homepage

### 4. EnGiNE Skill File
Comprehensive skill for Claude (392 lines).

**Location:** `/mnt/user-data/outputs/engine-skill/SKILL.md`
**Reference CSS:** `/mnt/user-data/outputs/engine-skill/references/engine-homepage.css`

**Covers:**
- WCAG 2.0 AA accessibility requirements (non-negotiable)
- Platform identity, team (Pit Crew), audience, messaging
- Design system (colors, typography, cards, layout)
- Technical architecture (Drupal + Moodle)
- CSS scoping rules (everything under `.ep`)
- JS scoping rules (`if(document.querySelector('.ep'))`)
- Deployment checklists
- Troubleshooting guide

---

## Critical Technical Lessons

### CSS Scoping (MUST FOLLOW)
- ALL homepage CSS selectors MUST be scoped under `.ep`
- `:root` variables → `.ep { --variable: value; }`
- Media query selectors need `.ep` prefix too
- Double `.ep .ep` bug caused layout breaks — always check after automated scoping

### Moodle Theme Custom CSS File Upload — DANGEROUS
- Uploading a CSS file broke the entire site
- File picker broke and couldn't delete the file
- Recovery: `document.querySelectorAll('.fp-file, .fp-filename-icon').forEach(el => el.remove()); document.getElementById('adminsettings').submit();`
- **ALWAYS use the text field, NEVER the file upload**

### MB2 Builder Strips Tags
- `<script>` tags — stripped on save. Move JS to Additional HTML.
- `<style>` tags — inconsistent. Inline `<style>` in HTML element DOES survive.
- `<link>` tags — survive (use for external CSS/fonts)

### CKEditor (Drupal) Strips Tags
- `<script>` tags — stripped. Use external `<script src>`.
- `<style>` workaround: `<div style="display:none" data-nosnippet><style>...</style></div>`

### Sidebar DOM Structure
```
#toggle-sidebar
  .sidebar-inner
    .sidebar-content
      .sidebar-tabs
        .sidebar-tabs-list (.tgsdb-btn = Blocks button)
        .sidebar-tabs-content (Blocks panel, position:absolute)
      .sidebar-menu
        .tgsdb-quicklinks (main nav links)
      .sidebar-footer
        .tgsdb-admin-links (Theme settings, Site admin)
```

### Tooltip Diamonds
The `.text::before` pseudo-element on sidebar labels is a 45-degree rotated square (`transform: rotate(45deg)`) that serves as the tooltip arrow. When labels are repositioned to `position:static`, this arrow becomes a visible diamond. Fix: `.text::before { display: none !important; }`

---

## WCAG 2.0 AA Fixes Applied
- Muted text: `#94a3b8` (~3.5:1) → `#b8c5d3` (~5.2:1)
- Hero description: `rgba(255,255,255,.75)` → `.85`
- CTA paragraph: `rgba(255,255,255,.75)` → `.85`
- Min font size: 12px (0.75rem) — bumped `.sl`, `.hc-lbl`, `.fb`, `.fc h4`
- Focus indicators: `outline: 3px solid var(--teal); outline-offset: 2px`
- Reduced motion: `@media (prefers-reduced-motion: reduce)` wraps all animations
- Footer links: underline on hover/focus for distinguishability

---

## Pending / Next Steps
- [ ] Dashboard redesign (`/my` page)
- [ ] User onboarding flow / guided tour
- [ ] Staff onboarding (course creation guidance)
- [ ] Move CSS hosting from DOE FTP to Moodle server (ask devs)
- [ ] Course detail page — ask devs to place HTML directly on engine.maine.gov server
- [ ] Asset Injector module install on EnGiNE Drupal
- [ ] Animation updates (reduce confusing hover effects per user feedback)
- [ ] Production deployment (stage → learn.moodle.rrev-engine.com)

---

## Design System Quick Reference

| Token | Value |
|-------|-------|
| Navy (base) | `#0c1926` |
| Navy Mid | `#162d44` |
| Teal (accent) | `#42c3f7` |
| Text Muted (WCAG fixed) | `#b8c5d3` |
| Light card bg | `#f0f4f8` |
| Light card border | `#dce4ed` |
| Font | Plus Jakarta Sans, 300-800 |
| Radius | 16px (cards), 10px (small), 24px (large) |
| Max content width | 1200px |

## Widget Config
```html
<script src="https://engine.maine.gov/course-widget/script"
  data-base="https://engine.maine.gov"
  data-moodle-base="https://learn.moodle.rrev-engine.com"
  data-limit="100"
  data-page-limit="8"
  data-columns="4"
  data-categories="45,25,59,31,35,60,15,58,10,9"
  data-description-length="10000"></script>
```
