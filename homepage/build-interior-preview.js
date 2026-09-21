#!/usr/bin/env node
/* Maine DOE interior pages — preview builder
 * Version: 2026-09-21-h  ·  Last edited: 2026-09-21
 *
 *   node build-interior-preview.js            # rebuild from cache
 *   node build-interior-preview.js --fetch    # re-pull the pages live
 *
 * WHY THIS EXISTS
 * ---------------
 * interior-templates.html was hand-written with its OWN inline copy
 * of the candidate CSS. So the styling in the file and the styling in
 * interior-css-injector.css drifted apart the moment the rule was
 * revised, and a whole round of fixes — the banner texture, the
 * accordion, the section nav, five WCAG corrections — was invisible
 * in the thing being reviewed. Two sources of truth is the bug.
 *
 * This builds the preview FROM the real files instead:
 *   · interior-css-injector.css is <link>ed, not copied
 *   · the body carries page-node-type-multi-column-page, so the
 *     scoped selectors match exactly as they will on the site
 *   · the live maine.gov stylesheets load underneath it
 *   · the content is real page bodies, run through interior-cleanup
 *
 * If it looks right here it will look right deployed, because there
 * is nothing here that is not deployed.
 *
 * The page set is deliberately awkward: the audit's worst offenders,
 * not a tidy sample. A template that only survives good pages is not
 * a standard.
 */
'use strict';

/* FIND A BLOCK BY COUNTING ITS DIVS, not by matching to the first
   </div>. A regex cannot count nesting, and twice now that has done
   real damage: once it swallowed a row's opening tag and rendered one
   card inside another, and once it took an accordion container to end
   at a nested container's close, so the generated contents list mixed
   an outer title with inner ones. This walks the tags and keeps a
   depth, which is the only way to get it right. */
function replaceBlocks(html, openTag, fn) {
  let out = '', i = 0;
  for (;;) {
    const at = html.indexOf(openTag, i);
    if (at < 0) { out += html.slice(i); break; }
    out += html.slice(i, at);
    let depth = 0, j = at;
    const tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = at;
    let m;
    while ((m = tag.exec(html))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) { j = m.index + m[0].length; break; }
    }
    if (depth !== 0) { out += html.slice(at); break; }   /* unbalanced: leave alone */
    const whole = html.slice(at, j);
    const inner = whole.slice(openTag.length, -'</div>'.length);
    out += fn(whole, inner);
    i = j;
  }
  return out;
}
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CACHE = path.join(__dirname, '.interior-cache');
const HOST = 'https://www.maine.gov';

/* Chosen from the 84-page audit to cover every defect and every
   shape: short, dense, card-heavy, accordion-heavy, table, jumbotron,
   Word paste, contact-cube, and the invisible-heading bug. */
const PAGES = [
  ['/doe/fedrelief',                                  'Short · cards + white-on-white bug'],
  ['/doe/exploreeducation/teachmaine',                'Medium · contact-cube'],
  ['/doe/learning/multilinguallearner/services',      'DENSE · 24 accordions, 2,691 words'],
  ['/doe/about/contact',                              'Unbranded table + h5 card titles'],
  ['/doe/about/laws/mainelaws',                       'Legacy jumbotron'],
  ['/doe/schools/transportation',                     'hr+heading breaks'],
  ['/doe/schoolsupports/communityschools',            'Unbranded table'],
  ['/doe/schoolsupports/schoolhealth',                'Word paste artifacts'],
  ['/doe/cert/faq',                                   'FAQ shape'],
  ['/doe/Testing_Accountability/model/indicators',    'Jumbotron + table'],
  ['/doe/educators/educatoreval/educatorperf',        'Jumbotron + Word'],
  ['/doe/about/laws/policy',                          'h5 card titles'],
];

const RAW = process.argv.includes('--raw');
const slug = (p) => p.replace(/^\/doe\//, '').replace(/\//g, '_') || 'home';

async function pull(p) {
  const f = path.join(CACHE, slug(p) + '.html');
  if (fs.existsSync(f) && !process.argv.includes('--fetch')) return fs.readFileSync(f, 'utf8');
  const r = await fetch(HOST + p, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, html);
  process.stderr.write(`  fetched ${p}\n`);
  await new Promise((s) => setTimeout(s, 200));
  return html;
}

const grab = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };

/* The real header, menu and footer markup, captured from the live
   site and kept in preview-chrome.html — the same file the homepage
   preview uses, so the chrome rule is judged against the DOM it
   actually has to style rather than a tidy fake. */
const chrome = (() => {
  const raw = fs.readFileSync(path.join(__dirname, 'preview-chrome.html'), 'utf8');
  const part = (name) => {
    const i = raw.indexOf('<!--' + name + '-->');
    if (i < 0) return '';
    const rest = raw.slice(i + name.length + 7);
    const next = rest.search(/<!--[A-Z]+-->/);
    return (next < 0 ? rest : rest.slice(0, next)).trim();
  };
  /* The Follow band is lifted from the homepage body field, which is
     where it lives today. In production it becomes a Drupal block
     above the footer — see the note in the CSS. */
  const home = fs.readFileSync(path.join(__dirname, 'drupal-body.html'), 'utf8');
  const social = (home.match(/<section[^>]*class="[^"]*dh-social[^"]*"[\s\S]*?<\/section>/) || [''])[0];
  return { header: part('HEADER'), menu: part('MENU'), footer: part('FOOTER'), social };
})();

/* Root-relative src/href point at localhost in the preview, so every
   image 404s and every internal link goes nowhere. Rewrite them onto
   the live host. Anchors starting with # are page-internal and must
   be left alone, or the "On this page" jumps break. */
function absolutise(html) {
  return html
    .replace(/(\s(?:src|href|data-src)=")\/(?!\/)/g, `$1${HOST}/`)
    .replace(/(\ssrcset=")([^"]+)"/g, (m, pre, set) =>
      pre + set.replace(/(^|,\s*)\/(?!\/)/g, `$1${HOST}/`) + '"');
}

/* The live stylesheet list, taken from a real page so the preview
   loads exactly what production loads.

   THE MEDIA ATTRIBUTE IS NOT OPTIONAL. The first version of this
   rebuilt every <link> without it, which loaded sphone.css — media
   "only screen and (max-width:651px)" — and a print-only aggregate at
   every width. sphone.css carries a bare `#sectionnav { display:none }`,
   so the side nav was invisible in the preview and perfectly visible
   on the site, and I spent a round chasing a wrapper-chain bug that
   did not exist. Carry the attribute through verbatim. */
function sheets(html) {
  const out = [];
  const re = /<link[^>]+>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const h = tag.match(/href="([^"]+\.css[^"]*)"/);
    if (!h) continue;
    let u = h[1].replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    else if (u.startsWith('/')) u = HOST + u;
    const md = tag.match(/media="([^"]+)"/);
    if (out.some((s) => s.href === u)) continue;
    /* The 53KB newsletter rule loads on 100% of interior pages while
       styling only .newsletter-root and friends. Kept, because the
       preview must match production — including its dead weight. */
    out.push({ href: u, media: md ? md[1].replace(/&amp;/g, '&') : '' });
  }
  return out;
}

(async () => {
  const built = [];
  let sheetTags = '';

  for (const [p, label] of PAGES) {
    let raw;
    try { raw = await pull(p); } catch (e) { process.stderr.write(`  SKIP ${p} (${e.message})\n`); continue; }

    if (!sheetTags) {
      sheetTags = sheets(raw)
        .map((s) => `<link rel="stylesheet" href="${s.href}"${s.media ? ` media="${s.media}"` : ''}>`)
        .join('\n');
    }

    const title = grab(raw, /<title>([^<]*)</).replace(/\s*\|\s*Department of Education\s*$/, '').trim();
    /* [^>]*> before the capture, or the closing bracket of the
       block-doe-content div itself leaks into the body and renders as
       a stray ">" at the top of every page. */
    const body = absolutise(
      grab(raw, /id="block-doe-content"[^>]*>([\s\S]*?)<\/article>/)
        .replace(/<div class="contextual-region">\s*<\/div>/g, '')
    );
    const nav = absolutise(grab(raw, /(<div id="sectionnav"[\s\S]*?<\/ul>\s*<\/div>)/));
    const crumbs = absolutise(grab(raw, /(<div class="crumb_trail">[\s\S]*?<\/div>)/));
    /* The page H1 is its own Drupal block, a SIBLING of
       #block-doe-content inside #maincontent2 — not part of the body
       field at all. Leaving it out meant every preview page opened
       with no title, which is not what a reader sees. */
    const h1 = absolutise(grab(raw, /(<h1[^>]*>[\s\S]*?<\/h1>)/));

    /* Run the real cleanup tool — not a copy of its logic. */
    /* --raw SKIPS IT ON PURPOSE. The question the rollout turns on is
       what the new stylesheet does to a page whose HTML has NOT been
       replaced yet, because the injector goes live on all 832 at once
       and the bodies are replaced one at a time. This mode renders
       today's live markup under the new rule so that can be measured
       rather than guessed at. */
    let clean = body, report = '';
    if (RAW) { clean = body; report = 'raw: cleanup skipped'; } else
    try {
      const tmp = path.join(CACHE, slug(p) + '.in');
      fs.writeFileSync(tmp, '<article about="x">' + body + '</article>');
      const outF = path.join(CACHE, slug(p) + '.out');
      report = execFileSync('node', [path.join(__dirname, 'interior-cleanup.js'), tmp, '--write', outF],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      clean = fs.readFileSync(outF, 'utf8');
    } catch (e) {
      report = 'cleanup failed: ' + (e.stderr || e.message);
    }

    /* ── THE TITLE ECHO (DEMO) ───────────────────────────────────
       The first section header repeating the page title, measured on
       the multilingual page: the h1 says "Multilingual Programming
       Requirements & Guidance" and the first blockhead says it again,
       so the reader is told the same thing twice before any content.

       Removing it has a second effect that is the real point. The
       paragraph underneath it — "Multilingual learners (MLs) thrive
       when School Administrative Units implement…" — is the page's
       description, and with the echo gone it becomes the first real
       element, which is what promotes it to the deck. The contents
       list anchors to the deck, so it comes back at the same time.
       One deletion fixes the heading, the banner and the contents.

       In production this is a person deleting a heading. Done here so
       the result can be judged before anyone edits 85 pages. */
    let echoRemoved = false;
    {
      const norm0 = x => (x || '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const m = clean.match(/<div[^>]*class="blockhead"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>\s*<\/div>/);
      if (m && norm0(title).length > 12 &&
          norm0(m[1]).startsWith(norm0(title).slice(0, 18))) {
        clean = clean.replace(m[0], '');
        echoRemoved = true;
      }
    }

    /* ── THE BANNER, ASSEMBLED AS ONE OBJECT (DEMO) ─────────────
       Rewritten: the deck, the eyebrow, the picture and the contents
       list used to be emitted as four siblings, each painting its own
       background, and no amount of matching colours made them read as
       one band. They go inside a single .doe-hero now, which is the
       element that owns the background — see section 18b-2 of the
       stylesheet for why that is the whole fix.

       In production an author writes this block at the top of the
       body field. Assembled here so the treatment can be judged
       across twelve real pages before anyone edits eighty-five.

       THE DECK IS MOVED, not marked in place: it has to be inside the
       hero to sit on its background. It is the page's first real
       element, so lifting it to the top changes no reading order.

       "Real" excludes Drupal's own empty wrapper divs, which come
       first on every page. Anchored inside layout__region--content,
       and layout* wrappers excluded — they carry classes too, so a
       plain "first classed div" test matched the page scaffolding.
       Community Schools opens with a banner image, so a test of
       "first paragraph before any heading" was not strict enough
       either: it marked a mid-page paragraph and painted a navy band
       across the middle of the page. */
    let deck = '';
    {
      /* Scan forward past LEADING MEDIA rather than testing only the
         very first element. Community Schools opens with a banner
         graphic and then a video, so a strict "first element must be
         the paragraph" test found no description at all — while the
         sentence that describes the whole page sat right underneath.

         The scan stops at the first heading, and after six elements,
         which is what keeps this from finding a paragraph in the
         middle of a page and painting a navy band across it — the bug
         that put a band through the centre of this very page once. */
      const region = clean.indexOf('layout__region--content');
      let i = region > -1 ? region : 0;
      /* The scan steps INTO a leading grid as well as past leading
         media. Once layout tables became .row/.col markup, the
         Community Schools description moved inside a column and a
         top-level-only scan stopped finding it. */
      const SKIP = /^<(?:img|iframe|br|hr)[\s>/]|^<(?:p|div)[^>]*>\s*(?:&nbsp;|\s)*<\/(?:p|div)>|^<div[^>]*class="(?:layout|doe-video|row|col-)/i;
      /* 12 steps, not 6. Every wrapper counts as one, and once the
         layout table became .row > .col-sm-6 > .doe-video > iframe the
         Community Schools description was the seventh thing the scan
         reached — so it ran out and the page lost its deck. The stop
         condition that matters is the first HEADING, not the count;
         the count is only there so a page with no intro does not walk
         the whole document looking for one. */
      for (let step = 0; step < 12; step++) {
        const rel = clean.slice(i).search(/<(?:p|h[1-6]|ul|ol|table|dl|iframe|img|hr)[\s>]|<div[^>]*class="(?!layout__region)[^"]+"/i);
        if (rel < 0) break;
        i += rel;
        const rest = clean.slice(i);
        if (/^<h[1-6][\s>]/i.test(rest)) break;          /* a heading ends the run-in */
        const m = rest.match(/^<p[^>]*>([\s\S]*?)<\/p>/i);
        /* 60 characters of TEXT, not of markup. Counting tags and
           entities let an empty paragraph of &nbsp; and a <br>
           qualify, which is the 46px navy bar with no words in it
           that appeared on Educator Performance. */
        const words = (m ? m[1] : '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
        if (m && !/<img|<iframe/i.test(m[1]) && words.length >= 60) {
          deck = m[1].trim();
          clean = clean.slice(0, i) + clean.slice(i + m[0].length);
          break;
        }
        if (SKIP.test(rest) || m) { i += 1; continue; }
        break;
      }
    }

    /* EYEBROW from the section nav, not the breadcrumb — on mainelaws
       the crumb trail never mentions Policy & Legislation while the
       nav nests the page under it correctly. A top-level page has no
       enclosing <li> and so gets no eyebrow, which is the "only
       children" rule. */
    let parent = '';
    const act = nav.indexOf('is-active');
    if (act > -1) {
      const before = nav.slice(0, act);
      const nestedUl = before.lastIndexOf('<ul');
      if (nestedUl > -1) {
        const anchors = [...before.slice(0, nestedUl).matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)];
        if (anchors.length) parent = anchors[anchors.length - 1][1].replace(/<[^>]+>/g, '').trim();
      }
    }

    /* Photographs verified 200 on maine.gov. Stand-ins on the pages
       that have none of their own, so the treatment can be judged;
       replace before launch. */
    const ART = {
      '/doe/about/laws/mainelaws': '/doe/sites/maine.gov.doe/files/inline-images/Legislative%20-%20Senate%20Chambers.png',
      '/doe/about/laws/policy':    '/doe/sites/maine.gov.doe/files/inline-images/Legislative%20-%20Hall%20of%20Flags.png',
      '/doe/learning/multilinguallearner/services':
        '/doe/sites/maine.gov.doe/files/inline-images/pexels-yan-krukau-8613089_0.jpg',
      '/doe/schoolsupports/communityschools':
        '/doe/sites/maine.gov.doe/files/inline-images/pexels-yan-krukau-8613089_0.jpg',
    };

    /* CONTENTS from the .blockhead h2s — exactly what the heading
       contract makes possible, and the reason it is worth enforcing.
       Three sections is the floor: a list of two is not a route. */
    let toc = '';
    {
      const heads = [...clean.matchAll(/class="blockhead"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      if (heads.length >= 3) {
        /* SLUGGED IDS, not s0/s1/s2. Two reasons. A readable anchor
           survives a section being moved or a new one being inserted,
           where a positional id silently starts pointing at the wrong
           heading. And in this harness twelve pages share one
           document, so every page had its own id="s0" — which is why
           the contents links on the multilingual page jumped into
           TeachMaine. The page slug prefix below exists only for that
           reason; in production each page is its own document and the
           bare slug is what an author writes. */
        const slug = t => t.toLowerCase().replace(/&[a-z]+;/g, ' ')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
        const pre = p.replace(/[^a-z0-9]+/gi, '').slice(-14).toLowerCase();
        const ids = heads.map(h => `${pre}-${slug(h)}`);
        let n = 0;
        clean = clean.replace(/(<div class="blockhead")/g, () => `<div id="${ids[n++] || 'sx'}" class="blockhead"`);
        toc = '<nav class="doe-toc"><h3>On this page</h3><ol>' +
          heads.map((h, i) => `<li><a href="#${ids[i]}">${h}</a></li>`).join('') + '</ol></nav>';
      }
    }

    /* The text-level image strip that used to live here deleted any
       <img> whose width ATTRIBUTE was 700 or more — which is most card
       images, since they are uploaded large and displayed small. That
       is why the card photographs vanished. Banner-hiding happens at
       render time instead, on the RENDERED box, where a card image is
       plainly 252px wide and a banner is plainly not. */

    /* DEMO — retire a page's own banner graphic where the assembled
       banner now says the same thing. These duplicate the title in
       picture form; kept in the flow they put the page name on screen
       twice before any content. Production decision, shown here so it
       can be judged. */
    clean = clean.replace(/<img[^>]*(?:Banner|banner)[^>]*>/g, '')
      /* Retiring the graphic can empty the element that held it — on
         /doe/schools/transportation the banner was inside an <h4>, so
         removing it left <h4></h4>: a heading a screen reader
         announces with nothing to read, and a zero-height gap that
         made the paragraph under it sit flush. The cleanup tool
         strips these, but it runs BEFORE this line, so the one this
         line creates has to be cleared here. */
      .replace(/<(h[1-6])\b[^>]*>\s*<\/\1>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '');

    /* DEMO — a contents list for any accordion set of four or more.
       In production an author writes it, the same as the page list.
       Four is the floor: a list of two is not a route, and many
       accordions on the site are a single panel. */
    {
      const OPEN = '<div class="ckeditor-accordion-container">';
      const slug = t => t.toLowerCase().replace(/&[a-z]+;/g, ' ')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
      const pre = p.replace(/[^a-z0-9]+/gi, '').slice(-12).toLowerCase();

      const decorate = (whole, inner) => {
        /* NESTED SETS FIRST, and separately. On the multilingual page
           one panel contains a whole accordion of its own — the grade
           bands inside "Supporting MLs through WIDA". Counted flat,
           the outer set looked like four items and its list mixed the
           outer title with the inner ones. Nested containers are
           lifted out before counting and put back afterwards, so each
           set is measured on its OWN items. */
        const kept = [];
        const flat = replaceBlocks(inner, OPEN, (w, i2) => {
          kept.push(decorate(w, i2));
          return `\u0000${kept.length - 1}\u0000`;
        });
        const restore = x => x.replace(/\u0000(\d+)\u0000/g, (m, i2) => kept[Number(i2)]);

        const titles = [...flat.matchAll(/<dt[^>]*>\s*(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\/dt>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        if (titles.length < 4) return OPEN + restore(flat) + '</div>';

        const ids = titles.map(t => `${pre}-${slug(t)}`);
        let n = 0;
        const withIds = flat.replace(/<dl class="ckeditor-accordion"/g,
          () => `<dl id="${ids[n++] || 'ax'}" class="ckeditor-accordion"`);
        const list = '<nav class="doe-toc doe-toc--sub"><h3>In this section</h3><ol>' +
          titles.map((t, i) => `<li><a href="#${ids[i]}">${t}</a></li>`).join('') + '</ol></nav>';
        return list + OPEN + restore(withIds) + '</div>';
      };

      clean = replaceBlocks(clean, OPEN, decorate);
    }

    /* A COLUMN THAT LOST ITS CONTENT IS NOT A COLUMN.
       Lifting the description into the banner emptied one half of
       Community Schools' two-column row, so the video sat in the left
       half with nothing beside it — the video "floating in space". An
       empty column is dead width whatever emptied it, so: drop empty
       columns, and unwrap a row left holding a single one. */
    /* Only the EMPTY column is removed, and nothing is unwrapped.
       The first version also tried to unwrap a row left holding one
       column, with a regex — and a regex cannot count nested <div>s.
       On the multilingual page it matched up to the first </div> it
       found, swallowed the row's opening tag and the first column's,
       and left the second card rendered INSIDE the first. A lone
       column is widened by a CSS rule instead, which needs no
       knowledge of the markup's depth. */
    clean = clean.replace(/<div class="col-[^"]*">\s*(?:<p>\s*(?:&nbsp;|\s)*<\/p>\s*)*<\/div>/g, '');

    /* DEMO — the page's primary action, lifted into the banner. In
       production an author writes the <p class="doe-cta"> themselves;
       shown here on two pages so the treatment can be judged. */
    const CTA = {
      '/doe/about/contact': ['Submit questions, comments, or concerns', 'https://www.maine.gov/doe/contactform'],
      '/doe/learning/multilinguallearner/services':
        ['Download the Roles & Responsibilities guide', 'https://www.maine.gov/doe/learning/multilinguallearner/services'],
    };
    const cta = CTA[p]
      ? `<p class="doe-cta"><a class="btn-cta" href="${CTA[p][1]}">${CTA[p][0]}</a></p>` : '';

    /* DEMO — the back-to-top control, appended to every page. In
       production an author writes this one line at the end of the
       body field. Shown on all twelve so its position can be judged
       against short pages as well as long ones. */
    /* The contact block needs an id to aim at. In production an author
       writes id="contact" on it once and every link uses #contact.
       Here the id is page-prefixed, because twelve pages share one
       document in this harness and a repeated id="contact" sent every
       page's link to the FIRST page's contact block — which is
       exactly why the jump appeared not to work. */
    const contactId = `${p.replace(/[^a-z0-9]+/gi, '').slice(-12).toLowerCase()}-contact`;
    const hasContact = /class="[^"]*contact-cube/.test(clean);
    if (hasContact) {
      clean = clean.replace(/(<div[^>]*class="[^"]*contact-cube)/,
        (m) => (/\bid=/.test(m) ? m : m.replace('<div', `<div id="${contactId}"`)));
    }
    clean += (hasContact ? `<p class="doe-jump"><a href="#${contactId}">Contact</a></p>` : '')
      + '<p class="doe-top"><a href="#top">Back to top</a></p>';

    /* hasContact counts too: a page with a contact block but no deck,
       eyebrow or contents list was getting no banner at all, and so no
       contact link — 7 of the 9 pages with a contact block had one.
       The banner with nothing in it looks exactly like the title block
       did on its own, so adding it costs nothing and the link becomes
       consistent. */
    if (deck || parent || toc || hasContact) {
      const art = ART[p];
      clean =
        `<div class="doe-hero"` +
        (art ? ` style="background-image:url(${HOST}${art})"` : '') + '>' +
        (parent ? `<p class="doe-eyebrow">${parent}</p>` : '') +
        (hasContact ? `<p class="doe-contact-link"><a href="#${contactId}">Contact</a></p>` : '') +
        (deck ? `<p class="doe-lead">${deck}</p>` : '') +
        cta +
        toc +
        '</div>' + clean;
    }


    /* A pattern worth catching across all 85: the first section
       header repeating the page title. On the multilingual page the
       h1 says "Multilingual Programming Requirements & Guidance" and
       the first blockhead says it again — so the reader is told the
       same thing twice before any content, and the paragraph that
       follows is the description the banner wants.
       Flagged, not fixed: deleting a heading is a content decision. */
    const titleEchoed = echoRemoved;

    built.push({ p, label, title, before: body, after: clean, nav, crumbs, h1, titleEchoed, report: (e => e)(report) });
  }

  const opts = built.map((b, i) =>
    `<option value="${i}">${b.title.replace(/"/g, '')} — ${b.label}</option>`).join('\n');

  /* THE REAL WRAPPER CHAIN, measured off the live DOM:
       #container
         #content.clearfix
           #block-doe-breadcrumbs > .crumb_trail
           #sectionnav                 float:left, 18%
           #maincontent2.article       float:left, ~78%
             #block-doe-content
     Two rounds were lost to modelling this instead of copying it.
     First a CSS grid of my own, which the theme's
     #sectionnav{display:none} defeated; then the right ancestry but
     WITHOUT #maincontent2, so the content column had no float and ran
     underneath the nav — which is the overlap Matt saw. The float
     column is the layout. Reproduce the DOM; do not model it. */
  const panes = built.map((b, i) => `
<section class="pv-page" data-i="${i}"${i ? ' hidden' : ''}>
  <div class="pv-meta"><b>${b.p}</b> · ${b.label}${b.titleEchoed ? ' · <span style="color:#8a2e13">first section header repeated the page title — removed here, and its paragraph promoted to the description</span>' : ''}</div>
  <div class="pv-stage">
    <div id="container">
      __CHROME_HEADER__
      __CHROME_MENU__
      <div id="content" class="clearfix">
        ${b.crumbs ? `<div id="block-doe-breadcrumbs">${b.crumbs}</div>` : ''}
        ${b.nav || '<div class="pv-nonav">no #sectionnav on this page</div>'}
        <div id="maincontent2" class="article">
          ${b.h1 ? `<div id="block-doe-pagetitle">${b.h1}</div>` : ''}
          <div id="block-doe-content">${b.after}</div>
        </div>
      </div>
      __CHROME_SOCIAL__
      __CHROME_FOOTER__
    </div>
  </div>
</section>`).join('\n')
    /* Plain tokens, not ${...} — inside a template literal those are
       evaluated as variables and the build dies. */
    .replace(/__CHROME_HEADER__/g, chrome.header)
    .replace(/__CHROME_MENU__/g, chrome.menu)
    .replace(/__CHROME_SOCIAL__/g, chrome.social)
    .replace(/__CHROME_FOOTER__/g, chrome.footer);

  const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interior pages — live content preview</title>

<!-- production stylesheets, in production order -->
${sheetTags}

<!-- THE RULE ITSELF. Linked, never copied — this is the file that
     gets pasted into the CSS Injector. -->
<!-- Chrome FIRST, interior second — the interior rule has to be able
     to answer the chrome rule that hides #block-doe-pagetitle.
     It wins on specificity now rather than on order, but loading them
     in the order they are meant to layer keeps the file honest. -->
<link rel="stylesheet" href="drupal-css-injector-chrome.css">
<link rel="stylesheet" href="interior-css-injector.css">

<style>
  /* harness chrome only — not deployed */
  /* Matches the live body, which our rule paints beige. */
  body { margin:0; background:#f2ece7; }
  .pv-bar { position:sticky; top:0; z-index:60; background:#182b3c; color:#fff;
            padding:11px 18px; display:flex; gap:16px; align-items:center; flex-wrap:wrap;
            font-family:system-ui,sans-serif; }
  .pv-bar strong { font-size:13px; letter-spacing:.05em; text-transform:uppercase; }
  .pv-bar select { font:inherit; font-size:13px; padding:6px 10px; border-radius:6px;
                   border:1px solid rgba(255,255,255,.25); background:#0f1e2a; color:#fff; max-width:520px; }
  .pv-bar label { font-size:12.5px; opacity:.85; display:flex; gap:6px; align-items:center; }
  .pv-meta { max-width:1240px; margin:16px auto 8px; padding:9px 16px; background:#fff;
             border-left:4px solid #42c3f7; border-radius:0 6px 6px 0;
             font:13px/1.5 system-ui,sans-serif; color:#35424e; }
  /* The stage is harness; #container and #content below are the
     theme's own and are left to the theme's own float layout. */
  /* FULL WIDTH. The stage capped everything at 1240px, so the header,
     menu and footer — which span the viewport on the real site and
     hold their own inner rail — were being squeezed into the content
     column's width. The theme's own #container / #content widths do
     the constraining; the harness does none. */
  .pv-stage { width:100%; margin:0 0 60px; background:transparent; padding:0; }
  .pv-stage #container { width:100%; }
  /* The footer runs to the bottom of the page like it does live. */
  .pv-stage #footer { margin-bottom:0; }
  .pv-nonav { font:12.5px system-ui,sans-serif; color:#8a97a3; border:1px dashed #cfd6dd;
              border-radius:8px; padding:12px; float:left; width:18%; box-sizing:border-box; }
  /* clearfix, because #content carries a floated nav and the theme's
     own clearfix rule may not reach this harness. */
  .pv-stage #content::after { content:''; display:table; clear:both; }

</style>
</head>
<!-- TWO content-type classes on purpose. The interior rule keys off
     page-node-type-multi-column-page and the chrome rule off
     page-node-type-home-page; a real interior page carries only the
     first, so the chrome rule would not match it today. Both are here
     so the whole page can be judged at once. Making it true in
     production is a scope change to the chrome rule, not something
     this preview decides. -->
<body class="page-node-type-multi-column-page page-node-type-home-page path-node">

<div class="pv-bar">
  <strong>Interior preview</strong>
  <select id="pick">${opts}</select>
  <label><input type="checkbox" id="wide"> narrow (mobile)</label>
  <span style="opacity:.6;font-size:12px">rule: interior-css-injector.css (linked)</span>
</div>

${panes}

<script>
  /* THE ACCORDION MODULE'S REWRITE — PREVIEW ONLY, AND NOT OPTIONAL.
     This started as a six-line click handler so the panels could be
     opened locally. That was not enough, and the gap cost a whole
     round on the live sandbox: ckeditor_accordion's frontend script
     does not just add behaviour, it REWRITES THE MARKUP on load.

         <dl class="ckeditor-accordion">      authored
         <dl class="styled">                  after the module runs

     — each <dl> wrapped in its own .ckeditor-accordion-container,
     and each <dt> rebuilt as

         <a class="ckeditor-accordion-toggler" href="#ID" id="ID">
           <span class="ckeditor-accordion-toggle"></span>Title</a>

     So every rule written against dl.ckeditor-accordion matched
     perfectly here and matched NOTHING in production. A preview that
     shows the authored markup rather than the rendered markup is not
     a preview of the page. This reproduces the transform exactly, so
     what is styled here is what a reader gets.

     Copied from the module's own output, verified against
     /doe/learning/multilinguallearner/services/sandbox/ml. */
  document.querySelectorAll('dl.ckeditor-accordion').forEach(function (dl) {
    var wrap = document.createElement('div');
    wrap.className = 'ckeditor-accordion-container';
    dl.parentNode.insertBefore(wrap, dl);
    wrap.appendChild(dl);
    dl.className = 'styled';
    dl.querySelectorAll(':scope > dt').forEach(function (dt) {
      var title = dt.textContent.trim();
      var id = title.toUpperCase().replace(/[^A-Z0-9]/g, '');
      dt.innerHTML = '<a class="ckeditor-accordion-toggler" href="#' + id + '" id="' + id
        + '" onclick="return false;"><span class="ckeditor-accordion-toggle"></span>' + title + '</a>';
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.ckeditor-accordion-toggler');
    if (!a) return;
    e.preventDefault();
    var dt = a.parentElement, dd = dt.nextElementSibling;
    var open = dt.classList.toggle('active');
    if (dd && dd.tagName === 'DD') dd.style.display = open ? 'block' : '';
  });

  var pick = document.getElementById('pick');
  function show(i) {
    document.querySelectorAll('.pv-page').forEach(function (s) { s.hidden = s.dataset.i !== String(i); });
    try { localStorage.setItem('pv-i', i); } catch (e) {}
  }
  pick.addEventListener('change', function () { show(pick.value); });
  /* The toggle still targeted .pv-cols, a class replaced by .pv-stage
     when the harness moved to the theme's real wrapper chain — so the
     checkbox had been doing nothing. It narrows the stage now, which
     is what makes sphone.css (max-width:651px) apply. */
  document.getElementById('wide').addEventListener('change', function (e) {
    document.querySelectorAll('.pv-stage').forEach(function (c) {
      c.style.maxWidth = e.target.checked ? '390px' : '';
      c.style.padding = e.target.checked ? '0' : '';
    });
  });
  /* DEMO: hide each page's own banner graphic once it has laid out.
     The text-level strip missed any image without a width attribute —
     Transportation's is sized by CSS — so the reliable test is the
     rendered box: the first image on a page, at least 600px wide and
     clearly letterbox. Real content photographs and card images are
     narrower or squarer and stay. */
  function hideBanners() {
    document.querySelectorAll('.pv-page').forEach(function (page) {
      var img = page.querySelector('#block-doe-content img');
      if (!img) return;
      var b = img.getBoundingClientRect();
      if (b.width >= 600 && b.width / Math.max(b.height, 1) >= 2.2 && !img.closest('.card')) {
        img.style.display = 'none';
      }
    });
  }
  window.addEventListener('load', function () { setTimeout(hideBanners, 400); });
  document.getElementById('pick').addEventListener('change', function () { setTimeout(hideBanners, 60); });

  var i = 0;
  try { i = localStorage.getItem('pv-i') || 0; } catch (e) {}
  if (!document.querySelector('.pv-page[data-i="' + i + '"]')) i = 0;
  pick.value = i; show(i);
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, RAW ? 'interior-preview-raw.html' : 'interior-preview.html'), out);

  /* ── THE DEPLOY BUILD ────────────────────────────────────────────
     interior-css-injector.css is the source: the reasoning lives in
     its comments and that is most of its 150KB. What goes into the
     CSS Injector is this stripped copy, because those comments would
     otherwise be downloaded by every visitor on every page.

     Generated here rather than by hand so the two can never drift —
     the deploy file is always the current source with the prose
     taken out, and it is rebuilt whenever the preview is.

     Comments are removed with a scanner rather than a regex, because
     a regex cannot tell a comment from the characters "/*" inside a
     string — and the data URIs in this file are full of punctuation. */
  {
    const src = fs.readFileSync(path.join(__dirname, 'interior-css-injector.css'), 'utf8');
    let outCss = '', i = 0, inStr = null;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (inStr) { outCss += c; if (c === inStr && src[i - 1] !== '\\') inStr = null; i++; continue; }
      if (c === '"' || c === "'") { inStr = c; outCss += c; i++; continue; }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
      outCss += c; i++;
    }
    outCss = outCss.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').replace(/^\n+/, '');
    const ver = (src.match(/Version: ([\w-]+)/) || [])[1] || '?';
    outCss = `/* Maine DOE interior pages — DEPLOY BUILD, generated from\n`
      + ` * interior-css-injector.css ${ver}. Do not edit this file: edit\n`
      + ` * the source and run  node build-interior-preview.js\n */\n` + outCss;
    fs.writeFileSync(path.join(__dirname, 'interior-css-injector.deploy.css'), outCss);

    /* WAF LINT. maine.gov 403s any Injector save containing a
       scheme-qualified address. The trap here is not an obvious http
       link — it is the xmlns inside an SVG data URI, which is why the
       colon in those is percent-encoded at source. Checked on every
       build so it cannot come back unnoticed. */
    const schemes = outCss.match(/(?<![\w.])https?:\/\/[^\s"')]+/g) || [];
    console.log(schemes.length
      ? `  WAF LINT FAILED — ${schemes.length} scheme-qualified address(es): ${[...new Set(schemes)].slice(0, 3).join(', ')}`
      : '  WAF lint: clean, safe to paste');
    /* And the scope lint: one unscoped selector would restyle the
       whole of maine.gov/doe. */
    const noComments = outCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = [...noComments.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/g)]
      .flatMap(m => m[1].split(',').map(x => x.trim()))
      .filter(x => x && !/^\d/.test(x) && !x.startsWith(':root')
        && !/^(html )?body\.page-node-type-multi-column-page/.test(x));
    console.log(bad.length
      ? `  SCOPE LINT FAILED — ${bad.length} unscoped: ${bad.slice(0, 3).join(' | ')}`
      : '  Scope lint: every selector is scoped to the content type');
    console.log(`interior-css-injector.deploy.css — ${(outCss.length / 1024).toFixed(1)}KB `
      + `(source ${(src.length / 1024).toFixed(1)}KB, ${Math.round(100 - outCss.length / src.length * 100)}% smaller)`);
  }
  console.log(`${RAW ? 'interior-preview-raw.html' : 'interior-preview.html'} written — ${(out.length / 1024).toFixed(1)}KB, ${built.length} real pages`);
  console.log(`  stylesheets linked from production: ${sheetTags.split('\n').length}`);
  console.log(`  with #sectionnav: ${built.filter(b => b.nav).length} of ${built.length}`);
})();
