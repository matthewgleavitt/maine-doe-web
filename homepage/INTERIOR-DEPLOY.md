# Maine DOE interior pages — sandbox and rollout

One file gets installed. Everything else is local tooling.

| File | Goes where |
|---|---|
| `interior-css-injector.deploy.css` | Structure → CSS Injector → new rule |
| `interior-css-injector.css` | Nothing — this is the **source**. Edit this one. |
| `build-interior-preview.js` | Nothing — rebuilds the preview and the deploy file |
| `interior-cleanup.js` | Nothing — cleans a page's body HTML before you paste it |
| `interior-checks.js` | Nothing — contrast and layout checks |

**Never paste `interior-css-injector.css`.** It is 151KB, and about 100KB of that
is the reasoning in the comments. `interior-css-injector.deploy.css` is the same
stylesheet with the prose stripped — 54KB — and it is regenerated from the source
on every build, so the two cannot drift. Verified rendering identically: same
checks, same computed values.

---

## Read this before you scope anything

Every rule is prefixed `body.page-node-type-multi-column-page`. That class is on
**every interior page on the site** — all **830** of them. (The figure read
~85 here until 2026-09-21; the inventory is 833 nodes, 831 with a body, 830 with
a path. It matters, because it is the number of pages one paste reaches.) So:

> The CSS scope does not limit the rollout. The **Injector's page scoping** is
> the only thing standing between a sandbox and all 830 pages at once.

Get that field right and everything else is reversible.

### Is the stylesheet safe on a page whose HTML has not been replaced yet?

Yes, and it is measured rather than assumed. `rollout-risk.js` renders all 831
current page bodies twice, once under the theme alone and once with this
stylesheet added, and diffs the contrast and overflow results. Same DOM, same
probe, one stylesheet apart.

| | theme only | with this rule |
|---|---|---|
| contrast failures across 831 pages | 1,288 | **1,136** |
| pages it makes worse | | **3** |
| pages it improves | | **64** |
| pages scrolling sideways that it fixes | | **45** |
| pages it makes scroll sideways | | 1 (75px) |

366 pages fail contrast in *both* columns. Those are faults the site already has
today; this rule neither causes nor fixes them, and they belong to the audit.

The three it makes worse are: a test node with no path, `/learning/esea/eseaupdate`
(newsletter markup pasted into a Basic Template page, already failing 7 times
without this rule, and really wants to be a Newsletter Issue), and
`/schoolsupports/schoolhealth/guidelines/emergencycare`, whose `.btn-info` button
already draws a midblue label on a navy fill at 1.69:1 with or without us. This
stylesheet deliberately leaves `.btn-info` alone, so that one is the theme's.

Five regressions found by that sweep were fixed rather than accepted, because
during the rollout *every* page is un-migrated markup: a card header an author
painted themselves, a link inside a navy table header, a table nested inside a
`<th>`, a link on a navy card title, and a jumbotron written for a dark ground.
All five are at the end of `interior-css-injector.css`.

**So the order is CSS first, bodies after.** The new markup is meaningless
without the stylesheet, and the old markup is better with it. Reversed, every
page you migrate would look broken until the CSS landed.

### What the rule does NOT cover

`drupal-css-injector-chrome.css` is the header and footer, and it is a separate
decision. It is scoped to the homepage prototype today. Taking it site-wide
reaches every content type, not just this one:

| content type | nodes |
|---|---|
| Basic Template page (`multi_column_page`) | 829 — measured above |
| Newsletter Issue | 24 — not measured |
| Home Page | 6 — not measured |
| Blog Post | 4 — not measured |
| Webform | 2 — not measured |

36 pages of unmeasured surface. That is small enough to open by hand, and it
should be opened by hand before the chrome goes site-wide.

---

## 1. Build and lint

```bash
node build-interior-preview.js
```

Three lines matter in the output:

```
WAF lint: clean, safe to paste
Scope lint: every selector is scoped to the content type
interior-css-injector.deploy.css — 54.5KB
```

**If the WAF lint fails, stop.** maine.gov returns 403 on any Injector save
containing a scheme-qualified address, and this file has three places where one
can creep back in: the `xmlns` inside the SVG data URIs. Those colons are
percent-encoded at source (`http%3A//`) precisely so the saved text has no
`http://` in it, while the data URI still decodes to a valid namespace. If you
ever hand-edit an SVG in the stylesheet, encode the colon.

Then run the checks:

```bash
node interior-checks.js
```

Expect `contrast 0 failures` and `card rows all equal` at both widths.

---

## 2. The Injector rule, scoped to the sandbox

Structure → CSS Injector → **Add CSS Injector**.

| Field | Value |
|---|---|
| Label | `DOE Interior — SANDBOX` |
| CSS | the whole of `interior-css-injector.deploy.css` |
| Media | leave blank (the rule carries its own media queries) |
| Pages | **Show for the listed pages**, one sandbox path per line |

The paths go in without a leading domain, one per line, e.g.

```
/doe/sandbox/multilinguallearner-test
/doe/sandbox/mainelaws-test
/doe/sandbox/cert-faq-test
```

Save, then **Configuration → Development → Performance → Clear all caches**. A
CSS Injector change will not show until you do.

Sanity check before going further: load one sandbox page and one *real* interior
page side by side. The sandbox page should be styled and the real one should be
completely untouched. If the real one changed, the page scoping is wrong — fix
that before anything else.

---

## 3. Duplicate the pages

Pick the ones we've already looked at, because you can compare them against the
local preview:

| Page | Why it is worth testing |
|---|---|
| `/doe/learning/multilinguallearner/services` | The hardest one — 24 accordions, nested sets, 6 sections, contents list |
| `/doe/cert/faq` | Accordion repair: split lists, added container, added title links |
| `/doe/about/contact` | Tables, the address block, the consent-form language list |
| `/doe/about/laws/mainelaws` | Banner photo, card grid, contact block |
| `/doe/schoolsupports/communityschools` | Layout table → columns, video, format chips |
| `/doe/educators/educatoreval/educatorperf` | A wall of prose — the hardest case for structure |

Node → Clone (or copy the body field into a new Multi-column page). Keep the same
content type or none of this applies.

---

## 4. Clean the body HTML

For each sandbox page, run the real page through the cleanup tool and paste the
result into the body field (text format **Full HTML**):

```bash
node interior-cleanup.js https://www.maine.gov/doe/cert/faq --write faq.html
```

It prints two lists. **AUTO-FIXED** is what it changed; **NEEDS A PERSON** is what
it deliberately did not touch. Read the second list — that is your audit backlog
for the page.

The tool changes markup around text. It never changes a word of content.

---

## 5. Add the banner block by hand

This is the part the tool cannot do, because it is authoring. At the very top of
the body field:

```html
<div class="doe-hero doe-hero--art" style="background-image:url(/doe/sites/maine.gov.doe/files/inline-images/Your-Photo.jpg)">
<p class="doe-eyebrow">Policy &amp; Legislation</p>
<p class="doe-contact-link"><a href="#contact">Contact</a></p>
<p class="doe-lead">One or two sentences saying what this page is for.</p>
<p class="doe-cta"><a class="btn-cta" href="/doe/...">The one thing to do here</a></p>
<nav class="doe-toc"><h3>On this page</h3><ol>
<li><a href="#roles-and-responsibilities">Roles and Responsibilities</a></li>
<li><a href="#what-is-an-ilap">What is an ILAP?</a></li>
<li><a href="#programming-guidance">Programming Guidance</a></li>
</ol></nav>
</div>
```

Every line is optional except the wrapper:

- no photo → drop `doe-hero--art` and the `style` attribute, and it is plain navy
- no eyebrow, no deck, no button, no contents list → leave them out
- the contents list needs **three or more** sections to be worth having

Each section heading then carries the matching id:

```html
<div id="roles-and-responsibilities" class="blockhead"><h2>Roles and Responsibilities</h2></div>
```

The contact block needs an id once:

```html
<div id="contact" class="contact-cube">
```

And the two floating controls go at the very end of the body field:

```html
<p class="doe-jump"><a href="#contact">Contact</a></p>
<p class="doe-top"><a href="#top">Back to top</a></p>
```

`#top` needs no element to point at — browsers treat it as the top of the
document by definition.

---

## 6. What to compare

Open the sandbox page and the local preview side by side. The preview is built
from the **real** page content with the **real** chrome, so they should match.
Things worth checking specifically, because each one has bitten us:

- **Page title and breadcrumbs are visible.** If the title band is 0px tall, a
  chrome rule is hiding it — there is a defensive rule in the stylesheet for
  exactly this.
- **Accordions open and close.** Production has the module's JavaScript; the
  local preview fakes it. This is the one behaviour the preview cannot prove.
- **Contents links land on their sections**, and the contact links land on the
  contact block.
- **Card rows are equal width** and their images are equal height.
- **Tables** stripe in the light warm, not grey, and cells are 16px.
- **The sticky section nav** follows you down and scrolls internally if it is
  taller than the window.

---

## 7. Rolling out

When the sandbox pages are right, the rollout is **one field**: change the
Injector rule's page scoping from the sandbox list to all interior pages, and
clear caches.

Before you do, decide two things:

1. **Do the 830 pages get the banner block?** The stylesheet is safe on a page
   with no banner — the page simply looks like it does today, plus the tidier
   tables, cards, accordions and headings. The banner, contents list and action
   button only appear where an author has written them. So the rollout can be
   CSS first, authoring page by page after.

2. **Retire the duplicate banner graphics.** Several pages open with a graphic
   that repeats the page title. With the assembled banner they say the same
   thing twice. The preview hides them so you can see the result; production
   needs someone to delete them.

Keep the sandbox rule until the real one is proven, then delete it — two rules
matching the same page is how the homepage lost two rounds to a stale copy
winning on source order.

---

## Known gotchas

**A CSS change doesn't show.** Clear all caches. If it still doesn't, add
`background: red !important` to the rule to confirm the injector is loading on
that page at all, then work backwards.

**A rule looks right and doesn't apply.** The theme reaches many of these
elements with an ID selector, which beats any class selector no matter how many
classes it has. This has caught the accordion margins, the table cell size, the
contents link colour and the dc-note links. The fix is `#block-doe-content` in
the selector, or `!important`, and there are comments at each place it happened.

**A page's markup is broken.** `/doe/fedrelief` has one more `</div>` than it has
`<div>`, which closes `#block-doe-content` early — so anything after the stray tag
falls outside it and every rule scoped to that block silently misses. The cleanup
tool flags this as `unbalanced <div>`.

**Text still looks small in a table.** The theme puts `0.9em` on both the table
and the cell, compounding to 14.4px. The stylesheet forces 16px on the cells with
`!important` for that reason.
