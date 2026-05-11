# EnGiNE Dashboard — Build Handoff

## Status as of this writing

**v1 is essentially shipped on stage.** Visual design, JS, and core layout all work. Remaining items are polish, not blockers.

**Stage URL:** stage.moodle.rrev-engine.com/my/
**Production status:** NOT yet deployed (intentional — verify on stage first)

## Where everything lives

All files in `~/Documents/Claude/`:

| File | Purpose | Paste target on stage |
|---|---|---|
| `engine-dashboard-css.css` | Production CSS | Theme → New Learning → Style → Custom CSS (text field, NEVER file upload) |
| `engine-dashboard-html-hero.html` | Hero block content (greeting, CTAs, Recently Accessed mini-list) | Custom HTML block #1 in `#block-region-content`, weight `-10` |
| `engine-dashboard-html-disciplines.html` | "Explore EnGiNE Experiences" 10-tile grid | Custom HTML block #2 in `#block-region-content`, weight `-5` |
| `engine-dashboard-js.html` | Time-of-day greeting, first-name pull, Recently Accessed scrape, tile-count refresh, dynamic header-gap (var only — no current CSS uses it) | Site Admin → Appearance → Additional HTML → "Before BODY is closed" |
| `engine-dashboard-mockup.html` | Visual reference (open in browser) | — design source of truth |
| `engine-dashboard-handoff.md` | THIS FILE | — |

## What works (don't break this)

1. **Hero** — Dark navy gradient, "Good [morning/afternoon/evening], [first name]" greeting in blue→green ombre (gradient text), tagline, two filled-teal buttons. Right column shows "Recently Accessed" — JS scrapes Moodle's native `block_recentlyaccessedcourses` and renders into the hero.
2. **Discipline tiles** — 10-tile grid, dark navy bg, gradient icon (FA glyph in teal-to-green square with navy ring), white text, count pill on right. Encapsulated in a white "card" with dark-band header reading "Explore EnGiNE Experiences".
3. **Native blocks (Course Overview, Latest Announcements, Recently Accessed Items)** — White card body with dark navy band header on top. Title large (1.85rem) bold white. Subtle teal grid pattern overlay on the dark band.
4. **Background** — Page bg matches card bg (both white #fff). No more "card vs frame" color shift.
5. **Course title cleanup** — JS uses `.card-img > .sr-only` selector to grab clean course names (was including "Course is starred" indicator before).
6. **Course Overview grid** — `--bs-gutter-x: 16px` override + `padding: 0` on cols → single course doesn't float to middle.
7. **Page width** — `.container-fluid` capped at 1500px max, `#page-content` has `padding-left: 220px` for sidebar clearance on all viewport sizes.
8. **Blocks-panel push** — `body.tgsdbb_open` triggers `transform: translateX(280px)` on `#region-main`. Whole content frame slides right with smooth 0.3s transition. `body.path-my { overflow-x: hidden }` clips the right portion.
9. **All cards rounded all 4 corners** — teal left border hugs the curve cleanly.

## Lessons learned (don't relearn the hard way)

- **TinyMCE strips wrapping `<span>` around SVGs and most SVG attributes** (`viewBox`, `fill`, `stroke`, etc.). Use Font Awesome `<i>` tags instead — they survive. Confirmed working with `fa-graduation-cap`, `fa-heartbeat`, `fa-laptop`, `fa-puzzle-piece`, `fa-apple-alt`, `fa-feather`, `fa-shield-alt`, `fa-tree`, `fa-universal-access`, `fa-lightbulb`.
- **Moodle's Additional HTML pipeline strips/escapes newlines AND HTML entities (`&#39;` → `'`).** That's why our v1 multi-line JS broke parsing (literal `\n` text + `'''` triple-quote bug). v2 JS is a single-line IIFE with no `//` comments and no `&#39;` entity replacement — entity-decoding is harmless because there's nothing left to decode.
- **`themedesignermode` ON stage = every save triggers full theme regen.** Bad CSS can wedge stage for 10–30+ minutes (we saw 504/503s twice). Production should have `themedesignermode` OFF.
- **`clip: rect(0 0 0 0)`** (space-separated) is invalid syntax for the deprecated `clip` property. Use `clip-path: inset(50%)` instead. The space-syntax version is what wedged stage the first time.
- **`tgsdb_open` is an always-on theme flag, NOT a "blocks panel visible" state.** The actual visibility trigger is **`tgsdbb_open`** (with a double "b"). Use `body.tgsdbb_open` for any "panel is open" CSS.
- **DON'T touch `.header-gap`, `.sidebar-footer`, or sidebar height on `/my`.** Every override we tried (dynamic JS-driven height, `100vh`, `margin-bottom: 0`) caused `/my`-only regressions: collapse arrow overlapping menu items, footer items below viewport, white space at the bottom. Matt's existing sidebar v1.6 CSS is self-consistent and works correctly **when our CSS doesn't touch it**. The current production CSS file no longer overrides any sidebar-internal styles.
- **Course Overview's individual course cards have nested `.card-body` elements.** Don't strip card-body padding with deep selectors (`section.block .card-body`) — use direct child only (`> .card-body`). Otherwise course thumbnails/titles render as empty rectangles.
- **`.container-fluid` had `max-width: 1270px` + auto-center margins squeezing content.** Override with `max-width: 1500px` (cap on huge monitors) plus `padding-left: 220px` on `#page-content` (sidebar clearance on narrow viewports).

## Known v1.5 polish (still to do)

| Item | Notes |
|---|---|
| Top of dashboard "still a little wonky" | Slight gap or alignment near sidebar top on `/my`. Not blocking. Originating from the .header-gap default value not perfectly matching the stage header height. Could fix with a one-line CSS override IF we test carefully — but each previous attempt regressed something. |
| Bookmarks dropdown z-index overlap with sidebar | When clicking the "Bookmarks" subnav dropdown on `/my`, it appears over the sidebar instead of pushing it. Lower priority. |
| Apply blocks-panel-push pattern to course pages | The `body.tgsdbb_open + transform: translateX(280px)` pattern works on `/my`. Same UX would benefit course section pages. Need to verify the same trigger class fires on course pages too, then the rule just needs `body.path-course-view` scope added. |
| Themedesignermode OFF in production | When deploying to production, ensure New Learning theme settings have `themedesignermode` OFF for proper caching. Stage has it ON for dev. |
| Stage data cleanup | The two duplicate `block_news_items` blocks in `#block-region-side-pre` (`inst749`, `inst750`) on stage are stage data artifacts. Delete via Turn editing on → block actions → Delete. Doesn't affect the redesign. |
| `block_recentlyaccessedcourses` configured? | Our hero JS scrapes from this block. If production user has zero recent course activity, the block exists but is empty — JS shows the "Nothing here yet" empty state after a 6-second wait. That's correct behavior. |

## Production deployment plan (when stage is signed off)

1. **Backup first:** copy current production Custom CSS textarea + Additional HTML "Before BODY" textarea contents to a scratch file.
2. **Paste CSS:** Theme → New Learning → Style → Custom CSS. Append the entire `engine-dashboard-css.css` to the bottom of the existing CSS. Save. (Production should already have themedesignermode OFF, so cache regen is fast.)
3. **Paste JS:** Site Admin → Appearance → Additional HTML → "Before BODY is closed". Append the entire `engine-dashboard-js.html` content. Save.
4. **Cache purge:** Site Admin → Development → Purge all caches.
5. **Add Custom HTML blocks:** On `/my`, Turn editing on → Add a block → Text → paste `engine-dashboard-html-hero.html` content via Tools → Source code → Save. Configure: title blank, region "content", weight `-10`. Repeat for disciplines block, weight `-5`.
6. **Production has 3 native blocks stage doesn't:** the welcome banner image, "Welcome!" text, "Logged in user" block. **Delete or hide all three** when deploying to production — our hero replaces them. Use Turn editing on → kebab → Delete on each.
7. **Verify:** time-of-day greeting populates with first name; discipline tiles render with FA icons + counts; click into a course, return to /my, recent course appears in hero; native blocks render with dark band headers.

## State of the spec (visual decisions locked in)

- Page bg: `#fff`
- Card bg: `#fff` (matches page — only border-left + shadow distinguishes cards)
- Card border-left: `4px solid #42c3f7` (teal)
- Card border-radius: `16px` all four corners
- Card padding: `0 40px 24px 40px`
- Card box-shadow: `0 10px 32px rgba(12,25,38, 0.08)`
- Block-region-content gap: `8px` (tight, homepage-like flow)
- Dark band bg: `linear-gradient(135deg, #0c1926 0%, #162d44 100%)` + subtle teal grid pattern (60×60 lines at 6% opacity)
- Dark band title: 1.85rem, weight 800, white, no transform
- Dark band: extends full card width via `margin: 0 -40px 28px -40px` on h3
- Hero greeting gradient: `linear-gradient(120deg, #5cd0fa 0%, #6df2c1 60%, #34d399 100%)` clipped to text
- Hero CTAs: both filled teal `#42c3f7` with navy `#0c1926` text (visually identical, no hierarchy distinction)
- Discipline tile bg: dark navy gradient `linear-gradient(135deg, #0c1926, #162d44)` with teal left accent
- Discipline tile icon: FA glyph in 40px square with navy ring, bg `linear-gradient(135deg, #5cd0fa 0%, #6df2c1 60%, #34d399 100%)`, navy text
- Native block heading text: solid white (NOT gradient — gradient on light bg fails WCAG and "looks ugly green" per Matt)

## How to resume in a new session

Open a fresh Claude Code session. The first message should be:

> "I'm continuing work on the EnGiNE dashboard project. Read `~/Documents/Claude/engine-dashboard-handoff.md` and `~/Documents/Claude/engine-session-summary.md` to pick up context. The current state is v1 deployed to stage with a few polish items remaining. Tell me what you understand before I describe what I want to do next."

Claude will read both summaries and have full context. Memory file at `~/.claude/projects/-Users-mattmini-Documents-Claude/memory/engine_local_setup.md` also has paths and the EnGiNE skill auto-loads on EnGiNE-related work.
