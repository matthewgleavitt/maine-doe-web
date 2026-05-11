# EnGiNE Dashboard — Deployment Runbook

**Target:** stage.moodle.rrev-engine.com (then production)
**Estimated time:** 15–25 minutes for first deploy
**Risk level:** Low — all changes are CSS/HTML in admin fields, fully reversible

---

## What you're deploying

Four artifacts, all in `~/Documents/Claude/`:

| File | Goes into | Purpose |
|---|---|---|
| `engine-dashboard-css.css` | Theme settings → Custom CSS textarea | Page background, native block restyle, all `.ep-dash` styles |
| `engine-dashboard-html-hero.html` | Custom HTML block #1 on `/my` | Hero greeting + Recently Accessed sidebar |
| `engine-dashboard-html-disciplines.html` | Custom HTML block #2 on `/my` | "Browse by Discipline" tile row |
| `engine-dashboard-js.html` | Site Admin → Additional HTML → Before BODY | Greeting, name pull, recent-list population, count refresh |

The `engine-dashboard-mockup.html` file is your visual reference — keep it open in another tab while deploying so you can see what each piece should look like.

---

## Pre-flight — read first

1. **Back up what's already there.** Before pasting anything new, copy the existing contents of these into a scratch file:
   - Theme → New Learning → Custom CSS textarea
   - Site Admin → Appearance → Additional HTML → Before BODY is closed
   This gives you a clean rollback path.

2. **Confirm you're on stage.** URL bar should read `stage.moodle.rrev-engine.com`. **Never paste into production first.**

3. **Theme designer mode.** Stage has `themedesignermode` on (saw it in body classes), which is fine for dev. After you validate the design and before going to production, that should get turned off in production for caching.

4. **Don't use the Custom CSS file upload.** Per session summary, this broke the site previously. Always use the **text field**.

---

## Step-by-step deploy

### Step 1 — Paste the CSS

1. Stage Moodle → Site Admin → Appearance → Themes → New Learning → Style → **Custom CSS**.
2. Open `engine-dashboard-css.css`. Copy the entire file contents.
3. Append it to the **bottom** of the existing Custom CSS textarea. (Don't overwrite — the homepage CSS is in there too and lives alongside.)
4. **Save** at the bottom of the page.

### Step 2 — Paste the JS

1. Site Admin → Appearance → Additional HTML.
2. In **"Before BODY is closed"**, append the contents of `engine-dashboard-js.html` to the end of whatever's already there. (Homepage JS is also here — both coexist via their `.ep` / `.ep-dash` checks.)
3. **Save**.

### Step 3 — Purge caches

Site Admin → Development → **Purge all caches**. Yes you have to do this. Yes the homepage broke last time without it.

### Step 4 — Add the two Custom HTML blocks

The hero and discipline tiles are each their own block on the dashboard.

1. Navigate to `/my` (the dashboard).
2. Click the **pencil icon** in the top-right of the Dashboard heading → **Turn editing on**.
3. **Add the Hero block:**
   - Look for "Add a block" (usually in the sidebar or block region) → **Text**.
   - The new "(new Text block)" appears. Click its **gear icon** → **Configure (new Text block)**.
   - **Block title:** leave blank, AND uncheck **"Display block title"**.
   - **Content:** click the source/HTML mode toggle in the editor (`< >` icon). Paste the contents of `engine-dashboard-html-hero.html` (the block between `<!-- ===== PASTE FROM HERE =====` and `===== PASTE TO HERE ===== -->`). Switch back to visual mode.
   - **"Where this block appears"** → page contexts: **Display on page types: Any my courses page** (or "Default dashboard" — whichever your version exposes).
   - **"On this page"** → Region: **content**, Weight: **-10** (negative = top).
   - **Save changes.**
4. **Add the Disciplines block:**
   - Repeat: Add a block → Text → Configure.
   - Block title: blank, and uncheck "Display block title".
   - Content: paste from `engine-dashboard-html-disciplines.html`.
   - Region: **content**, Weight: **-5** (after hero, before native blocks).
   - Save changes.

### Step 5 — Verify block order via drag

With editing still on, the blocks in `#block-region-content` should now read top-to-bottom:

```
1. (Hero — Custom HTML)
2. (Disciplines — Custom HTML)
3. Course Overview / My Courses (native)
4. Recently Accessed Courses (native — this will be invisible after CSS, that's correct)
5. Latest Announcements (native — CSS demotes it to bottom regardless)
```

If anything is out of order, drag the block headers (cross-arrow icon when editing is on) to reorder.

### Step 6 — Turn editing off

Pencil icon → Turn editing off. Hard-refresh with **Cmd+Shift+R**.

### Step 7 — Verify

Walk this checklist on stage:

- [ ] Hero shows: section label "DASHBOARD" (teal), greeting with **time-of-day + first name** in blue/green ombre, two identical teal buttons.
- [ ] Hero right column shows "RECENTLY ACCESSED" + either real course names or the "Nothing here yet" empty state.
- [ ] Discipline row: 10 tiles with dark-navy icon circles, count pills on the right. Counts should match the live API (Educator Supports = 17, School Health = 16, etc.).
- [ ] Below: My Courses block restyled (white card, teal accent, deep-teal label "MY COURSES").
- [ ] No standalone "Recently Accessed" block visible (it's read by JS into the hero).
- [ ] Latest Announcements demoted to the very bottom.
- [ ] Page background has a subtle 3-color radial wash, not pure flat white.
- [ ] Click a discipline tile — should land on `learn.moodle.rrev-engine.com/course/index.php?categoryid=X` (Moodle's category browse).
- [ ] Click "Browse My Courses" → `/my/courses.php`. Click "Browse All Courses" → `/course/index.php`.
- [ ] Tab through the page with keyboard — every interactive element gets a visible teal focus ring.
- [ ] System Preferences → Accessibility → Display → Reduce motion → ON. Refresh. Hover effects should not animate.

### Step 8 — Mobile sanity

Resize browser to ~700px wide. Confirm:
- Hero stacks vertically (greeting on top, divider becomes a horizontal line, Recently Accessed list below).
- Tiles collapse to 2 columns.
- Buttons remain readable, no overflow.

---

## Known things to test specifically

1. **Recently Accessed population.** With a fresh test user that's clicked into 1–2 courses, confirm those titles populate the hero list (not the empty state). The native block is rendered via Moodle AJAX, so the JS uses a MutationObserver and gives up after 6 seconds → empty state. If your stage user has *never* clicked a course, you'll see empty state — that's correct.

2. **Course count refresh.** After page load (~1 sec), the discipline tile counts should match `engine.maine.gov/course-widget`. They start as static numbers in the HTML — the JS swaps them in. If the API is unreachable, the static fallback stays.

3. **First name detection.** If the hero shows "Welcome back, Educator" instead of your actual first name, the DOM source list in the JS didn't find a match. Open browser console and run:
   ```js
   document.querySelector('.usermenu .usertext')?.textContent
   ```
   to see what your theme uses. If it's a different selector, add it to the `sources` array in `engine-dashboard-js.html` line 30-ish.

4. **Stage cleanup not blocking.** The two duplicate `block_news_items` instances in `#block-region-side-pre` (`inst749`, `inst750`) on stage should be deleted via Turn editing on → block actions → Delete. They're stage data artifacts and don't affect the redesign.

---

## Rollback (if something looks bad)

Fully reversible in 4 steps:
1. Site Admin → Custom CSS textarea → remove the block of CSS you appended (or restore from backup).
2. Site Admin → Additional HTML → remove the appended JS (or restore from backup).
3. Dashboard → Turn editing on → for each Custom HTML block: gear → **Delete this block**.
4. Site Admin → Development → Purge all caches.

You're back to whatever was there before.

---

## Going to production

Once stage is signed off:

1. Repeat Steps 1–7 against `learn.moodle.rrev-engine.com`.
2. Production has many more enrolled users and the Course Overview block will look denser — that's expected, the CSS handles it.
3. Production should also have **theme designer mode OFF** in the New Learning theme settings for proper caching. (Stage has it on — saw `themedesignermode` in body classes.)

---

## v1.5 punch list (not in this deploy)

These are deferred — talk through them when stage is signed off:

- [ ] Onboarding interactive tour using Moodle's built-in **User Tours** (Site Admin → Appearance → User tours)
- [ ] Live stats tiles (badges, contact hours, courses-in-progress with bars) — needs Moodle web service token
- [ ] Role-aware variants (educator vs admin vs teacher) — pure CSS using existing `body.roleshortname-X` hooks
- [ ] Replace static SVG for Wabanaki Studies after consulting with Brianne Lolar
- [ ] Move CSS hosting to Moodle server instead of inline (ask dev team)
- [ ] Auto-generate the discipline tile HTML from the API at build time (instead of static markup)
