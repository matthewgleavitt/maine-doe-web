#!/usr/bin/env node
/* Maine DOE — propose the new body HTML for a page
 * Version: 2026-09-22-b  ·  Last edited: 2026-09-22
 *
 *   const { propose } = require('./propose.js');
 *   const { html, notes, decisions } = propose(node, audit, index);
 *
 * Takes a page's current body and returns what it should become,
 * together with a list of the judgement calls that were made — so
 * the panel can show them and a person can overrule each one.
 *
 * TWO KINDS OF CHANGE, kept apart on purpose:
 *
 *   MECHANICAL   interior-cleanup.js. Provably lossless, applied
 *                without asking.
 *   PROPOSED     the banner, the description, the contents list, the
 *                section headings. Every one is a guess about meaning
 *                and every one is listed in `decisions` with what it
 *                did and why, defaulting to on but switchable off.
 *
 * Nothing here invents a word of content. The description is the
 * page's own opening paragraph, moved; the contents list is built
 * from headings that already exist.
 */
'use strict';
const { clean, textOf, FORMAT_ALT, FORMAT_WORDS, SIZE_RE, canonKey } = require('./interior-cleanup.js');

const strip = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const slug = t => t.toLowerCase().replace(/&[a-z]+;/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const norm = x => strip(x || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/* MEASURED IMAGE DIMENSIONS, keyed on the DECODED path. The markup
   writes a space as %20, the file list writes it as a space, and the
   two forms never matched until both sides went through here. */
const dec = u => { try { return decodeURIComponent(String(u || '')); } catch (e) { return String(u || ''); } };
const SIZES = (() => {
  try {
    const raw = require('./cache/image-sizes.json');
    const out = Object.create(null);
    for (const [u, v] of Object.entries(raw)) out[dec(u)] = v;
    return out;
  } catch (e) { return null; }
})();

/* HOW MANY LINES EACH PAGE TITLE TAKES, measured in a browser by
   measure-titles.js. The title band is a fixed height and CSS cannot
   count lines, so a band sized for the longest title left 65px of
   empty navy above the 803 titles that are one line. This is how the
   band learns which it is dealing with. Missing means one line. */
/* IMAGES THAT RETURN A 404, found by check-images.js. A broken image
   leaves a broken-icon and its alt text where a picture should be,
   which reads as a damaged page rather than a plain one. */
const BROKEN_IMAGES = (() => {
  try { return new Set(require('./cache/broken-images.json').map(u => {
    try { return decodeURIComponent(u); } catch (e) { return u; }
  })); } catch (e) { return new Set(); }
})();

const TITLE_LINES = (() => {
  try { return require('./cache/title-lines.json'); } catch (e) { return {}; }
})();


/* A REGEX CANNOT FIND THE END OF A COMPONENT, so this counts.
   The first attempt used /<div[^>]*class="[^"]*card[^"]*"\b.../ —
   and \b after a quote never matches, because " and > are both
   non-word characters, so the mask silently covered nothing and all
   392 pages stayed wrong. The second problem is real nesting: a
   card contains card-header and card-body, so a lazy </div> stops
   three divs early. Depth is counted instead. */
const componentSpans = (src) => {
  const spans = [];
  const open = /<div[^>]*class="[^"]*\b(?:contact-cube|card|dc-note|jumbotron)\b[^"]*"[^>]*>/gi;
  let m;
  while ((m = open.exec(src))) {
    let depth = 1, i = m.index + m[0].length;
    const tag = /<div\b[^>]*>|<\/div>/gi;
    tag.lastIndex = i;
    let t;
    while (depth > 0 && (t = tag.exec(src))) {
      depth += t[0][1] === '/' ? -1 : 1;
      i = t.index + t[0].length;
    }
    spans.push([m.index, depth === 0 ? i : src.length]);
    open.lastIndex = spans[spans.length - 1][1];
  }
  /* Accordion terms and panels cannot nest in this markup, and
     neither can a nav, so a lazy match is right for all three.
     THE NAV MATTERS: the contents list carries its own "On this page"
     heading, which labels the list rather than the page. It was being
     left alone only because the list is built after the transform
     that would have wrapped it — correct by accident, and one
     reordering away from a teal rule down the side of the contents
     list. Excluded on purpose now. */
  for (const x of src.matchAll(/<(dd|dt|nav)\b[\s\S]*?<\/\1>/gi)) spans.push([x.index, x.index + x[0].length]);
  return spans;
};

/* THE OUTLINE WALK, USED TWICE. Once before the transforms, so the
   levels the author wrote are sane, and once after them, because the
   transforms MAKE headings — a section unfolded out of an accordion,
   a run of questions lifted out of a panel — and a heading that is
   correct where it was written can be at the wrong depth once the
   thing above it has changed. Each heading ends up exactly one level
   below the nearest heading enclosing it.
   Headings inside a component are skipped: a card's title and the
   contact block's "Contact" label a thing on the page rather than a
   part of it. */
const rebuildOutline = (src) => {
  const spans = componentSpans(src);
  const inComponent = i => spans.some(([a, b]) => i >= a && i < b);
  const stack = [];
  let changed = 0, first = null;
  const out = src.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, n, attrs, inner, off) => {
    if (inComponent(off)) return m;
    const raw = +n;
    while (stack.length && stack[stack.length - 1].raw >= raw) stack.pop();
    /* CAPPED AT 3, WHICH IS A DECISION ABOUT THE SITE AND NOT ABOUT
       ANY PAGE. Matt: "I don't think we'd ever use anything beyond an
       H3." He is right — the page title is the h1, a section header
       is the h2, and a part of a section is the h3. There is no
       fourth thing on these pages; where a fourth level appeared it
       was an author reaching for a smaller typeface, not a deeper
       idea. 395 headings on 98 pages sat at h4 or below.
       Capping rather than shifting keeps the nesting that is real and
       flattens only what runs past the bottom: a genuine third level
       stays a third level, and a fourth becomes a sibling of it. That
       also closes the level skips for free — you cannot skip past a
       floor — which were 84 of them on 60 pages. */
    const lv = stack.length ? Math.min(3, stack[stack.length - 1].lv + 1) : 2;
    stack.push({ raw, lv });
    if (lv !== raw) { changed++; if (!first) first = { from: raw, to: lv, text: strip(inner).slice(0, 48) }; }
    return `<h${lv}${attrs}>${inner}</h${lv}>`;
  });
  return { html: out, changed, first };
};

/* REMOVING EMPTY ELEMENTS, USED IN TWO PLACES.
   Once immediately after a transform that takes content out of the
   middle of something, and once at the very end. The first matters
   more than it looks: lifting the questions out of a panel left an
   emptied <ul></ul> inside its <li>, and the NEXT transform along
   read that debris as a nested list and quietly declined to do its
   work. A transform has to leave the document in a state the one
   after it can understand. */
const tidyEmpties = (h) => {
  let prev;
  do {
    prev = h;
    h = h
      .replace(/<(p|li)\b[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/\1>/gi, '')
      .replace(/<h([1-6])\b[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/h\1>/gi, '')
      /* A SPACE, NOT NOTHING. An inline element holding only
         whitespace IS a space in the rendered line, so deleting it
         joins the words either side of it. On /data-reporting/
         warehouse the site writes a link's separator as
         "</strong>-<strong>&nbsp;</strong>Participating schools",
         and removing the second <strong> left "-Participating" — the
         dash stopped being a separator and became a prefix on the
         first word of the description. */
      .replace(/<(strong|em|span|u)\b[^>]*>(?:&nbsp;|\s)*<\/\1>/gi, ' ')
      .replace(/<(ul|ol)\b[^>]*>(?:\s|&nbsp;)*<\/\1>/gi, '')
      /* AND A CONTAINER THE TRANSFORMS EMPTIED. interior-cleanup.js
         removes every empty div on the way in; these are not
         survivors, they are made here. Lifting a paragraph into the
         banner leaves the callout it was sitting in — and a .dc-note
         with nothing in it is not invisible, it is a navy bar across
         the page with no words on it. On
         /schools/safeschools/counseling/highmobility/homelessed/
         statepilot that is exactly what was left behind, and 24
         pages carried one. */
      .replace(/<div\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '')
      /* AND THE HAND-DRAWN RULES, AGAIN. interior-cleanup.js removes
         an <hr> sitting above a heading, and it still got through:
         removing the duplicate call-to-action paragraph brought a
         second one up against the first, after cleanup had finished.
         The same sweep has to run on what the transforms leave. */
      .replace(/(?:\s*<hr\s*\/?>)+(\s*)(?=<div[^>]*class="[^"]*\bblockhead\b|<h[1-6]\b)/gi, '$1')
      .replace(/(<hr\s*\/?>)(\s*<hr\s*\/?>)+/gi, '$1')
      /* AND LINE BREAKS STRANDED AT THE EDGE OF A BLOCK.
         interior-cleanup.js removes these and measured none left, and
         yet /numeracy still opened with two. They were not survivors:
         the transforms MAKE them. That page writes its banner and its
         landing picture in one paragraph with two breaks between
         them — the breaks are in the middle, so the cleanup was right
         to leave them — and then the banner graphic above them is
         retired here, which leaves the two breaks leading the block.
         Every transform that removes something from the front of a
         block can do this, so it is swept here rather than guarded
         one rule at a time. */
      .replace(/(<(?:p|li|td|th|div|h[1-6]|dd|dt|blockquote)\b[^>]*>)((?:\s|&nbsp;)*)(?:<br\s*\/?>(?:\s|&nbsp;)*)+/gi, '$1$2')
      .replace(/(?:(?:\s|&nbsp;)*<br\s*\/?>)+((?:\s|&nbsp;)*)(<\/(?:p|li|td|th|div|h[1-6]|dd|dt|blockquote)>)/gi, '$1$2');
  } while (h !== prev);

  /* A COLUMN THAT HAS BEEN EMPTIED IS STILL HOLDING ITS SHARE OF THE
     ROW, AND THAT IS THE HALF-PAGE OF NOTHING ON /MTSS.
     Removing the broken framework graphic did exactly what it was
     asked to do and stopped there: <div class="col-sm-6"></div> was
     left behind, so the overview heading and its two paragraphs went
     on sitting in half the width with the other half blank. Deleting
     something is not finished until the space it occupied is gone
     too.
     The column goes, and then the row is re-shared — because the
     author's widths were chosen for a column that no longer exists.
     ONLY ROWS THIS ACTUALLY CHANGED are re-shared. A row nobody
     touched may be narrow on purpose, and that is the author's call;
     a row that has just lost a column has had its arithmetic broken
     by us, so putting it right is ours. */
  let rowsFixed = 0;
  do {
    prev = h;
    /* GLOBAL. Written without the g flag this replaced only the
       FIRST column in the document — which is almost never the empty
       one — handed it back unchanged, and so the loop saw no
       difference and stopped on its first pass. Four empty columns
       survived on four pages and the rule looked like it worked
       because /MTSS happened to have its empty column first. */
    h = h.replace(/<div([^>]*\bclass="[^"]*\bcol-[a-z]+-\d+[^"]*"[^>]*)>([\s\S]*?)<\/div>/gi, (m, attrs, inner) => {
      if (/<div\b/i.test(inner)) return m;                       // not the innermost
      if (inner.replace(/&nbsp;|<br\s*\/?>|\s/gi, '')) return m;   // it still holds something
      rowsFixed++; return '';
    });
  } while (h !== prev);

  if (rowsFixed) {
    h = h.replace(/(<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>)([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi,
      (m, open, body) => {
        const cols = [...body.matchAll(/class="[^"]*\bcol-[a-z]+-(\d+)/g)].map(x => +x[1]);
        if (!cols.length || cols.reduce((a, b) => a + b, 0) >= 12) return m;
        const base = Math.floor(12 / cols.length);
        let extra = 12 - base * cols.length, k = 0;
        return open + body.replace(/class="([^"]*)\bcol-([a-z]+)-\d+/g,
          (mm, pre, bp) => `class="${pre}col-${bp}-${base + (k++ < extra ? 1 : 0)}`);
      });
  }
  return h;
};

function propose(node, audit, index, opts = {}) {
  const decisions = [];
  const notes = [];
  /* Text this function deliberately removes, so the loss check can
     tell an intentional deletion from an accidental one. Every entry
     here corresponds to a decision listed below, shown in the panel
     and switchable off — which is the only reason it is allowed to
     be exempt. */
  const removedOnPurpose = [];
  /* Declared here, at the top, because the steps that fill them run
     long before the banner is assembled — and a const declared beside
     the banner code sits in the temporal dead zone for every one of
     them. */
  const joined = [];          // text this file MERGED, declared to the check
  let pageCta = null;         // a call to action taken off the page itself
  let html = node.body;

  /* ── 1. MECHANICAL ──────────────────────────────────────────── */
  const c = clean(html);
  if (c.lost) return { html: node.body, notes: ['BLOCKED: cleanup would change text — not safe to propose'], decisions, blocked: true };
  html = c.html;
  const mechanical = c.log;

  /* ── 1a-0. A SECTION THE PAGE'S OWNER HAS ASKED TO REMOVE ────
     The only step here that deletes words, and the only one that can
     never fire on its own: it does nothing unless overrides.json
     names the section, page by page, in Matt's own words. Nothing is
     inferred and no pattern triggers it.
     That is deliberate. Everything else in this file rearranges,
     relabels or restyles what an author wrote, and the content check
     at the end proves not a word was lost. This one removes content,
     so the instruction has to come from the person who owns the page
     — which is why it lives in the overrides file, survives every
     rebuild, and appears in the panel with the text it took out.
     /learning/standards/career is the first: a "News" section whose
     entire content is one link to a blog post from January 2023.
     The section runs to the next section header, the contact block,
     or the end of the page, whichever comes first. */
  if (opts.dropSection) {
    for (const name of [].concat(opts.dropSection)) {
      const want = String(name).replace(/\s+/g, ' ').trim().toLowerCase();
      const heads = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?blockhead(?:\s[^"]*)?"[^>]*>\s*<h([1-6])[^>]*>([\s\S]*?)<\/h\1>\s*<\/div>/gi)];
      const hit = heads.find(h => strip(h[2]).replace(/\s+/g, ' ').trim().toLowerCase() === want);
      if (!hit) continue;
      const after = hit.index + hit[0].length;
      const rest = html.slice(after);
      const nextAt = rest.search(/<div[^>]*class="(?:[^"]*\s)?(?:blockhead|contact-cube)(?:\s[^"]*)?"/i);
      const end = nextAt < 0 ? html.length : after + nextAt;
      const cut = html.slice(hit.index, end);
      /* Declared in full, so the content check reports a deliberate
         removal rather than a loss — and the panel can show it. */
      for (const b of cut.split(/<\/(?:p|li|h[1-6]|div|td)>/i)) {
        const t = strip(b);
        if (t) removedOnPurpose.push(t);
      }
      html = html.slice(0, hit.index) + html.slice(end);
      decisions.push({ id: 'drop-' + slug(strip(hit[2])), on: true,
        label: `Remove the "${strip(hit[2])}" section`,
        removes: strip(cut.slice(hit[0].length)).slice(0, 200),
        why: 'Asked for by name in overrides.json for this page. Nothing here infers it — this is the one step that removes content, so it only ever does what it has been told to do, page by page.' });
    }
  }

  /* ── 1a-0b. A LINE THE PAGE'S OWNER HAS ASKED TO REMOVE ──────
     The sentence-sized companion to dropSection, and held to the same
     rule: it does nothing at all unless overrides.json names the text,
     page by page. No pattern triggers it and nothing is inferred.
     /pathways is the first — an italic line under a button that
     repeats what the button already says. */
  if (opts.dropText) {
    for (const want of [].concat(opts.dropText)) {
      const needle = String(want).replace(/\s+/g, ' ').trim().toLowerCase();
      /* ONE PASS PER TAG, INNERMOST FIRST. A single alternation
         scanning left to right matches the outer <p> and consumes the
         <em> inside it, so the <em> never gets its own comparison —
         and on /pathways the line to remove is exactly that <em>.
         em before p before the containers, so the smallest element
         holding the text is the one that goes. */
      let hit = null;
      for (const tag of ['em', 'strong', 'p', 'li', 'div']) {
        const re = new RegExp('<' + tag + '\\b[^>]*>((?:(?!<' + tag + '\\b)[\\s\\S])*?)<\\/' + tag + '>', 'gi');
        for (const m of html.matchAll(re)) {
          if (strip(m[1]).replace(/\s+/g, ' ').trim().toLowerCase() === needle) { hit = [m[0], m[1]]; break; }
        }
        if (hit) break;
      }
      if (!hit) continue;
      /* DECLARED PIECE BY PIECE, SPLIT ON <br>. The check counts a
         line break as a block boundary, so a sentence written across
         two lines is two blocks — and declaring the whole thing as
         one string matches neither of them. The deck does the same
         where it joins a broken line; this is the mirror of it. */
      for (const piece of hit[1].split(/<br\s*\/?>/i)) {
        const t = strip(piece);
        if (t) removedOnPurpose.push(t);
      }
      html = html.replace(hit[0], '');
      decisions.push({ id: 'droptext-' + slug(strip(hit[1]).slice(0, 30)), on: true,
        label: 'Remove a line asked for by name',
        removes: strip(hit[1]),
        why: 'Named in overrides.json for this page. Like the section version, this is one of only two steps here that remove words, and it only ever removes the exact text it has been given.' });
    }
  }

  /* ── 1a-1. A HEADING THAT IS REALLY A CALLOUT ────────────────
     "Your Maine Department of Education Actively Supports LGBTQ+
     Student Success!" opens /lgbtq/student as an <h4> carrying
     class="jumbotron jumbotronfluid text-align-center".
     It is not a heading. It is a statement, and the author reached
     for a heading tag because a heading is big — which is the common
     habit of using an H to make text larger. The cost is real: a
     screen reader announces it as a section of the page, it lands in
     the outline as a level, and the sectioning step then promotes it
     to an h2 section header, so a slogan becomes the page's first
     section.
     THE CLASS IS THE AUTHOR TELLING US WHAT THEY MEANT, the same way
     class="card-title" on a <class> element was. Nobody puts
     jumbotron on a heading to make it a heading; they put it there to
     make it a box. So it becomes the box it was asking to be — a
     dc-note, which is the site's own callout — and the words are
     untouched.
     RUNS BEFORE SECTIONING, because every later step reads the page's
     headings and this one should never have been counted among them. */
  if (opts.headnote !== false) {
    let n = 0;
    html = html.replace(/<h([1-6])\b([^>]*class="[^"]*\b(?:jumbotron|jumbotronfluid|alert|well)\b[^"]*"[^>]*)>([\s\S]*?)<\/h\1>/gi,
      (m, lvl, attrs, inner) => {
        if (/<(?:p|div|ul|ol|table)\b/i.test(inner)) return m;
        n++; return `<div class="dc-note"><p>${inner.trim()}</p></div>`;
      });
    if (n) decisions.push({ id: 'headnote', on: true, label: 'Let a statement be a callout, not a heading',
      why: `${n} heading${n > 1 ? 's carry' : ' carries'} a callout class — jumbotron, alert or well — which nobody adds to make something a heading; they add it to make it a box. Set as a heading it is announced as a section of the page and counted into the outline, so a statement becomes a section. It becomes the callout it was asking to be. Not a word changes.`,
      value: n + ' heading' + (n > 1 ? 's' : '') });
  }

  /* ── 1a-2. TABS ON A PAGE SHORT ENOUGH NOT TO NEED THEM ───────
     26 pages use the tab component and most of them should keep it:
     eight weeks of a unit, or four years of memos, are parallel sets
     where you read one at a time and tabs are exactly right.
     But a SHORT page whose tabs are topics is a contents list drawn
     as a control. /mtss/accelerated/resources is 2,966 characters —
     three screens in total — split across Laws & Rules,
     Identification and Professional Learning, so two thirds of a page
     you could have scrolled past in seconds is hidden behind a click,
     none of it is findable with the browser's own find, and none of
     it prints. The contents list in the banner already does the
     jumping, and it does it without hiding anything.

     TWO CONDITIONS, BOTH CONSERVATIVE.
     Every panel must already carry its own section header — then
     unwrapping produces real sections and nothing has to be invented
     or renamed. And the whole page must be short: a long page really
     does benefit from being broken up, which is why /mtss/teams at
     25,723 characters keeps its tabs.
     Nothing moves and nothing is renamed. The panels come out in the
     order they were in, and the headings they already had become the
     page's sections — which also means they are counted into the
     contents list, which the tab labels never were. */
  if (opts.untab !== false && /\btab-content\b/.test(html)) {
    const textLen = strip(html).length;
    const panels = [];
    for (const m of html.matchAll(/<div[^>]*class="(?:[^"]*\s)?tab-content(?:\s[^"]*)?"[^>]*>/gi)) {
      let d = 1, i = m.index + m[0].length;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
      while (d > 0 && (x = t.exec(html))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
      panels.push([m.index, i, html.slice(m.index + m[0].length, i - 6)]);
    }
    /* AND THE LABEL HAS TO BE THE HEADING. If a tab is called
       "Laws & Rules" and the panel behind it opens with a section
       header reading "Laws & Rules", the label is a second copy of
       the heading and removing the strip loses no words at all. If
       they differ, the label is carrying something the page would
       lose, so the tabs stay. */
    const labels = [...html.matchAll(/<button[^>]*class="[^"]*tab-button[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)]
      .map(m => strip(m[1]).replace(/\s+/g, ' ').trim());
    const headOf = (pp) => {
      const m = pp.match(/<div[^>]*class="(?:[^"]*\s)?blockhead(?:\s[^"]*)?"[^>]*>\s*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
      return m ? strip(m[1]).replace(/\s+/g, ' ').trim() : null;
    };
    const everyPanelTitled = panels.length > 1 &&
      labels.length === panels.length &&
      panels.every((pp, i) => {
        const hd = headOf(pp[2]);
        if (!hd) return false;
        /* CONTAINED, NOT IDENTICAL. A label is often the heading
           shortened to fit on a button — "Identification" for a panel
           headed "Identification of Accelerated Learners" — and that
           label says nothing the heading does not. Requiring them to
           be the same word for word refused the one page this was
           written for. */
        const a = hd.toLowerCase(), b = labels[i].toLowerCase();
        return a.includes(b) || b.includes(a);
      });
    if (everyPanelTitled && textLen < 8000) {
      /* The whole component, from .lesson-tabs to its close. */
      const open = html.match(/<div[^>]*class="(?:[^"]*\s)?lesson-tabs(?:\s[^"]*)?"[^>]*>/i);
      if (open) {
        let d = 1, i = open.index + open[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(html))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        const body = panels.map(pp => pp[2].trim()).join('\n');
        /* The strip of labels is the one thing that goes, and every
           word on it is still on the page as the section header it
           was repeating. Declared, so the loss check can see that. */
        removedOnPurpose.push(labels.join(' '));
        html = html.slice(0, open.index) + body + html.slice(i);
        decisions.push({ id: 'untab', on: true, label: 'Let a short page be one page',
          why: `This page is ${textLen.toLocaleString()} characters — a few screens — split across ${panels.length} tabs, so most of it is hidden behind a click, none of it can be found with the browser's own search and none of it prints. Every tab already has its own section header, so they simply become the page's sections and the contents list picks them up. Nothing is renamed and nothing moves.`,
          value: panels.length + ' tabs' });
      }
    }
  }

  /* ── 1b. SECTIONING ─────────────────────────────────────────────
     Runs before everything else, because every later step reads the
     page's headings: the title echo looks for a blockhead, the
     contents list is built from h2s inside one, and the anchors hang
     off the same elements. A page whose sections are written as h5s
     is invisible to all of it.

     THREE TRANSFORMS, EACH SWITCHABLE, NONE OF WHICH TOUCHES A WORD.

     They are separate decisions because they carry different risk.
     Lifting the levels and wrapping the h2s are mechanical — the
     markup is wrong about structure the page already has. Promoting a
     bold paragraph is a judgement about what the author meant, and it
     is the one that can be wrong. */

  /* Containers where bold text is a label, not a heading. A table's
     cells, a list's items, an accordion's terms. Masked out with
     spaces so offsets into the real string still line up. */
  /* An opening that tells the reader who to ask rather than saying
     what the page is. Used by the deck rule to refuse it, and by the
     contact-block rule to claim it. */
  const CONTACT_LEAD = /^\s*(?:if you have (?:any )?questions|for (?:more |further )?(?:information|questions)|questions\b|please contact|to contact|contact (?:us|a member|the))/i;
  const maskLabels = s => s.replace(/<(table|ul|ol|dt|figure)\b[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));

  /* (a) REBUILD THE OUTLINE.
     Two faults, one cause. 242 pages START too deep — 42 of them at
     h5 — so a screen reader announces the page's own sections as
     sub-sub-sub-headings of nothing. And 46% SKIP a level somewhere
     in the middle: /schoolsupports/climate/restraintandseclusion runs
     h2 then h4, so "Changes to Definition of Terms" is a fourth-level
     heading with no third level above it. It is not styled like a
     sub-section because it is not one — the markup says it belongs to
     a level that does not exist.

     Shifting every heading by a fixed amount fixed the first fault
     and not the second. Walking the headings with a stack fixes both:
     each heading becomes exactly one level deeper than the nearest
     heading that encloses it, so the nesting the author wrote is
     preserved and the gaps close. Only the numbers change. */
  /* Component spans — see componentSpans above. */
  /* HEADINGS THAT BELONG TO A COMPONENT ARE NOT PART OF THE PAGE'S
     OUTLINE. The contact block's own "Contact", a card's title, an
     accordion's term — each is the label of a thing on the page, not
     a section of it. Counted as sections, the contact heading was
     pushed to h2 and then wrapped in a section rule, which put a navy
     slab inside the navy contact block on 392 pages. */
  const spans = componentSpans(html);
  const inComponent = i => spans.some(([a, b]) => i >= a && i < b);

  /* (a-0) A HEADING THAT IS A PARAGRAPH.
     Matt: "nothing should be 100 characters and in any sort of
     heading. People used the H to make things bigger or misused them
     when they should've been p."
     61 of them across 37 pages, median 175 characters and the
     longest 1,000. They are not long titles — they are a list of
     filenames on /funding/accounting/handbook/uploadfiles, a whole
     contact block squeezed into one heading on /schools/eut/policies/
     families, four sentences of preamble on /learning/II/PL/lit&neur.
     None is a heading by any reading; each is body text that was set
     as a heading to make it stand out.

     IT MATTERS MORE THAN IT LOOKS, because 27 of the 61 are h2 — the
     level this file builds the contents list from. A 375-character
     section title becomes a 375-character line in the list of links
     at the top of the page, and a screen reader announces it as a
     section of the document.

     A QUESTION IS EXEMPT whatever its length. The FAQ rule promotes
     questions to headings on purpose, and a long question is still a
     question. None of the 61 ends in a question mark today, so the
     guard costs nothing now and stops this rule fighting that one
     later.

     THE id SURVIVES. An anchor may already be linked to from the
     contents list or from another page, so the paragraph keeps it and
     the link still lands. Not a word changes; only the tag. */
  if (opts.longhead !== false) {
    let n = 0, first = null, longest = 0;
    html = html.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, lv, attrs, inner) => {
      const t = strip(inner);
      if (t.length <= 100) return m;
      if (/\?\s*$/.test(t)) return m;
      n++; longest = Math.max(longest, t.length);
      if (!first) first = t.slice(0, 56);
      const id = (attrs.match(/\sid="[^"]*"/i) || [''])[0];
      return `<p${id}>${inner}</p>`;
    });
    if (n) decisions.push({ id: 'longhead', on: true, label: 'Set an over-long heading as the paragraph it is',
      why: `${n} heading${n > 1 ? 's run' : ' runs'} past 100 characters — the longest here is ${longest}. "${first}…" is body text that was set as a heading to make it stand out, so it is announced as a section of the page and, at h2, written into the contents list as a link. It becomes a paragraph. Any anchor on it is kept, so existing links still land, and not a word changes.`,
      value: n + ' heading' + (n > 1 ? 's' : '') });
  }

  if (opts.outline !== false) {
    const o = rebuildOutline(html);
    html = o.html;
    const changed = o.changed, first = o.first;
    if (changed) {
      decisions.push({ id: 'outline', on: true, label: 'Rebuild the heading outline',
        why: `${changed} heading${changed > 1 ? 's sit' : ' sits'} at a level the page never opens — "${first.text}" is an h${first.from} with no h${first.from - 1} above it, so it is neither announced nor styled as the sub-section it is. Each heading moves to one level below whatever encloses it.`,
        value: `h${first.from} → h${first.to}` });
    }
  }

  /* (b) A BOLD PARAGRAPH STANDING IN FOR A HEADING.
     714 of these exist. Most are not headings at all — they are form
     labels, table captions and list markers — so the test is
     deliberately strict and lets the doubtful ones through untouched:
       · not inside a table, list, accordion term or figure
       · 2 to 12 words, no terminal punctuation, no "(1)" marker
       · followed by a block, not by another bold label
       · at least 120 characters of content beneath it
     That takes 714 down to 232. A label that survives all five is
     visible in the panel as its own decision. */
  if (opts.pseudo !== false) {
    const mk = maskLabels(html);
    /* THE CAPTURE IS BOUNDED SO IT CANNOT CONTAIN ITS OWN CLOSING
       TAG, and a trailing &nbsp; no longer disqualifies a paragraph.
       Written lazily as [\s\S]*? the group backtracks straight past
       </strong></p> when the paragraph ends "…</strong>&nbsp;</p>",
       and runs on to the NEXT bold paragraph's closer — so on
       /learning/esea/titleIV/snapshot one stray &nbsp; ate the
       heading under it, the swollen match was thrown out by the
       guard below, and the page reported that it had no headings to
       promote when it had three. */
    const marks = [...mk.matchAll(/<p[^>]*>\s*<strong>((?:(?!<\/strong>)[\s\S])*)<\/strong>(?:\s|&nbsp;)*<\/p>|<h[1-6]\b/gi)];
    const lv = /<h2\b/i.test(html) ? 3 : 2;
    const promote = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (m[1] === undefined) continue;                       // a real heading, just a boundary
      /* THE CAPTURE MUST BE ONE PIECE OF BOLD TEXT AND NOTHING ELSE.
         The lazy group backtracks across a closing tag, so
         "<p><strong>Address</strong><br>Street</p>" matched with
         "Address</strong><br>Street" inside — and promoting that to a
         heading fused two blocks of text into one, which is a loss.
         It cost /cds/childfindform three blocks and
         /schools/nutrition/programs/fd two. */
      if (/<br|<\/strong|<\/?p\b/i.test(m[1])) continue;
      const t = strip(m[1]), w = t.split(/\s+/).length;
      if (t.length < 4 || t.length > 80 || w < 2 || w > 12) continue;
      if (/[;.!?,]$/.test(t) || /^[([]?\s*\d+[).\]]/.test(t)) continue;
      const next = mk.slice(m.index + m[0].length).trim();
      const nextRaw = html.slice(m.index + m[0].length).trim();
      /* CHECKED AGAINST THE REAL MARKUP AS WELL AS THE MASKED COPY.
         Masking blanks every table, so a bold line whose table is the
         LAST thing on the page has nothing after it to look at and
         fails the "followed by a block" test — which is how
         "Immigrant Children and Youth Subgrant" stayed a paragraph
         on /learning/esea/titleIII/snapshot while its three siblings
         became headings. A table is a block; the mask is there to
         stop bold text INSIDE a table being read as a heading, not
         to hide the table from the line above it. */
      if (!/^<(p|ul|ol|table|div|dl)/i.test(next) && !/^<(p|ul|ol|table|div|dl)/i.test(nextRaw)) continue;
      /* A TRAILING COLON IS HOW A WORD DOCUMENT WRITES A HEADING.
         The colon used to disqualify a line outright, to stop
         "Please note:" becoming a section of the page. But
         /learning/esea/titleIV/snapshot names all three of its
         sections that way — "Safe & Healthy Student Programming:" —
         each one a bold line with a table under it, and the guard
         threw away every heading the page had.
         The difference is what comes next. A lead-in with a colon
         introduces the sentence or the list right after it and reads
         as part of it; a heading with a colon has a TABLE or a whole
         section under it. So a colon is allowed only in front of a
         table, and only when the line is bold from end to end. */
      /* Tested against the real html, not the masked copy — masking
         blanks every table, so "is a table next" is always false
         there and the exception could never fire. */
      const nextReal = html.slice(m.index + m[0].length).trim();
      if (/:$/.test(t) && !/^<table/i.test(nextReal)) continue;
      const end = marks[i + 1] ? marks[i + 1].index : html.length;
      /* A HEADING MAY BE FOLLOWED BY ANOTHER HEADING. The 120-
         character floor is there to stop a bold line with nothing
         under it becoming a section, and it was measuring to the
         NEXT bold line — so a section title sitting directly above
         its first subsection measured zero and was rejected.
         "Title-Specific Expenditures" is the whole middle of this
         page and it failed on that. If the next mark is itself a
         candidate, the content under this one is that subsection's,
         so the floor does not apply. */
      const nextIsHeading = marks[i + 1] && marks[i + 1][1] !== undefined;
      if (!nextIsHeading) {
        if (strip(html.slice(m.index + m[0].length, end)).length < 120) continue;
      } else {
        /* A HEADING MAY SIT DIRECTLY ABOVE ITS FIRST SUBHEADING, so
           measuring only as far as the next bold line rejects every
           parent section on the page — "Title-Specific Expenditures"
           has its three subsections and their tables underneath and
           measured zero.
           MEASURED TO THE END OF THE PAGE INSTEAD, which is the test
           that still throws out the thing this floor exists for: the
           run of bold lines that closes this document is "Maine
           Department of Education / Office of ESEA Federal Programs
           / (207) 624-6705", and each one has less than 120
           characters after it because there is nothing after it but
           the rest of the address. */
        if (strip(html.slice(m.index + m[0].length)).length < 120) continue;
      }
      if (inComponent(m.index)) continue;          // a component's own label
      /* HOW DEEP IT SITS, read off the way Word wrote it. A pasted
         document centres its section titles and left-aligns the
         subsections under them — this page centres "Title-Specific
         Expenditures" and left-aligns the three programme areas it
         contains. Flattening all of them to one level would say the
         tables are four unrelated sections. */
      const centred = /align="center"|text-align:\s*center/i.test(html.slice(m.index, m.index + m[0].length));
      promote.push({ tag: html.slice(m.index, m.index + m[0].length), inner: m[1].trim(), text: t, centred });
    }
    const anyCentred = promote.some(x => x.centred);
    for (const p of promote) {
      if (!html.includes(p.tag)) continue;
      const lvl = anyCentred && !p.centred ? Math.min(lv + 1, 6) : lv;
      /* The inner markup, not the stripped text — a bold line can
         carry a link or an <em> and those have to survive. */
      html = html.replace(p.tag, `<h${lvl}>${p.inner}</h${lvl}>`);
      decisions.push({ id: 'pseudo:' + slug(p.text), on: true,
        label: 'Make a bold line a real heading',
        why: `"${p.text}" is a paragraph in bold type. It reads as a heading and is spaced like one, but it is not in the page's outline, a screen reader does not announce it, and the contents list cannot link to it.`,
        value: `h${lvl}` });
    }
  }

  /* (c) WRAP A BARE h2 IN A SECTION HEADER.
     314 h2s on 130 pages sit outside a .blockhead, which is the
     component every other page uses — so the same level of heading
     looks like a section on one page and like bold text on the next.
     Wrapping is what makes a page look sectioned rather than
     continuous, and it is what the contents list reads. */
  if (opts.blockhead !== false) {
    const bare = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)]
      .filter(m => !/<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*$/i.test(html.slice(Math.max(0, m.index - 160), m.index)))
      /* Never inside a contact block, a card, a note or an accordion
         panel — a section rule the width of the column, drawn inside
         a component, is a navy slab inside a navy slab. */
      .filter(m => !inComponent(m.index));
    /* Back to front, so replacing one does not move the next one's
       offset out from under it. */
    for (const m of bare.reverse()) {
      html = html.slice(0, m.index) + '<div class="blockhead">' + m[0] + '</div>' + html.slice(m.index + m[0].length);
    }
    if (bare.length) {
      decisions.push({ id: 'blockhead', on: true, label: 'Turn the headings into section headers',
        why: `${bare.length} heading${bare.length > 1 ? 's are' : ' is'} plain text where every other page uses a section header, so the page reads as one continuous wall instead of parts.`,
        value: bare.length + ' section' + (bare.length > 1 ? 's' : '') });
    }
  }

  /* (c2) A HEADING THAT IS ONLY A LINK IS NOT A HEADING.
     40 of them. "Comparison of International & National Assessments"
     on /Testing_Accountability/MECAS/materials/natint is an h2 whose
     whole content is a link to a PDF — so the contents list offers to
     jump to a section that is really a document, and the reader is
     given a navy section rule where they wanted a download. It
     becomes the button it already was. */
  const promoted = [];
  if (opts.headingLinks !== false) {
    for (const m of [...html.matchAll(/(<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*)?<h([1-6])\b[^>]*>\s*(<a\b[^>]*>[\s\S]*?<\/a>)\s*<\/h\2>(\s*<\/div>)?/gi)]) {
      if (strip(m[0]) !== strip(m[3])) continue;          // more than the link inside
      if (!!m[1] !== !!m[4]) continue;                    // half a wrapper, leave it alone
      if (inComponent(m.index)) continue;
      const label = strip(m[3]);
      html = html.replace(m[0], `<p class="doe-cta">${m[3].replace(/<a\b/i, '<a class="btn-cta"')}</p>`);
      promoted.push({ label, href: (m[3].match(/href="([^"]*)"/i) || [])[1] });
      decisions.push({ id: 'headinglink:' + slug(label), on: true,
        label: 'Turn a heading that is only a link into a button',
        why: `"${label.slice(0, 52)}" is written as a section heading but its whole content is a link, so the contents list offers to jump to a section that is really a document.`,
        value: 'button' });
    }
  }

  /* (c3) AN EMPTY HEADING. 12 of them — a heading element with no
     text, left behind when someone deleted the words but not the
     tag. A screen reader announces "heading, blank". */
  if (opts.emptyHeadings !== false) {
    const empties = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .filter(m => !strip(m[2]) && !/<img/i.test(m[2]));
    for (const m of empties.reverse()) html = html.replace(m[0], '');
    if (empties.length) decisions.push({ id: 'emptyheads', on: true,
      label: 'Remove empty headings',
      why: `${empties.length} heading${empties.length > 1 ? 's have' : ' has'} no text — a screen reader announces "heading, blank" and the contents list would offer an unnamed section.`,
      value: empties.length + ' removed' });
  }

  /* (c4) THE CONTACT BLOCK'S OWN SHAPE. 33 blocks hold their names
     and numbers as bare text and <br> straight inside the div, which
     the old editor produced and which nothing can style. Wrapped in
     the paragraph the pattern asks for. No word changes and the <br>
     line breaks are kept exactly as written. */
  if (opts.contactShape !== false) {
    for (const [a, b] of componentSpans(html)) {
      const block = html.slice(a, b);
      if (!/class="[^"]*contact-cube/.test(block)) continue;
      const open = block.match(/^<div[^>]*>/);
      if (!open) continue;
      const inner = block.slice(open[0].length, block.lastIndexOf('</div>'));
      /* Only the run of loose text AFTER the last real block. */
      const lastTag = inner.lastIndexOf('>');
      const m = inner.match(/(?:<\/(?:h[1-6]|p|ul|ol|table|hr|div)>|^)([\s\S]*)$/);
      if (!m || strip(m[1]).length < 20) continue;
      if (/<(p|div|ul|ol|table)\b/i.test(m[1])) continue;
      const wrapped = inner.slice(0, inner.length - m[1].length) + '\n<p>' + m[1].trim() + '</p>\n';
      html = html.slice(0, a) + open[0] + wrapped + '</div>' + html.slice(b);
      decisions.push({ id: 'contactshape', on: true,
        label: 'Put the contact details in a paragraph',
        why: 'The names and numbers sit as loose text directly inside the contact block, which is what the old editor left and what nothing can space or style.',
        value: 'wrapped' });
      break;                                   /* offsets move; one per pass is enough */
    }
  }

  /* (c5) "MDOE". The brand guide says the department is the Maine
     Department of Education on first reference and the Maine DOE
     after — never MDOE. 18 of them on 9 pages. This is the only
     wording change made without being asked for a specific page, and
     it is made because it is a rule rather than a preference. */
  if (opts.mdoe !== false) {
    const n = (strip(html).match(/\bMDOE\b/g) || []).length;
    if (n) {
      html = html.replace(/\bMDOE\b/g, 'Maine DOE');
      removedOnPurpose.push('MDOE');
      decisions.push({ id: 'mdoe', on: true, label: 'MDOE → Maine DOE',
        why: `The brand guide does not allow "MDOE". ${n} occurrence${n > 1 ? 's' : ''} on this page.`,
        value: n + ' changed' });
    }
  }

  /* (c6) A RUN OF QUESTIONS AND ANSWERS IS AN ACCORDION.
     /learning/earlychildhood/publicpreschool/monitoring keeps seven
     of them as a nested bullet list inside one accordion panel, under
     a line that introduces them. So the reader opens "About the
     CLASS Interactions and Environments Observation Tool", scrolls
     past a long paragraph, and finds fourteen bullets alternating
     question and answer — a structure the page already has and the
     markup does not express.
     The introducing line becomes the section header it reads as, and
     each question becomes a panel of its own. Every word is kept
     exactly as written, including the "Q:" and "A:" markers: those
     are the author's, not ours to remove.
     Fires on two pairs or more, so an isolated "Q:" in prose is never
     mistaken for a list of them. */
  if (opts.faq !== false) {
    const LI = /<li\b[^>]*>((?:(?!<li\b)[\s\S])*?)<\/li>/gi;
    const items = [...html.matchAll(LI)];
    let run = null;
    for (let i = 0; i + 1 < items.length; i++) {
      if (!/^Q\s*[:.]/i.test(strip(items[i][1])) || !/^A\s*[:.]/i.test(strip(items[i + 1][1]))) continue;
      let j = i;
      while (j + 1 < items.length
             && /^Q\s*[:.]/i.test(strip(items[j][1]))
             && /^A\s*[:.]/i.test(strip(items[j + 1][1]))) j += 2;
      if ((j - i) / 2 >= 2) { run = items.slice(i, j); }
      break;
    }
    if (run) {
      const from = run[0].index, to = run[run.length - 1].index + run[run.length - 1][0].length;
      /* The list that holds them, and the item that introduces it. */
      const listStart = html.lastIndexOf('<ul', from) > html.lastIndexOf('<ol', from)
        ? html.lastIndexOf('<ul', from) : html.lastIndexOf('<ol', from);
      const closeTag = html.startsWith('<ul', listStart) ? '</ul>' : '</ol>';
      const listEnd = html.indexOf(closeTag, to);
      if (listStart >= 0 && listEnd > to) {
        const wholeList = html.slice(listStart, listEnd + closeTag.length);
        /* The <li> that wraps the list — its own text is the intro. */
        const liStart = html.lastIndexOf('<li', listStart);
        const liEnd = html.indexOf('</li>', listEnd);
        const intro = liStart >= 0 && liEnd > listEnd
          ? strip(html.slice(liStart, listStart).replace(/^<li[^>]*>/, '')) : '';
        const cut = intro ? [liStart, liEnd + 5] : [listStart, listEnd + closeTag.length];

        const panels = [];
        for (let k = 0; k + 1 < run.length; k += 2)
          panels.push('<dl class="ckeditor-accordion">\n<dt><a href="#">' + run[k][1].trim() +
                      '</a></dt>\n<dd><p>' + run[k + 1][1].trim() + '</p></dd>\n</dl>');
        /* AN h3, NOT A SECTION HEADER. These questions came out of the
           middle of something — a panel that is itself about one
           subject — so they are a part of that subject, not a new one
           beside it. Emitted as a section header they read as a peer
           of "About the CLASS Interactions and Environments
           Observation Tool" when they belong under it.
           The outline is normalised again below, after every
           transform has run, so this lands at whatever depth the
           material around it actually sits at. */
        const section =
          (intro ? `<div class="doe-sub"><h3>${intro.replace(/:\s*$/, '')}</h3></div>\n` : '') +
          '<div class="ckeditor-accordion-container">\n' + panels.join('\n') + '\n</div>\n';

        /* Placed after the accordion this came out of, not inline —
           an accordion cannot live inside another one's panel. */
        const spansNow = componentSpans(html);
        let after = cut[1];
        const container = html.lastIndexOf('<div class="ckeditor-accordion-container', cut[0]);
        if (container >= 0) {
          const end = html.indexOf('</div>', html.indexOf('</dl>', cut[1]));
          if (end > 0) after = end + 6;
        }
        html = tidyEmpties(html.slice(0, cut[0]) + html.slice(cut[1], after) + '\n' + section + html.slice(after));
        if (intro) removedOnPurpose.push(intro);
        decisions.push({ id: 'faq', on: true, label: 'Lift the questions out into their own section',
          why: `${panels.length} questions and answers are bullets inside another accordion's panel. "${intro.replace(/:\s*$/, '').slice(0, 44)}" becomes the section header it already reads as, and each question becomes a panel a reader can open.`,
          value: panels.length + ' questions' });
      }
    }
  }

  /* A LONE DOCUMENT BUTTON BELONGS IN THE BANNER.
     A heading whose whole content was a link has just become a
     button, and a page that has exactly one of those is telling you
     what it is for — "Comparison of International & National
     Assessments" is the thing /Testing_Accountability/MECAS/
     materials/natint exists to hand you. Left in the body it is a
     button a reader scrolls to; in the banner it is the page's
     action.
     Only when there is exactly one, and only when nobody has written
     a call to action for the page by hand — a direction in
     overrides.json is a decision already made. The copy in the body
     is then removed by the duplicate rule further down, which is the
     same machinery that took the form link off /meac. */
  if (promoted.length === 1 && !opts.cta) {
    opts = { ...opts, cta: [{ label: promoted[0].label, href: promoted[0].href }] };
    decisions.push({ id: 'promote', on: true, label: 'Move the document button into the banner',
      why: `"${promoted[0].label.slice(0, 52)}" is the only action on the page and it was written as a heading. In the banner it is the first thing a reader sees rather than something they scroll to.`,
      value: 'to the banner' });
  }

  /* (c6b) A RUN OF BOLD QUESTIONS IS ALSO AN ACCORDION.
     The other FAQ shape, and the commoner one: a question set as a
     bold paragraph with its answer in the paragraphs beneath it,
     repeated down the page. 80 of them across 11 pages —
     /funding/reports/tuition/faqs, /cert/faq, /learning/cte/ctefaq.
     Left flat, the reader has to scroll the answers to every question
     to find the one they came for, which is the exact case an
     accordion exists for.
     A question mark is the signal, and it is also why the
     bold-paragraph-to-heading rule above skips these: that rule
     refuses anything ending in punctuation, which is right for prose
     and wrong for a question. Two in a row minimum, so a single
     rhetorical question inside an argument is never swept up. */
  if (opts.faqBold !== false) {
    const mk = maskLabels(html);
    /* Marks inside a component are dropped from the LIST, not just
       skipped in the loop. Skipping them was not enough: the next
       mark's index is what bounds the previous answer, so the
       contact block's own <h3> went on acting as a boundary even
       when the loop ignored it — and since an answer may not end
       inside a block it did not open, the answer collapsed to
       nothing and the question was thrown away. */
    const marks = [...mk.matchAll(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>|<h[1-6]\b/gi)]
      .filter(m => !inComponent(m.index));
    /* AN ANSWER STOPS AT THE EDGE OF ITS OWN CONTAINER.
       The answer ran from the question to the next bold line or
       heading, wherever that fell — and on /funding/reports/tuition
       the next heading was an <h2> sitting INSIDE the following
       <div class="blockhead">. So the answer swallowed the card's two
       closing tags and the next section's opening tag; the accordion
       emitted them inside <dd>; and the document after it resumed in
       the middle of a blockhead. What that looked like on the page:
       an empty navy bar, the h2 stranded outside it, and every
       section id from there down attached to the WRONG heading — so
       four of the five contents-list links jumped to the wrong part
       of the page.
       Nothing in the source was malformed. This was mine. The slice
       is cut at the first tag that would close a container the answer
       did not open. */
    const safeEnd = (from, to) => {
      let depth = 0, lastBalanced = from;
      const t = /<(\/?)(?:div|section|article|aside|nav|ul|ol|table)\b[^>]*>/gi;
      t.lastIndex = from;
      let m;
      while ((m = t.exec(html)) && m.index < to) {
        if (m[1]) { if (depth === 0) return m.index; depth--; } else depth++;
        if (depth === 0) lastBalanced = m.index + m[0].length;
      }
      /* AND IT MUST NOT END INSIDE SOMETHING IT OPENED EITHER, which
         is the half the first version of this missed. It stopped the
         answer closing a container it had not opened; it happily let
         the answer OPEN one and stop before the close.
         /schools/equivalentinstruction is the case. The last answer
         ran to the next mark, and the next mark was the <h3> inside
         the contact block — so the slice swallowed
         `<div class="contact-cube">` and stopped. The accordion then
         emitted its own </dd></dl></div> straight after that opening
         tag, which closed the contact block on the spot: an empty
         navy box, and Sierra Wood's details left outside it as a
         section header and a loose paragraph. Matt asked whether I
         had done that to other contact blocks. On this page, yes.
         Cut back to the last point where everything opened had been
         closed. */
      return depth === 0 ? to : lastBalanced;
    };
    const run = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      /* A HEADING INSIDE A COMPONENT IS THE COMPONENT'S OWN LABEL —
         the contact block's "Contact", a card's title. It is neither
         a question nor a boundary, so it is skipped outright.
         CHECKED FIRST, which is the whole point. Placed after the
         boundary test below it never ran: on
         /schools/equivalentinstruction the contact block's <h3> was
         read as a real heading, which resets a run of one to zero —
         so the page's two questions were found, counted and thrown
         away, and neither became a heading. */
      if (inComponent(m.index)) continue;
      if (m[1] === undefined) { if (run.length >= 2) break; run.length = 0; continue; }
      const t = strip(m[1]);
      /* An answer also stops where a component starts: a contact
         block or a card that follows the last question belongs to
         the page, not inside an accordion panel. */
      const from2 = m.index + m[0].length;
      let limit = marks[i + 1] ? marks[i + 1].index : html.length;
      for (const [cs] of spans) if (cs >= from2 && cs < limit) limit = cs;
      const end = safeEnd(from2, limit);
      const answer = html.slice(m.index + m[0].length, end);
      if (!/\?\s*$/.test(t) || t.length < 12 || /<br|<\/strong/i.test(m[1]) || strip(answer).length < 60) {
        if (run.length >= 2) break;
        run.length = 0; continue;
      }
      run.push({ q: m[1].trim(), a: answer, from: m.index, to: end });
    }
    /* BELOW THE THRESHOLD A QUESTION IS STILL A HEADING.
       One or two questions do not earn an accordion, but they are
       not body text either: "Is home instruction the same as
       equivalent instruction?" introduces the paragraph under it and
       is set in bold precisely because the author meant it as a
       heading. Left as a bold paragraph it is outside the outline, a
       screen reader does not announce it, and the contents list
       cannot reach it.
       h3, because these sit under whatever section they are in
       rather than beside it. Same detection as the accordion above —
       only the treatment changes with the count. */
    if (run.length && run.length < 3) {
      let promoted = 0;
      /* Last first, so replacing one does not move the next one's
         recorded index. */
      for (const x of [...run].reverse()) {
        const m2 = html.slice(x.from).match(/^<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>(?:\s|&nbsp;)*<\/p>/i);
        if (!m2) continue;
        const label = m2[1].replace(/(?:&nbsp;|\s)+$/g, '').trim();
        if (!label) continue;
        html = html.slice(0, x.from) + `<h3>${label}</h3>` + html.slice(x.from + m2[0].length);
        promoted++;
      }
      if (promoted) {
        decisions.push({ id: 'qhead', on: true, label: 'Make a question a heading',
          why: `${promoted} question${promoted > 1 ? 's are' : ' is'} set as a bold paragraph introducing the text beneath. That is a heading doing a heading's job without being one: it is not in the page's outline, a screen reader does not announce it as a section, and the contents list cannot link to it. Too few for an accordion — an accordion of two hides half a short page behind a click — so each becomes an h3 where it stands. Not a word changes.`,
          value: promoted + ' question' + (promoted > 1 ? 's' : '') });
      }
    }
    /* THREE, NOT TWO. An accordion is a way to make a long list of
       questions scannable; with two it is a way to hide half a short
       page behind a click. /schools/equivalentinstruction has
       exactly two — "What is an equivalent instruction school?" and
       "Is home instruction the same?" — and they are not an FAQ, they
       are how the page is written. The component list already says
       it: do not use an accordion to hide a single sentence.
       Three pages were accordioned on two questions. The four that
       remain have three, four, six and eight. */
    if (run.length >= 3) {
      const panels = run.map(x =>
        '<dl class="ckeditor-accordion">\n<dt><a href="#">' + x.q + '</a></dt>\n<dd>' + x.a.trim() + '</dd>\n</dl>');
      const block = '<div class="ckeditor-accordion-container">\n' + panels.join('\n') + '\n</div>\n';
      html = html.slice(0, run[0].from) + block + html.slice(run[run.length - 1].to);
      decisions.push({ id: 'faqbold', on: true, label: 'Turn the questions into an accordion',
        why: `${run.length} questions are set as bold paragraphs with their answers beneath, so a reader looking for one has to scroll past the answers to all the others. Each question becomes a panel. Every word is kept, including the question marks.`,
        value: run.length + ' questions' });
    }
  }

  /* THE BOLD-LINE PROMOTION, ONCE MORE, NOW THE FAQ HAS MOVED.
     A bold line only counts as a heading if real content follows it,
     and "Program Year 2026" on /schools/nutrition/programs/localfoods/
     producefund was followed immediately by the first FAQ question —
     so at the time that test ran there was nothing beneath it and it
     stayed a bold paragraph. Once the questions become an accordion
     the same line is followed by the whole accordion and it plainly
     is a heading. The test was right; it was asked too early. */
  if (opts.pseudo !== false && /ckeditor-accordion-container/.test(html)) {
    const mk2 = maskLabels(html);
    const marks2 = [...mk2.matchAll(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>|<h[1-6]\b/gi)];
    const lv2 = /<h2\b/i.test(html) ? 3 : 2;
    for (let i = 0; i < marks2.length; i++) {
      const m = marks2[i];
      if (m[1] === undefined) continue;
      if (/<br|<\/strong|<\/?p\b/i.test(m[1])) continue;
      const t = strip(m[1]), w = t.split(/\s+/).length;
      if (t.length < 4 || t.length > 80 || w < 2 || w > 12) continue;
      if (/[:;.!?,]$/.test(t) || /^[([]?\s*\d+[).\]]/.test(t)) continue;
      if (!/^<div[^>]*class="[^"]*ckeditor-accordion-container/i.test(mk2.slice(m.index + m[0].length).trim())) continue;
      if (inComponent(m.index)) continue;
      const tag = html.slice(m.index, m.index + m[0].length);
      if (!html.includes(tag)) continue;
      html = html.replace(tag, `<h${lv2}>${m[1].trim()}</h${lv2}>`);
      decisions.push({ id: 'pseudo2:' + slug(t), on: true,
        label: 'Make a bold line a real heading',
        why: `"${t}" introduces the accordion below it, so it is the heading of that group rather than a line of bold text. It was passed over the first time because the questions under it had not yet been gathered up.`,
        value: `h${lv2}` });
    }
  }

  /* (c7) AN ACCORDION TOLD TO BE A SECTION.
     overrides.json carries { "unfold": ["the accordion's title"] }
     and that accordion stops being one: its title becomes the section
     header, its panel becomes the body of the section, and bullets
     that are really paragraphs are written as paragraphs.

     THIS IS A DIRECTION, NOT A RULE, and it is data rather than code
     because it could not be either. I looked for the general case
     first — a panel holding nothing but long prose, which is content
     with nothing to scan and therefore no reason to be hidden — and
     across 652 accordions on the site it matched exactly one, and not
     the one that needed it. "About the CLASS Interactions and
     Environments Observation Tool" failed the test on its third item,
     a 115-character line pointing at TeachStone.
     A threshold tuned until it catches one page is not a rule. So
     the judgement stays with the person making it. */
  if (opts.unfold) {
    for (const want of [].concat(opts.unfold)) {
      const dls = [...html.matchAll(/<dl\b[^>]*>\s*<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>\s*<\/dl>/gi)];
      const m = dls.find(x => norm(x[1]).includes(norm(want)) || norm(want).includes(norm(x[1])));
      if (!m) { notes.push(`Unfold skipped — no accordion is titled "${want}".`); continue; }
      const title = strip(m[1]);
      let panel = m[2].trim();
      /* A list whose items are all prose is a run of paragraphs that
         was typed as bullets. Unwrapped so it reads as the section
         body rather than as a list of three enormous points. */
      const only = panel.match(/^<(ul|ol)\b[^>]*>([\s\S]*)<\/\1>$/i);
      if (only && !/<(ul|ol|table)\b/i.test(only[2])) {
        /* Empty items do not count. Lifting the questions out of this
           same panel a step earlier leaves the bullet that introduced
           them behind, and an empty bullet failed the every() below —
           so the conversion silently did not happen and the section
           kept three enormous bullets. The final tidy deletes those
           empties anyway; they should not get a vote here. */
        const items = [...only[2].matchAll(/<li\b[^>]*>((?:(?!<li\b)[\s\S])*?)<\/li>/gi)]
          .filter(x => strip(x[1]).length > 0);
        if (items.length && items.every(x => strip(x[1]).length > 80))
          panel = items.map(x => `<p>${x[1].trim()}</p>`).join('\n');
      }
      const section = `<div class="blockhead"><h2>${title}</h2></div>\n${panel}\n`;
      /* Out of the accordion container entirely — a section header
         inside one would be the nested-slab fault again. */
      const cStart = html.lastIndexOf('<div class="ckeditor-accordion-container', m.index);
      let at = m.index + m[0].length;
      if (cStart >= 0) {
        const spansNow = componentSpans(html);
        const end = html.indexOf('</div>', at);
        if (end > 0) at = end + 6;
      }
      html = html.slice(0, m.index) + html.slice(m.index + m[0].length, at) + '\n' + section + html.slice(at);
      decisions.push({ id: 'unfold:' + slug(title), on: true,
        label: 'Make an accordion into a section',
        why: `"${title.slice(0, 52)}" is reference material a reader needs in order to follow the rest of the page, and it was behind a click. Its title becomes the section header and its content is shown.`,
        value: 'section' });
    }
  }

  /* (c8) HOW A STAFF EMAIL IS WRITTEN.
     441 addresses on 221 pages are shown in some case of their own —
     all lower, all caps, or whatever the author typed. The house form
     is Firstname.m.Lastname@maine.gov: each name capitalised, a
     middle initial in lower case.

     THIS ONLY EVER CHANGES THE FIRST LETTER OF A SEGMENT. Lower-casing
     the rest looked tidier and destroyed real names: Nicholas.J.
     LaBreck came back as Nicholas.j.Labreck. Nobody gets to decide
     that LaBreck, McCourt or DeWitt are spelt wrong.

     And it leaves alone what is not a person:
       · a first segment of one letter is an initial, not a middle
         one — W.Bear.Shea keeps its W
       · a shared mailbox is not a name, so cert.doe@maine.gov stays
       · anything outside maine.gov belongs to somebody else
     The mailto: itself is never touched, only the words on the page. */
  if (opts.emailCase !== false) {
    const SHARED = /^(doe|info|help|support|team|office|admin|no-?reply|registrar|contact|webmaster|mail|inbox)$/i;
    const house = (addr) => {
      const at = addr.lastIndexOf('@');
      const local = addr.slice(0, at), domain = addr.slice(at + 1);
      if (!/^maine\.gov$/i.test(domain)) return null;
      const parts = local.split('.');
      if (parts.length < 2 || parts.some(x => SHARED.test(x))) return null;
      const out = parts.map((x, i) => {
        if (!x) return x;
        /* A single letter is a middle initial only when something
           comes before it. */
        if (x.length === 1 && i > 0 && i < parts.length) return x.toLowerCase();
        /* ALL CAPITALS CARRIES NO SPELLING. "HANNA" is not telling us
           anything about how the name is written, so it becomes
           Hanna. Mixed case is: LaBreck and McCourt are spelt that
           way on purpose and only the first letter is touched. */
        if (x === x.toUpperCase()) return x[0] + x.slice(1).toLowerCase();
        return x[0].toUpperCase() + x.slice(1);      // the rest is the person's own spelling
      }).join('.');
      const fixed = out + '@' + domain.toLowerCase();
      return fixed === addr ? null : fixed;
    };
    let n = 0, sample = null;
    html = html.replace(/(<a\b[^>]*href="mailto:[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/gi, (m, open, text, close) => {
      const t = text.trim();
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(t)) return m;   // not a bare address
      const fixed = house(t);
      if (!fixed) return m;
      n++; if (!sample) sample = t + ' → ' + fixed;
      return open + fixed + close;
    });
    if (n) decisions.push({ id: 'emailcase', on: true, label: 'Write the email addresses the same way',
      why: `${n} address${n > 1 ? 'es are' : ' is'} shown in whatever case it was typed in. The house form capitalises each name and leaves a middle initial in lower case — ${sample}. Only the first letter of each part changes, so a name that spells itself LaBreck keeps doing so.`,
      value: n + ' address' + (n > 1 ? 'es' : '') });
  }

  /* A SECTION TITLE THAT IS NOT EVEN BOLD.
     /learning/esea/titleIII/snapshot names the middle of the page
     "Title-Specific Expenditures" and leaves it as plain body text,
     one line on its own directly above the first section header —
     its sibling page sets the identical line in bold and it becomes
     a section header there. Same document, same author, one missing
     keystroke, and the page loses its only structural landmark.
     THREE LINES ON THE SITE SIT IN THAT POSITION and the other two
     are "[ 2015, c. 489, §6 (AMD) .]" and "Updated 5/21/2021" — a
     citation and a date stamp, neither a heading. Both carry digits
     and the heading does not, which is the whole test alongside the
     shape: a short line, title case, no digits, no sentence
     punctuation, sitting immediately above a section header. */
  if (opts.plainhead !== false) {
    const lvl = /<h2\b/i.test(html) ? 2 : 2;
    html = html.replace(/<p>([^<>]{4,60})<\/p>(\s*)(?=<div class="blockhead"|<h[23]\b)/gi, (m, raw, gap) => {
      const t = raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t || /[.!?;,:]$/.test(t)) return m;
      if (/\d/.test(t)) return m;
      /* NO PUNCTUATION INSIDE IT EITHER. The digit test alone let
         through ten lines of /learning/ffa/winners2022-2023 —
         "Third Place Individual: Abigail Howlett, Mars Hill HS" —
         contest results that sit above a heading and end with no
         full stop. A heading names a thing; a line carrying a colon
         or a comma is a sentence doing something else. */
      if (/[:,;]/.test(t)) return m;
      const w = t.split(/\s+/);
      if (w.length < 2 || w.length > 8) return m;
      if (!/^[A-Z]/.test(t)) return m;
      decisions.push({ id: 'plainhead:' + slug(t), on: true,
        label: 'Make a line of plain text a real heading',
        why: `"${t}" sits on its own directly above a section header, with no punctuation and nothing else on the line — it is naming the part of the page that follows. Set as body text it is not in the outline, a screen reader does not announce it, and the contents list cannot reach it.`,
        value: `h${lvl}` });
      return `<div class="blockhead"><h${lvl}>${t}</h${lvl}></div>${gap}`;
    });
  }

  /* A PAGE THAT SIGNS OFF WITH THE OFFICE THAT WROTE IT.
     /learning/esea/titleIV/snapshot ends with three centred bold
     lines — "Maine Department of Education / Office of ESEA Federal
     Programs / (207) 624-6705". That is a contact block; it is drawn
     as body text because the document it came from was a Word file
     with a footer.
     ONE PAGE HAS THIS SHAPE TODAY and the test says so out loud:
     every line centred AND bold AND under 45 characters, two to
     four of them, nothing after them but the page, and one of them
     a phone number. A looser test — "ends with a phone number" —
     matched twenty pages and most were directory listings whose
     last entry happened to have a phone, which is why it is not
     that test.
     NOT ONE WORD IS ADDED. The cube's usual "Contact" heading is
     left off precisely because nobody wrote it here. */
  if (opts.footercube !== false) {
    const CENTRED = /align="center"|text-align:\s*center/i;
    const ps = [...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];
    const top = html.match(/<p class="doe-top">[\s\S]*?<\/p>\s*$/);
    const endsAt = top ? html.length - top[0].length : html.length;
    const tail = ps.filter(m => m.index < endsAt).slice(-3);
    const lineText = m => m[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (tail.length >= 2) {
      const last = tail[tail.length - 1];
      const nothingAfter = !html.slice(last.index + last[0].length, endsAt).replace(/<[^>]*>|\s|&nbsp;/g, '');
      const allShortCentredBold = tail.every(m => {
        const t = lineText(m);
        return t && t.length <= 45 && CENTRED.test(m[1]) && /<strong>/i.test(m[2]);
      });
      const hasPhone = tail.some(m => /\(?\d{3}\)?[ .-]?\d{3}-\d{4}/.test(lineText(m)));
      if (nothingAfter && allShortCentredBold && hasPhone) {
        const body = tail.map((m, i) => {
          const inner = m[2].replace(/<\/?strong>/gi, '').replace(/&nbsp;/g, ' ').trim();
          /* The office under the department name is a job title in
             the house pattern, and titles are set in italic. */
          return i === 1 && tail.length === 3 ? `<em>${inner}</em>` : inner;
        }).join('<br />\n');
        const start = tail[0].index;
        html = html.slice(0, start)
          + `<div class="contact-cube">\n<p>${body}</p>\n</div>\n`
          + html.slice(last.index + last[0].length);
        decisions.push({ id: 'footercube', on: true, label: 'Make the sign-off a contact block',
          why: `The page ends with ${tail.length} centred bold lines naming the office that produced it and a phone number — a contact block drawn as body text, which is what a Word footer becomes when it is pasted. Set as the site's contact block it is recognisable as one and reads the same way it does on every other page. No word is added or removed.`,
          value: tail.length + ' lines' });
      }
    }
  }

  /* A LINK THAT OPENS A DOCUMENT, WITH NOTHING SAYING SO.
     Some links on a page carry a format label because their author
     typed one — "(PDF)", "- Word Document" — and the chip rules turn
     those into tags. The rest are identical links to identical files
     with no label at all, so one row in a list announces that it
     downloads a PDF and the row under it, which also downloads a
     PDF, looks like an ordinary page link. The difference is not the
     file. It is whether somebody remembered to type it.
     THE HREF ALREADY KNOWS. A link ending .pdf is a PDF whether or
     not anyone said so, and the chip is read off the file name.

     ONLY IN A LIST OR A TABLE CELL, which is where these live and
     where a tag reads as metadata about a row. The same chip mid-
     sentence interrupts the sentence, so a link inside a paragraph
     of prose is left alone.
     AND NOT WHEN THE TEXT ALREADY SAYS IT — "Rank and Distribution
     Video" does not need a Video tag after it. */
  if (opts.filechip !== false) {
    /* The link text that makes a format tag redundant. Measured, not
       guessed: 130 chips across 6 pages read "YouTube" tagged Video
       and no other platform name appeared anywhere in the corpus.
       Vimeo is here because it is the same object, not because it
       occurs. Nothing is read off the domain — a Drive or a Dropbox
       address could be anything, and this judges the words a reader
       actually sees. */
    const PLATFORM_IMPLIES = { youtube: 'Video', 'youtu.be': 'Video', vimeo: 'Video' };
    const BY_EXT = {
      pdf: 'PDF', doc: 'Word', docx: 'Word', rtf: 'RTF',
      xls: 'Excel', xlsx: 'Excel', csv: 'CSV',
      ppt: 'PowerPoint', pptx: 'PowerPoint', zip: 'ZIP',
    };
    let n = 0; const tally = {};
    html = html.replace(/<(li|td|th)\b([^>]*)>((?:(?!<\/\1>)[\s\S])*)<\/\1>/gi, (m, tag, attrs, inner) => {
      /* WHAT THE REST OF THIS CELL ALREADY SAYS. A tag is metadata
         about a row, so it is redundant when the row states the
         format in words somewhere else — on /meac the December
         office-hours cell reads "PDF | Slides" and only Slides got
         tagged, because the guard below tests the one link's own
         text and cannot see its neighbour. Matt: "Slides doesn't
         need a chip because the PDF is next to it."
         Two cells site-wide, and it is here rather than in an
         override because the next one should not need reporting. */
      const said = new Set([...inner.matchAll(/<a\b[^>]*>((?:(?!<\/a>)[\s\S])*)<\/a>/gi)]
        .map(L => L[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
                      .replace(/\s+/g, ' ').trim().toLowerCase()));
      const out = inner.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>((?:\s|&nbsp;)*<span class="doe-chip">)?/gi,
        (am, aAttrs, text, already) => {
          if (already) return am;                       // it has a tag already
          if (/\bbtn\b/i.test(aAttrs)) return am;       // a button is a different object
          const href = (aAttrs.match(/href="([^"]*)"/) || [])[1] || '';
          if (!href || href.startsWith('#')) return am;
          const path = href.split(/[?#]/)[0];
          let ext = '';
          try { ext = (decodeURIComponent(path).match(/\.([a-z0-9]{2,5})$/i) || [])[1] || ''; }
          catch (e) { ext = (path.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || ''; }
          let label = BY_EXT[ext.toLowerCase()] || '';
          if (!label && /(?:\/\/|\.)(?:youtube\.com|youtu\.be)\b/i.test(href)) label = 'Video';
          if (!label) return am;
          const t = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          if (!t) return am;                            // an image link has no name to tag

          /* AND THE NAME OF THE PLACE IT LIVES ALREADY SAYS IT.
             A row reading "YouTube" tagged Video is the tag saying
             the link over again. The guard further down catches a
             title that CONTAINS the word — "Rank and Distribution
             Video" — but "YouTube" does not contain "Video", so nine
             rows of the /meac office-hours table came out
             YouTube-Video, YouTube-Video, and a column meant to be
             scannable read as noise instead. Matt: "YouTube doesn't
             need a chip because it implies video." */
          if (PLATFORM_IMPLIES[t.toLowerCase()] === label) return am;
          if (said.has(label.toLowerCase())) return am;

          /* THE TEXT ALREADY ENDS WITH THE FORMAT, so the format
             becomes the chip instead of staying as the last word of
             the title. "Equitable Services Training Video" was
             skipped by the first version of this rule — it saw the
             word, decided the link was already labelled and left it
             as prose, so the row sat in a list of tagged rows with
             its label written out longhand. The word is the same
             word; it just moves into the tag.

             ONLY WHEN THE FILE AGREES. "Rank and Distribution
             Slides" is a PDF, so "Slides" is part of the title and
             stays where it is — the chip says PDF beside it. Across
             the site 47 links end with a word the file agrees with
             and NOT ONE ends with a word it contradicts, so this is
             a move, never a correction.
             AND ONLY IF SOMETHING IS LEFT. "YouTube Video" reduced
             to "YouTube" is a link with no name, so it keeps both. */
          let inner = text, chipped = false;
          for (const w of FORMAT_WORDS) {
            if (canonKey(w) !== canonKey(label)) continue;
            const tail = new RegExp('(?:\\s|&nbsp;)+' + w.replace(/ /g, '(?:\\s|&nbsp;)+') + '(?:\\s|&nbsp;)*$', 'i');
            if (!tail.test(inner)) continue;
            const rest = inner.replace(tail, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            if (!rest || FORMAT_WORDS.includes(rest.toLowerCase())) break;
            inner = inner.replace(tail, '');
            chipped = true;
            break;
          }
          if (!chipped && new RegExp('\\b' + label + '\\b', 'i').test(t)) return am;
          n++; tally[label] = (tally[label] || 0) + 1;
          /* THE MARKER MEANS "THIS WORD WAS NOT ON THE PAGE", and it
             is the difference between the two halves of this rule.
             A chip read off a file name is a word this tool invented,
             so the loss check drops it rather than reporting every
             tagged page as having gained text. A chip made by moving
             the title's own last word carries no marker: that word
             WAS on the page, it still is, and the check must keep
             seeing it — marking it would have hidden a real deletion
             and did report 24 pages as losing text when I got this
             backwards. */
          const mark = chipped ? '' : ' data-src="file"';
          return `<a${aAttrs}>${inner}</a><span class="doe-chip"${mark}>${label}</span>`;
        });
      return out === inner ? m : `<${tag}${attrs}>${out}</${tag}>`;
    });
    if (n) {
      const kinds = Object.entries(tally).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => v + ' ' + k).join(', ');
      decisions.push({ id: 'filechip', on: true, label: 'Tag a document link with the format it opens',
        why: `${n} link${n > 1 ? 's on this page open' : ' on this page opens'} a file — ${kinds} — and say${n > 1 ? '' : 's'} nothing about it, while others in the same list carry a tag because their author typed one. The format is read from the file name, so the list stops being half-labelled. No link text changes.`,
        value: n + ' link' + (n > 1 ? 's' : '') });
    }
  }

  /* (c9) A SUB-HEADING LOOKS LIKE ONE.
     .doe-sub is the component for a heading below a section: a teal
     rule down its left side and a hairline running across to the
     margin. It is in the stylesheet, it is in the component list, and
     across all 832 pages it had been authored exactly ZERO times —
     396 sub-headings on 204 pages are bare h3s that get a margin and
     nothing else. A component nobody can author is a component that
     does not exist, so the markup is written here instead.

     Only the page's own sub-headings. A heading inside a card, a
     contact block, an accordion panel, a list or a table cell is that
     thing's label and keeps its own treatment. */
  if (opts.subheads !== false) {
    const maskInner = html.replace(/<(li|td|th|blockquote|figure)\b[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));
    const spansNow = componentSpans(html);
    const bare = [...maskInner.matchAll(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi)]
      .filter(m => !spansNow.some(([a, b]) => m.index >= a && m.index < b))
      .filter(m => !/<div[^>]*class="[^"]*\bdoe-sub\b[^"]*"[^>]*>\s*$/i.test(html.slice(Math.max(0, m.index - 140), m.index)));
    for (const m of bare.reverse()) {
      const real = html.slice(m.index, m.index + m[0].length);
      html = html.slice(0, m.index) + '<div class="doe-sub">' + real + '</div>' + html.slice(m.index + m[0].length);
    }
    if (bare.length) decisions.push({ id: 'subheads', on: true,
      label: 'Give the sub-headings their rule',
      why: `${bare.length} sub-heading${bare.length > 1 ? 's are' : ' is'} plain bold text. The design has a treatment for them — a teal rule down the left and a line across — and it had never been used on any page, because it needs a wrapper an author would have to know about.`,
      value: bare.length + ' heading' + (bare.length > 1 ? 's' : '') });
  }

  /* (c10) A CARD'S TITLE SHOULD BE THE SAME LEVEL ON EVERY CARD.
     446 of them on 112 pages, at whatever level Bootstrap's example
     used — h5.card-title is the one people copy — so on a page whose
     sections are h2, a card announces itself as a fifth-level heading
     of nothing. They are not part of the page outline (a card's title
     labels the card), but they should at least agree with each other
     and sit one level below a section. Only the number changes. */
  if (opts.cardTitles !== false) {
    let n = 0;
    html = html.replace(/<h([1-6])\b([^>]*\bclass="[^"]*\bcard-title\b[^"]*"[^>]*)>([\s\S]*?)<\/h\1>/gi,
      (m, lv, attrs, inner) => { if (lv === '3') return m; n++; return `<h3${attrs}>${inner}</h3>`; });
    if (n) decisions.push({ id: 'cardtitles', on: true, label: 'Put the card titles on one level',
      why: `${n} card title${n > 1 ? 's are' : ' is'} written at a level copied from an example rather than chosen — h5 on a page whose sections are h2. Only the number changes.`,
      value: n + ' title' + (n > 1 ? 's' : '') });
  }

  /* (c11) TWO CARDS OF DIFFERENT WEIGHT SHOULD NOT GET EQUAL HALVES.
     69 rows across the site hold two cards in col-*-6 each where one
     carries twice the content of the other or more — 26 of them at
     three times, one at fourteen. Cards in a row are equal height by
     design, so the short one is stretched to match and the difference
     comes out as empty space: "Stay in Touch" at 331 characters
     beside WIDA at 1,043 on /learning/multilinguallearner, both given
     half the page.
     The column widths are the one thing here that is pure layout —
     no word moves, nothing leaves its section, and at narrow widths
     they stack as before. Twelve columns split 8/4 or 9/3 according
     to how lopsided the pair actually is.
     Only a row of exactly two cards whose columns are already equal.
     Three cards, or a row someone has already weighted by hand, is a
     decision that has been made and is left alone. */
  if (opts.balance !== false) {
    /* A ROW OF PEOPLE IS A ROW OF PEERS.
       Both steps below decide how much room a card deserves from how
       much text is in it. That is right for topic cards and wrong for
       a staff directory: one person supporting six programmes is not
       more important than a colleague supporting two, and their cards
       are a set the reader scans across. On /assessment/contact the
       uneven step stacked one pair full-width, so a row that should
       have matched the two rows around it at ~420px came out at
       893px — "contact pages are messed up ... huge weird spaces".
       A card holding an address is a person. Every card in the row
       has to be one, so a single contact card beside a topic card is
       still weighed normally. */
    const peopleRow = (src) => {
      const cards = [...src.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi)];
      if (cards.length < 2) return false;
      return cards.every(m => {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(src))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        return /href="mailto:/i.test(src.slice(m.index, i));
      });
    };
    const cardsIn = (src) => {
      const out = [];
      for (const m of src.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi)) {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(src))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        out.push(strip(src.slice(m.index, i)).length);
      }
      return out;
    };
    const rows = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    let done = 0, sample = null;
    for (const row of rows.reverse()) {                 // back to front: offsets stay valid
      const cols = [...row[1].matchAll(/class="[^"]*\b(col-[a-z]+-)(\d+)/g)];
      if (cols.length !== 2 || cols[0][2] !== cols[1][2]) continue;
      if (peopleRow(row[1])) continue;
      /* CARDS IF THERE ARE ANY, OTHERWISE THE COLUMNS THEMSELVES.
         A row does not have to hold cards to be lopsided:
         /learning/highered/forprofit puts 486 characters beside 6,717
         in equal halves, and /sel/faq puts 756 beside 45,164. Reading
         only the cards meant every one of those rows was invisible to
         this. */
      /* > 10, NOT > 40. The filter was meant to ignore an empty card
         and instead discarded the very thing it was looking for: on
         /schools/nutrition/training a 40-character card sits beside a
         397-character one, and 40 is not greater than 40, so the pair
         never reached the comparison at all. The most lopsided rows
         were the ones this could not see. */
      let lens = cardsIn(row[1]).filter(n => n > 10);
      if (lens.length !== 2) {
        lens = [...row[1].matchAll(/<div[^>]*class="[^"]*\bcol-[a-z]+-\d+[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\bcol-|$)/gi)]
          .map(c => strip(c[1]).length).filter(n => n > 10);
      }
      if (lens.length !== 2) continue;
      const ratio = Math.max(...lens) / Math.min(...lens);
      if (ratio < 2.2) continue;
      /* A PICTURE CAPS HOW FAR THIS CAN GO, it does not forbid it.
         Measured on /learning/multilinguallearner, where the two
         cards differ by 462px at equal halves:
            6/6   mismatch 462px   image ratio 1.78
            8/4   mismatch 332px   image ratio 2.02
            9/3   mismatch 152px   image ratio 2.29
         Every column given to the wide card brings the pair closer to
         level and crops its photograph harder — the source is 1.50,
         so 9/3 is discarding over a third of it. 8/4 takes most of
         the improvement for a crop that still reads as a banner, and
         that is as far as a card with an image is allowed to go. */
      const hasImage = /class="[^"]*card-img-top/i.test(row[1]);
      const [big, small] = (ratio >= 4 && !hasImage) ? [9, 3] : [8, 4];
      const first = lens[0] >= lens[1];
      let k = 0;
      const rebuilt = row[1].replace(/class="([^"]*)\bcol-([a-z]+)-\d+/g, (m, pre, bp) => {
        const w = (k++ === 0) === first ? big : small;
        return `class="${pre}col-${bp}-${w}`;
      });
      html = html.slice(0, row.index) + row[0].replace(row[1], rebuilt) + html.slice(row.index + row[0].length);
      done++;
      if (!sample) sample = `${Math.round(ratio * 10) / 10}× — ${Math.max(...lens)} characters beside ${Math.min(...lens)}`;
    }
    /* AND WHERE THE PAIR IS TOO UNEVEN TO REBALANCE, STOP STRETCHING
       IT. Cards in a row are equal height, which is right when they
       are comparable and wrong when one holds three times the other:
       the short one is pulled to the tall one's height and the
       difference is a field of empty card. Marked here rather than
       measured in CSS, because CSS cannot compare two siblings'
       content. The stylesheet lets a marked row size each card to
       what is in it. */
    let loose = 0;
    /* RE-SCANNED, NOT REUSED. The loop above rewrites a row's column
       classes, so every row captured before it no longer appears in
       the document verbatim — and this loop's replace became a no-op
       on exactly the rows the one above had just improved. The result
       was a pair reweighted to 4/8 and then still stretched to equal
       height, which is the 354px of empty card it was meant to remove.
       A second pass over a document an earlier pass has edited has to
       read the document again. */
    const rows2 = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    for (const row of rows2) {
      const lens = cardsIn(row[1]).filter(n => n > 10);
      if (lens.length !== 2) continue;
      if (Math.max(...lens) / Math.min(...lens) < 2.6) continue;
      if (/doe-row--uneven/.test(row[0])) continue;
      if (peopleRow(row[1])) continue;
      /* STACKING IS ONLY RIGHT FOR A PAIR WITH NO PICTURES.
         A card image is capped at 300px, which was measured against a
         HALF-width card: 454/300 is 1.51, and these photographs are
         916x612, ratio 1.50 — so side by side they fit almost exactly.
         At full width the same cap is 922/300, ratio 3.07, and
         object-fit:cover throws away half the photograph to get there.
         So a pair carrying images stays side by side and merely stops
         stretching; only an all-text pair stacks. */
      const cls = /class="[^"]*card-img-top/i.test(row[1])
        ? 'doe-row--uneven ' : 'doe-row--uneven doe-row--stack ';
      const open = row[0].match(/^<div[^>]*>/)[0];
      const marked = open.replace(/class="/, 'class="' + cls);
      /* COUNT WHAT CHANGED, NOT WHAT WAS ATTEMPTED. The rows were
         matched against an earlier state of the document, so by now
         some of them no longer appear verbatim and the replace is a
         no-op — and the counter still went up, reporting 41 rows
         marked where the finished HTML carried 16. A tally that
         cannot tell intent from effect is worse than none. */
      const next = html.replace(open + row[1], marked + row[1]);
      if (next === html) continue;
      html = next;
      loose++;
    }
    if (loose) decisions.push({ id: 'uneven', on: true, label: 'Let very uneven cards find their own height',
      why: `${loose} row${loose > 1 ? 's pair' : ' pairs'} a short card with one holding nearly three times as much. Equal heights stretch the short one and the difference reads as a hole, so these are allowed to sit at the height of what is in them.`,
      value: loose + ' row' + (loose > 1 ? 's' : '') });

    if (done) decisions.push({ id: 'balance', on: true, label: 'Give the cards the width their content needs',
      why: `${done} row${done > 1 ? 's hold' : ' holds'} two cards of very different weight in equal halves, and cards in a row are the same height — so the short one is stretched and the difference shows as empty space. ${sample}. Only the column widths change.`,
      value: done + ' row' + (done > 1 ? 's' : '') });
  }

  /* ── (c12) FOUR CLEAN-UPS THE COMPONENT LIST ALREADY SPECIFIES ──
     None of these is my taste. Each is written down in the Maine DOE
     component list or is a plain web-readability standard, and each
     had simply never been applied to the pages that predate it. */

  /* (a) A JUMBOTRON IS A dc-note. The list says jumbotron callouts
     become dc-note; 80 of them never did. Bootstrap dropped the
     jumbotron entirely in v5, so these are a dead component carrying
     live content. */
  if (opts.jumbotron !== false) {
    let n = 0;
    html = html.replace(/(<div[^>]*class=")([^"]*)(")/gi, (m, a, cls, b) => {
      if (!/\bjumbotron\b/.test(cls)) return m;
      n++;
      return a + (cls.replace(/\bjumbotron\b/g, 'dc-note').replace(/\s+/g, ' ').trim()) + b;
    });
    if (n) decisions.push({ id: 'jumbotron', on: true, label: 'Jumbotron callouts become notes',
      why: `${n} callout${n > 1 ? 's are' : ' is'} built as a Bootstrap jumbotron, which the component list replaced with dc-note and which Bootstrap itself removed in version 5. Same content, the site's own callout.`,
      value: n + ' callout' + (n > 1 ? 's' : '') });
  }

  /* (b) EVERY CONTENT BUTTON IS btn-info. The list is explicit —
     "Always use btn-info, never btn-primary" — and 106 buttons are
     something else, so the same action looks like three different
     controls depending on the page. */
  /* (d4) A STANDING LINK THAT CLOSES ITS BLOCK IS A BUTTON.
     Matt has asked for this on four separate pages — the waivers
     link, the produce-fund claim form, the demo recording, and "Read
     the national press release announcing the 2027 program" at the
     foot of a column on /learning/civics/studentsenate. Every one is
     the same shape: a paragraph holding nothing but a link, sitting
     at the end of a passage that has just explained why you would
     click it. That is a call to action, and the site already has one
     way of drawing those.
     THE TEST IS POSITION, NOT WORDING. A link in the middle of a list
     of links is one of several and stays a list item; a link that
     closes its container is the thing the block was leading up to.
     So the paragraph has to be the last element in its div — a
     column, a card body, a callout — and it has to be a paragraph
     that is ONLY a link, which .doe-action already guarantees.
     Not an address, which is a chip, and not an anchor within the
     page, which goes nowhere new. */
  if (opts.actionbtn !== false) {
    let n = 0;
    html = html.replace(/<p class="doe-action">\s*(<a\b([^>]*)>)([\s\S]*?)<\/a>\s*<\/p>(\s*<\/div>)/gi,
      (m, open, attrs, text, tail) => {
        if (/\bbtn\b/.test(attrs)) return m;
        if (/href="(?:mailto:|#)/i.test(attrs)) return m;
        n++;
        const cls = /class="/.test(attrs)
          ? attrs.replace(/class="/, 'class="btn btn-info btn-lg ')
          : attrs + ' class="btn btn-info btn-lg"';
        return `<p class="doe-action"><a${cls}>${text}</a></p>${tail}`;
      });
    if (n) decisions.push({ id: 'actionbtn', on: true, label: 'Draw a closing link as the action it is',
      why: `${n} passage${n > 1 ? 's end' : ' ends'} with a paragraph holding nothing but a link — the thing the passage was leading up to. Set as running text it looks like any other link in the sentence above it. The site already has one way of drawing an action, so it takes that. The words do not change.`,
      value: n + ' link' + (n > 1 ? 's' : '') });
  }

  if (opts.buttons !== false) {
    let n = 0;
    html = html.replace(/(<a\b[^>]*class=")([^"]*)(")/gi, (m, a, cls, b) => {
      if (!/\bbtn\b/.test(cls)) return m;
      if (!/\bbtn-(?:primary|secondary|success|warning|danger|dark|light|outline-[a-z]+|link)\b/.test(cls)) return m;
      n++;
      const fixed = cls.replace(/\bbtn-(?:primary|secondary|success|warning|danger|dark|light|outline-[a-z]+|link)\b/g, 'btn-info')
                       .replace(/(\bbtn-info\b)(?=.*\bbtn-info\b)/g, '').replace(/\s+/g, ' ').trim();
      return a + fixed + b;
    });
    if (n) decisions.push({ id: 'buttons', on: true, label: 'Put the buttons on the house style',
      why: `${n} button${n > 1 ? 's use' : ' uses'} a Bootstrap variant rather than btn-info, so the same kind of action is drawn three different ways across the site. Only the class changes.`,
      value: n + ' button' + (n > 1 ? 's' : '') });
  }

  /* (c) A LONE CARD DOES NOT SIT IN A THIRD OF THE PAGE. 31 rows hold
     one card in a col-*-4 or col-*-6, so it occupies its share and
     leaves the rest blank — a grid with nothing to grid. */
  if (opts.solo !== false) {
    let n = 0;
    const rows3 = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    for (const row of rows3.reverse()) {
      const cols = row[1].match(/class="[^"]*\bcol-[a-z]+-\d+/g) || [];
      if (cols.length !== 1) continue;
      if (!/class="(?:[^"]*\s)?card(?:\s[^"]*)?"/.test(row[1])) continue;
      const w = +(cols[0].match(/col-[a-z]+-(\d+)/) || [])[1];
      if (!w || w >= 12) continue;
      const widened = row[1].replace(/(class="[^"]*\bcol-[a-z]+-)\d+/, '$112');
      const next = html.replace(row[0], row[0].replace(row[1], widened));
      if (next === html) continue;
      html = next; n++;
    }
    if (n) decisions.push({ id: 'solo', on: true, label: 'Let a lone card use the full width',
      why: `${n} row${n > 1 ? 's hold' : ' holds'} a single card in a part-width column, so it takes a third or a half of the page and the rest is blank. A row of one is not a grid.`,
      value: n + ' card' + (n > 1 ? 's' : '') });
  }

  /* (d) A LINK WITH AN EXPLANATION UNDER IT.
     977 list items on 188 pages open with a link and then describe it
     — "Billing Invoice (XLS, 38KB) This is the preferred Child
     Development form…". Set as one run of text the link and its
     explanation carry the same weight, so the thing you can click is
     no easier to find than the sentence about it. Naming the shape
     lets the stylesheet set the link as the item and the description
     under it, which is how GOV.UK and the US Web Design System both
     set a list of documents. No word moves. */
  if (opts.items !== false) {
    let n = 0, cut = 0;
    html = html.replace(/<li\b([^>]*)>((?:(?!<\/li>)[\s\S])*?)<\/li>/gi, (m, attrs, inner) => {
      if (/doe-action|doe-item/.test(attrs)) return m;
      const lead = inner.match(/^\s*(?:<strong>\s*)?(<a\b[^>]*>[\s\S]*?<\/a>)/i);
      if (!lead) return m;
      if (/\bbtn\b/.test(lead[1])) return m;
      const at = inner.indexOf(lead[1]) + lead[1].length;
      let after = inner.slice(at);
      /* THE DASH IS THE AUTHOR SAYING "a description follows".
         It is a better test than counting characters — a 26-letter
         description is shorter than a 30-letter source credit — and
         where it is present the length floor drops to almost nothing.
         Group 1 is kept because a link wrapped in <strong> closes it
         here, and dropping that would unbalance the item. */
      /* WHITESPACE AFTER THE DASH IS REQUIRED, and a run of dashes
         counts as one separator. Without the first, a description
         opening "-based funding" had its hyphen eaten; without the
         second, "The Law -- Section 1118(c)" lost one of its two and
         the loss check saw a block it did not recognise. */
      /* THE FORMAT TAG IS NOT PART OF THE DESCRIPTION, and reading
         it as one broke this rule in the way hardest to see.
         filechip runs first, so by the time this rule looks at what
         follows the link, `after` opens with
         <span class="doe-chip">Video</span> — not whitespace and a
         dash. The separator test therefore never matched ANY of
         these rows, and the rule silently collapsed to its fallback:
         a bare 30-character length test, with the tag's own text
         padding the count.
         On /schools/nutrition/training that produced three sibling
         rows, identical in the source, measured at 27, 36 and 25 —
         so only the middle one was marked, and which of them got a
         chevron was decided by how long the word after the dash
         happened to be. The tag is mine; it has no business in a
         measurement of what the author wrote.
         Measured and matched against a chip-free view. The tag
         itself stays exactly where it is. */
      const CHIP = /<span class="doe-chip"[^>]*>[^<]*<\/span>/gi;
      const bare = after.replace(CHIP, '');
      const sep = bare.match(/^((?:<\/strong>)?)(?:\s|&nbsp;)*([-–—]+)(?:\s|&nbsp;)+/i);
      if (!sep && strip(bare).length < 30) return m;
      if (sep && strip(bare).length < 8) return m;
      if (sep) {
        /* The dash is removed where it actually sits — after the
           chip, if there is one — rather than by cutting a length
           measured on the chip-free copy. */
        inner = inner.slice(0, at) + after.replace(
          /^((?:<\/strong>)?)((?:\s|&nbsp;)*(?:<span class="doe-chip"[^>]*>[^<]*<\/span>)?)(?:\s|&nbsp;)*[-–—]+(?:\s|&nbsp;)+/i,
          '$1$2 ');
        cut++;
      }
      n++;
      return /class="/.test(attrs)
        ? `<li${attrs.replace(/class="/, 'class="doe-item ')}>${inner}</li>`
        : `<li class="doe-item"${attrs}>${inner}</li>`;
    });
    /* AND THE SEPARATOR ITSELF GOES, because the treatment has taken
       over its job. The dash was there to show where the title ended
       and the description began; the title is now a different size,
       a different face, a different colour and carries a chevron, so
       the dash is a mark the reader has to step over twice. */
    if (cut) decisions.push({ id: 'itemdash', on: true, label: 'Drop the dash once the link is set apart',
      why: `${cut} of those items separate the link from its description with a dash. The link is now set in the display face at a larger size with a chevron after it, so the dash marks a boundary that is already unmistakable. Only the separator is removed — no word changes.`,
      value: cut + ' separator' + (cut > 1 ? 's' : '') });
    if (n) decisions.push({ id: 'items', on: true, label: 'Separate a link from its description',
      why: `${n} list item${n > 1 ? 's open' : ' opens'} with a link and then explain it, all at the same weight — so the thing you can click is no easier to find than the sentence about it. The link becomes the item and the explanation sits under it.`,
      value: n + ' item' + (n > 1 ? 's' : '') });
  }

  /* (d2) THE ONE ROW IN THE LIST THAT IS NOT A LINK.
     On /learning/mathpathways four resources are links with a
     description and the fifth — "The Case for Math Pathways (White
     Paper)" — is the same shape with no href on it. Written the same
     way by the author, it comes out as the only item with no title
     weight at all, which reads as a mistake in the list rather than a
     document nobody linked.
     THE MISSING LINK IS NOT INVENTED. There is no URL to guess and
     guessing one would be worse than the gap. Only the title is
     given the weight its neighbours have, so the list stops looking
     broken and the fact that this one is not clickable stays true.
     Only inside a list that is ALREADY mostly link-and-description —
     a plain sentence in a plain list is left alone. */
  if (opts.plainlead !== false) {
    let n = 0;
    html = html.replace(/<(ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, at, body) => {
      const lis = [...body.matchAll(/<li\b([^>]*)>((?:(?!<\/li>)[\s\S])*?)<\/li>/gi)];
      if (lis.length < 3) return m;
      if (lis.filter(l => /doe-item/.test(l[1])).length < lis.length * 0.6) return m;
      let out = m;
      for (const li of lis) {
        if (/doe-item|doe-action/.test(li[1])) continue;
        if (/<a\b/i.test(li[2])) continue;
        /* The title, then a separator, then real text after it. */
        /* SPACE ON BOTH SIDES OF THE DASH. Written with `*` either
           side it matched the hyphen INSIDE a token — "SFSP 03-2025,
           SP 08-2025 Non-Congregate Meal Service" was split after
           "SFSP 03", which is not a title and loses the hyphen out of
           a document number. A separator always has air around it. */
        const t = li[2].match(/^\s*(?:<strong>\s*)?([^<]{4,90}?)(?:\s|&nbsp;)+[-–—]+(?:\s|&nbsp;)+([\s\S]+)$/i);
        if (!t || strip(t[2]).length < 20) continue;
        const rebuilt = `<li${/class="/.test(li[1]) ? li[1].replace(/class="/, 'class="doe-item ') : ' class="doe-item"' + li[1]}>`
          + `<span class="doe-item-lead">${t[1].trim()}</span> ${t[2]}</li>`;
        const next = out.replace(li[0], rebuilt);
        if (next === out) continue;
        out = next; n++;
      }
      return out;
    });
    if (n) decisions.push({ id: 'plainlead', on: true, label: 'Give an unlinked item the same title weight',
      why: `${n} item${n > 1 ? 's sit' : ' sits'} in a list of links and descriptions without being a link, so ${n > 1 ? 'they come' : 'it comes'} out as the only row with no title — which reads as a fault in the list. The title takes the same weight as its neighbours. No link is invented, because there is no address to invent.`,
      value: n + ' item' + (n > 1 ? 's' : '') });
  }

  /* A COLON AFTER A LINK, AND A LEADER IN FRONT OF A DESCRIPTION.
     Three shapes, one idea. A colon says the thing before it is a
     TERM being defined, not a destination being announced — so the
     chrome that announces a destination gets out of the way, and the
     term gets the weight that makes it scannable.

       COPPA › : Children's Online Privacy Protection Act
       PL 117-47 › [PDF]: 2021 Cybersecurity Act
       Title 20A: Chapter 13: › The Student Information Privacy Act

     All three read as punctuation colliding with furniture. The
     colon is Matt's; the chevron and the chip are mine, so they are
     the ones that move.

     THE CHEVRON GOES QUIET where a colon follows the link or ends
     its text — 70 links. THE CHIP GOES TO THE END OF THE ROW rather
     than standing between a title and its description — 220, every
     one of them placed there by the file-name rule, so it is my
     placement being corrected rather than an author's.
     AND A PLAIN LEADER IS SET IN BOLD — 143 items on 47 pages read
     "Think-Pair-Share: This technique involves…" with the term in
     the same weight as the sentence explaining it, so nothing in the
     list can be found by scanning. Bold including the colon, which
     is how the contact block already sets a label. */
  if (opts.leadcolon !== false) {
    let bolded = 0, quiet = 0, moved = 0;
    html = html.replace(/<li\b([^>]*)>((?:(?!<\/li>)[\s\S])*)<\/li>/gi, (m, attrs, inner) => {
      let s = inner, changed = false;

      /* (1) The chip standing between a link and its colon. */
      const chipColon = s.match(/<\/a>((?:\s|&nbsp;)*)(<span class="doe-chip"[^>]*>[^<]*<\/span>)((?:\s|&nbsp;)*):/i);
      if (chipColon) {
        s = s.replace(chipColon[0], '</a>:');
        s = s.replace(/((?:\s|&nbsp;)*)$/, '') + ' ' + chipColon[2];
        moved++; changed = true;
      }

      /* (2) The chevron, where a colon sits on either side of the
         link's closing tag. */
      if (/<\/a>(?:\s|&nbsp;)*:/.test(s) || /:(?:\s|&nbsp;)*<\/a>/.test(s)) {
        const before = s;
        s = s.replace(/<a\b([^>]*)>/i, (am, aAttrs) =>
          /\bclass="/.test(aAttrs)
            ? `<a${aAttrs.replace(/\bclass="/, 'class="doe-noarrow ')}>`
            : `<a class="doe-noarrow"${aAttrs}>`);
        if (s !== before) { quiet++; changed = true; }
      }

      /* (3) The plain-text leader. Only where the row OPENS with it,
         so a link-led row is never touched — that is shape (2)'s. */
      const lead = s.match(/^((?:\s|&nbsp;)*)([^<>:]{2,60}):((?:\s|&nbsp;)+)(?=\S)/);
      if (lead) {
        const t = lead[2].trim();
        const rest = s.slice(lead[0].length).replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        /* A leader ending in a digit is a time, a section number or a
           ratio — "10:30", "Title 20A: 4". A row with almost nothing
           after the colon is a label with its content elsewhere, not
           a term with a definition. */
        if (!/\d$/.test(t) && t.split(/\s+/).length <= 8 && rest.length >= 40) {
          s = lead[1] + '<strong>' + t + ':</strong>' + lead[3] + s.slice(lead[0].length);
          bolded++; changed = true;
        }
      }
      return changed ? `<li${attrs}>${s}</li>` : m;
    });

    const bits = [];
    if (bolded) bits.push(bolded + ' leader' + (bolded > 1 ? 's' : '') + ' bolded');
    if (quiet) bits.push(quiet + ' chevron' + (quiet > 1 ? 's' : '') + ' dropped');
    if (moved) bits.push(moved + ' tag' + (moved > 1 ? 's' : '') + ' moved');
    if (bits.length) {
      decisions.push({ id: 'leadcolon', on: true, label: 'Let a colon do its own work',
        why: `A colon marks the words before it as a term and the words after it as what the term means. ${bolded ? `Here ${bolded} list item${bolded > 1 ? 's open' : ' opens'} with a term set in the same weight as its own explanation, so the list cannot be scanned. ` : ''}${quiet ? `${quiet} link${quiet > 1 ? 's sit' : ' sits'} immediately in front of a colon, where the chevron lands between the term and the punctuation that belongs to it. ` : ''}${moved ? `${moved} format tag${moved > 1 ? 's stand' : ' stands'} between a title and its description and move${moved > 1 ? '' : 's'} to the end of the row. ` : ''}No word changes and nothing is removed.`,
        value: bits.join(', ') });
    }
  }

  /* (d2b) AN ADDRESS LOOSE IN THE BODY OF A PAGE.
     A page with a contact block already answers "who do I write to".
     464 addresses are not in one — they sit in a sentence in the
     middle of the page, drawn exactly like the twelve links around
     them that go to web pages, so the one link that opens a mail
     window is indistinguishable from the ones that do not.
     The chip is the same envelope the banner's contact link uses, so
     writing to someone looks the same wherever it appears.
     NOT INSIDE A CONTACT BLOCK, where the block is already the
     answer, and not on a button, which is a different object. */
  if (opts.emailchip !== false) {
    let n = 0;
    const cubeSpans = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?contact-cube(?:\s[^"]*)?"[^>]*>/gi)]
      .map(m => {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(html))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        return [m.index, i];
      });
    html = html.replace(/<a\b([^>]*href="mailto:[^"]*"[^>]*)>/gi, (m, attrs, at) => {
      if (cubeSpans.some(([a, b]) => at >= a && at < b)) return m;
      if (/\bbtn\b|doe-email/.test(attrs)) return m;
      n++;
      return /class="/.test(attrs)
        ? `<a${attrs.replace(/class="/, 'class="doe-email ')}>`
        : `<a class="doe-email"${attrs}>`;
    });
    if (n) decisions.push({ id: 'emailchip', on: true, label: 'Make a loose address look like an address',
      why: `${n} email address${n > 1 ? 'es sit' : ' sits'} in the body of this page rather than in a contact block, drawn exactly like every other link — so the one that opens a mail window looks the same as the ones that go to web pages. The chip carries the same envelope the banner's contact link uses. The address itself does not change.`,
      value: n + ' address' + (n > 1 ? 'es' : '') });
  }

  /* (d2c) A ROSTER IS NOT AN INTRODUCTION.
     The State Board committee pages open with a narrow card headed
     "Membership" holding three or four names, and only then, to the
     right of it, what the committee actually does and when it meets.
     Nothing on the page is wrong; the order is. A reader arriving at
     the School Construction Committee meets Fern Desjardins before
     they are told the committee meets at 9:00 in Room 500 — and on a
     phone the columns stack in source order, so they get the three
     names and nothing else on the first screen.
     A roster is reference: it answers a question you only have once
     you know what the thing is. So the column carrying the prose
     leads and the roster becomes the sidebar it already looks like.

     DELIBERATELY NARROW. 49 rows on the site put a narrow column
     first and 45 of them are proper sidebars — resource lists, unit
     links, guiding principles — which are content in their own right
     and are left exactly as they are. This fires only where the
     narrow column is a single card titled as a roster whose body is a
     list of names: no links, no prose, nothing but people. Only the
     two columns' order changes; not a word moves and neither column
     is resized. */
  if (opts.roster !== false) {
    let n = 0;
    const ROSTER = /^(members|membership|committee\s+members|board\s+members|current\s+members)$/i;
    const rowsR = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    for (const row of rowsR.reverse()) {                 // back to front: offsets stay valid
      /* THE COLUMNS ARE READ BY COUNTING DIVS, NOT BY LOOKING FOR
         THE NEXT ONE. A lookahead for the next col- div has nothing
         to stop at on the LAST column, so it ran to the end of the
         row's text and swallowed the row's own closing </div>.
         Swapping the two then moved that tag into the middle: the row
         closed early and the second column was left outside it. The
         loss check never saw it, because no text had gone anywhere —
         a reminder that it proves words survive, not that the markup
         is still standing. */
      const cols = [];
      for (const m of row[1].matchAll(/<div[^>]*class="[^"]*\bcol-[a-z]+-(\d+)[^"]*"[^>]*>/gi)) {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(row[1]))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        cols.push({ w: +m[1], all: row[1].slice(m.index, i), inner: row[1].slice(m.index + m[0].length, i - 6) });
      }
      if (cols.length !== 2) continue;
      const [narrow, wide] = cols;
      if (narrow.w >= wide.w) continue;                  // the roster must be the one leading
      const title = narrow.inner.match(/<div[^>]*class="[^"]*card-header[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (!title || !ROSTER.test(strip(title[1]))) continue;
      /* A list of people: list items, no links, no paragraphs. */
      if (/<a\b|<p[\s>]/i.test(narrow.inner.replace(title[0], ''))) continue;
      if (!/<li[\s>]/i.test(narrow.inner)) continue;
      if (strip(wide.inner).length < 80) continue;
      const rebuilt = row[1].replace(narrow.all, '\u0000').replace(wide.all, narrow.all).replace('\u0000', wide.all);
      if (rebuilt === row[1] || rebuilt.includes('\u0000')) continue;
      html = html.slice(0, row.index) + row[0].replace(row[1], rebuilt) + html.slice(row.index + row[0].length);
      n++;
    }
    if (n) decisions.push({ id: 'roster', on: true, label: 'Say what it is before who is on it',
      why: `This page opens with a narrow card listing the members, and only to the right of it says what the committee does and when it meets. A roster answers a question the reader does not have yet — and because columns stack in source order, on a phone the names are the whole first screen. The two columns swap; no words move and neither column changes width.`,
      value: n + ' row' + (n > 1 ? 's' : '') });
  }

  /* (d2d) A PICTURE GIVEN MORE ROOM THAN THE WORDS.
     /sel/faq answers "What is Social Emotional Learning?" with 756
     characters of definition in a col-sm-3 beside the CASEL wheel in
     a col-sm-9. At 1280px that is a 236px column: about 25 characters
     to the line, which is roughly a newspaper classified ad, and it
     is why the text reads as bunched down the side of the page.
     A diagram is legible across a wide range of sizes and can carry a
     "view full size" link besides; a paragraph cannot — below about
     45 characters to the line a reader loses their place returning to
     the left margin every few words.
     EVENED RATHER THAN REVERSED. Swapping the two would give the text
     708px, about 88 characters to the line, which overshoots the
     comfortable range in the other direction. Half each is ~460px:
     the text lands near 58 characters, which is squarely inside it,
     and the diagram stays big enough to read. Only the two width
     classes change. */
  if (opts.textwidth !== false) {
    let n = 0;
    const rowsT = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    for (const row of rowsT.reverse()) {                 // back to front: offsets stay valid
      const cols = [];
      for (const m of row[1].matchAll(/<div[^>]*class="[^"]*\bcol-[a-z]+-(\d+)[^"]*"[^>]*>/gi)) {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(row[1]))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        cols.push({ w: +m[1], inner: row[1].slice(m.index + m[0].length, i - 6) });
      }
      if (cols.length !== 2) continue;
      /* A picture and nothing else worth reading, against real prose. */
      const isImg = c => /<img/i.test(c.inner) && strip(c.inner).length < 90;
      const isText = c => !/<img|<iframe/i.test(c.inner) && strip(c.inner).length >= 300;
      const [A, B] = cols;
      const pair = isText(A) && isImg(B) ? [A, B] : (isText(B) && isImg(A) ? [B, A] : null);
      if (!pair || pair[0].w >= pair[1].w) continue;
      let k = 0;
      const rebuilt = row[1].replace(/class="([^"]*)\bcol-([a-z]+)-\d+/g, (m, pre, bp) => (k++, `class="${pre}col-${bp}-6`));
      const next = html.slice(0, row.index) + row[0].replace(row[1], rebuilt) + html.slice(row.index + row[0].length);
      if (next === html) continue;
      html = next; n++;
    }
    if (n) decisions.push({ id: 'textwidth', on: true, label: 'Stop the text being the narrow column',
      why: `A paragraph here sits in a quarter-width column beside a picture given three quarters — about 25 characters to the line, which is why the words read as bunched down the side. Half each puts the text near 58 characters, inside the range a reader can follow, and leaves the picture big enough to read. Only the two width classes change.`,
      value: n + ' row' + (n > 1 ? 's' : '') });
  }

  /* (d2e) A LIST WRITTEN AS PARAGRAPHS.
     13 runs on 9 pages set out a series as consecutive paragraphs of
     the form "Self Awareness- Able to recognize ones emotions…", one
     per item. Every one of them is a term and its definition, and
     with the term set in the same weight as the definition the five
     CASEL competencies on /sel/faq read as five paragraphs of prose
     rather than five named things.
     The term takes the weight. Nothing is reordered, nothing becomes
     a list, and the separator stays — this is the smallest change
     that makes the structure visible.
     A RUN OF AT LEAST THREE. One paragraph that happens to open with
     a dash is a sentence; three in a row with the same shape is a
     series the author wrote as one. */
  if (opts.termlead !== false) {
    let n = 0;
    /* The space BEFORE the dash is captured separately, because
       whether there is one decides where the weight can close. */
    const TERM = /^(<p[^>]*>)((?:\s|&nbsp;)*)([^-<>]{4,60}?)((?:\s|&nbsp;)*)-((?:\s|&nbsp;)+)([\s\S]{40,})$/i;
    const ps = [...html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)];
    let run = [];
    const flush = () => {
      if (run.length >= 3) for (const m of run.slice().reverse()) {
        const t = m[0].match(TERM); if (!t) continue;
        /* THE SEPARATOR IS LEFT EXACTLY AS THE AUTHOR WROTE IT, and
           that decides where the weight closes.
           A tag boundary reads as a space. "Self Awareness- Able to"
           has no space before its dash, so closing the <strong>
           in front of the dash would put one there — inventing
           "Awareness - Able" out of "Awareness- Able". The dash goes
           inside the weight instead, which is also the run-in heading
           convention: a term carries its own punctuation.
           "1. Application - Officials of…" already has a space either
           side, and pulling the dash into the weight would take that
           space away. There the weight closes first and the author's
           spacing survives untouched.
           Either way not one character of text moves — which is the
           whole point, and the loss check is what proved the first
           version was moving them. */
        const rebuilt = t[4]
          ? `${t[1]}${t[2]}<strong>${t[3].trim()}</strong>${t[4]}-${t[5]}${t[6]}`
          : `${t[1]}${t[2]}<strong>${t[3].trim()}-</strong>${t[5]}${t[6]}`;
        const next = html.replace(m[0], rebuilt);
        if (next === html) continue;
        html = next; n++;
      }
      run = [];
    };
    for (let i = 0; i < ps.length; i++) {
      const m = ps[i];
      const between = i ? html.slice(ps[i - 1].index + ps[i - 1][0].length, m.index) : null;
      if (between !== null && between.trim()) flush();          // not adjacent siblings
      if (TERM.test(m[0]) && !/<p[^>]*>\s*<strong/i.test(m[0])) run.push(m);
      else flush();
    }
    flush();
    if (n) decisions.push({ id: 'termlead', on: true, label: 'Give a named item its name',
      why: `${n} paragraph${n > 1 ? 's set' : ' sets'} out a term and its definition — "Self Awareness- Able to recognize ones emotions…" — with the term in the same weight as the definition, so a series of named things reads as a run of prose. The term takes the weight. No word moves and the order does not change.`,
      value: n + ' term' + (n > 1 ? 's' : '') });
  }

  /* (d2f) A JOB TITLE IS SET IN ITALICS.
     The contact block's documented shape is the name in bold, the
     job title in italics under it, then the labelled fields — and the
     site already writes it that way 186 times. 99 more, across 86
     pages, leave the title in plain text, so the same block is drawn
     two ways depending on which page you land on and the title runs
     into the name above it.
     THE STANDARD IS THE SITE'S OWN, not mine: two thirds of these
     already do it, which is what makes it the house pattern rather
     than a preference.
     Only the line directly under a bold name, and only when it is not
     one of the labelled fields — Phone, Email, Fax, TTY and the rest
     are data, not a title. Not a word changes. */
  if (opts.contacttitle !== false) {
    let n = 0;
    const FIELD = /^(phone|email|e-mail|tel|telephone|fax|tty|address|mailing|cell|mobile|office|web|website|room|suite)\b/i;
    html = html.replace(/<div[^>]*class="(?:[^"]*\s)?contact-cube(?:\s[^"]*)?"[^>]*>[\s\S]*?(?=<div[^>]*class="(?:[^"]*\s)?contact-cube|$)/gi,
      (cube) => cube.replace(/(<strong>\s*[^<]{3,60}?\s*<\/strong>\s*<br\s*\/?>\s*)([^<]{3,90}?)(\s*)(?=<br\s*\/?>|<\/p>)/gi,
        (m, lead, title, tail) => {
          const t = title.replace(/&nbsp;/g, ' ').trim();
          if (!t || FIELD.test(t)) return m;
          n++; return `${lead}<em>${title.trim()}</em>${tail}`;
        }));
    if (n) decisions.push({ id: 'contacttitle', on: true, label: 'Set a job title the way the rest of the site does',
      why: `${n} job title${n > 1 ? 's sit' : ' sits'} in plain text under the person's name, where 186 elsewhere on the site are in italics — so the same contact block is drawn two ways depending on the page, and the title runs into the name above it. The standard here is the site's own, not a preference: two thirds of these blocks already do it. No word changes.`,
      value: n + ' title' + (n > 1 ? 's' : '') });
  }

  /* (d2k) A SECTION HEADER IS LEFT-ALIGNED.
     The component list says it plainly — "Left-aligned — do NOT
     center blockhead headings" — and 1,103 of the 1,139 on the site
     follow it. The 36 that do not sit on 25 pages.
     It is not only consistency. The band runs the full width of the
     column, so a centred title has no fixed relationship to anything
     else on the page, and a two-line one centres both lines and
     breaks the left edge every other heading shares.
     HERE RATHER THAN IN THE CLEANUP, because most of these blockheads
     do not exist until the sectioning step above builds them — a rule
     in interior-cleanup.js looking for .blockhead finds almost none
     of them, which is exactly what happened on the first attempt. */
  if (opts.leftalign !== false) {
    let n = 0;
    html = html.replace(/(<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*<h[1-6])([^>]*)>/gi, (m, open, attrs) => {
      let out = attrs.replace(/\sclass="([^"]*)"/i, (cm, cls) => {
        const kept = cls.replace(/\b(?:text-align-center|text-center)\b/g, '').replace(/\s{2,}/g, ' ').trim();
        return kept ? ` class="${kept}"` : '';
      }).replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*text-align\s*:\s*center\s*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return open + out + '>';
    });
    if (n) decisions.push({ id: 'leftalign', on: true, label: 'Left-align a section header',
      why: `${n} section header${n > 1 ? 's are' : ' is'} centred, where 1,103 of the 1,139 on the site are left-aligned — the component list says not to centre them. The band runs the full width of the column, so a centred title has no fixed relationship to anything else, and a two-line one breaks the left edge every other heading shares. Only the alignment changes.`,
      value: n + ' header' + (n > 1 ? 's' : '') });
  }

  /* (d2j) "PLEASE NOTE" IS NOT A SECTION OF THE PAGE.
     A section header names a part of the page, and a reader uses the
     contents list to jump between them. "PLEASE NOTE" names nothing —
     it is the site's own word for a callout, set as a heading because
     a heading is the biggest thing in the editor.
     On /learning/highered/transcripts it was worse than that: the
     notice sat inside a one-cell table, so a Word callout came out as
     a full-width navy section band with two centred paragraphs under
     it, and it would have appeared in the banner's contents list as
     somewhere to go.
     The heading and the paragraphs it introduces become one dc-note,
     which is what the site uses for exactly this. The words are
     untouched, including the "PLEASE NOTE" itself. */
  if (opts.notice !== false) {
    let n = 0;
    const NOTICE = /^(please\s+note|note|important|important\s+note|attention|notice|please\s+read|reminder)[:!.]?$/i;
    html = html.replace(/<div[^>]*class="(?:[^"]*\s)?blockhead(?:\s[^"]*)?"[^>]*>\s*<h2([^>]*)>([\s\S]*?)<\/h2>\s*<\/div>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?(?:blockhead|doe-sub|contact-cube)|<table|$)/gi,
      (m, hAttrs, head, rest) => {
        if (!NOTICE.test(strip(head))) return m;
        /* WHERE THE NOTICE ENDS IS THE AUTHOR'S OWN MARK.
           On /learning/highered/transcripts the two paragraphs of the
           notice are centred and the page's body text that follows is
           not — so the centring says where it stops. Reading instead
           to the next heading swept up 900 characters of ordinary
           prose and the guard below rightly refused the lot.
           Without that signal, two short paragraphs at most: a notice
           is a notice because it is brief. */
        const ps = [...rest.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)];
        const centred = /text-align-center/i.test(hAttrs);
        const take = [];
        for (const pm of ps) {
          if (rest.slice(take.length ? take[take.length - 1].index + take[take.length - 1][0].length : 0, pm.index).trim()) break;
          if (centred && !/text-align-center/i.test(pm[0].slice(0, pm[0].indexOf('>')))) break;
          if (!centred && (take.length >= 2 || strip(pm[0]).length > 320)) break;
          take.push(pm);
        }
        if (!take.length) return m;
        const body = take.map(t => t[0]).join('\n');
        const after = rest.slice(take[take.length - 1].index + take[take.length - 1][0].length);
        n++;
        return `<div class="dc-note">\n<p><strong>${strip(head)}</strong></p>\n${body}\n</div>\n` + after;
      });
    if (n) decisions.push({ id: 'notice', on: true, label: 'Let a notice be a callout, not a section',
      why: `${n} section header${n > 1 ? 's say' : ' says'} only "please note" or the like. A section header names a part of the page and the contents list offers it as somewhere to jump to — but this names nothing; it is the site's own word for a callout, set as a heading because a heading is the biggest thing in the editor. It becomes the callout, with the paragraphs it introduces inside it. Every word is kept, including the notice itself.`,
      value: n + ' notice' + (n > 1 ? 's' : '') });
  }

  /* (d2h) A SUB-HEADING WITH NOTHING UNDER IT IS A PARENT.
     20 sub-headings on 14 pages are followed immediately by another
     heading, with not one word in between. A heading that has no
     content of its own is not labelling anything — it is introducing
     the group of headings beneath it, which is what a section header
     does.
     /funding/reports/essa-guidance is the case Matt spotted: "Guidance
     on expenditures that occur either at the grade level or as a
     central service" and then straight into "Grade Level
     Expenditures", both at the same level, so two headings back to
     back say nothing about how they relate. The first becomes the
     section and the second stays its sub-heading — which is what the
     words already say.
     The outline rebuild cannot see this: it closes gaps where levels
     SKIP, and these two do not skip, they collide. */
  if (opts.subparent !== false) {
    let n = 0;
    html = html.replace(/<div([^>]*)class="((?:[^"]*\s)?)doe-sub((?:\s[^"]*)?)"([^>]*)>\s*<h3([^>]*)>([\s\S]*?)<\/h3>\s*<\/div>(\s*)(?=<div[^>]*class="(?:[^"]*\s)?doe-sub)/gi,
      (m, a1, c1, c2, a2, hAttrs, text, gap) => {
        n++;
        const id = (a1 + a2 + hAttrs).match(/\sid="[^"]*"/i);
        return `<div class="blockhead"${id ? id[0] : ''}>\n<h2>${text.trim()}</h2>\n</div>${gap}`;
      });
    if (n) decisions.push({ id: 'subparent', on: true, label: 'Let a heading that introduces others be the section',
      why: `${n} sub-heading${n > 1 ? 's are' : ' is'} followed straight away by another sub-heading with not one word in between. A heading with no content of its own is not labelling anything — it is introducing the group beneath it, which is what a section header does. Two headings back to back tell the reader nothing about how they relate; this makes the first the section and leaves the second inside it. No word changes.`,
      value: n + ' heading' + (n > 1 ? 's' : '') });
  }

  /* (d2i) A LABEL IN ITS OWN PARAGRAPH, ABOVE THE SENTENCE IT LABELS.
     104 places on 38 pages write a bold label as a whole paragraph
     and the thing it labels as the next one:
        <p><strong>Capital Projects Fund</strong></p>
        <p>Expenditures occurring for capital projects…</p>
     Two blocks, two margins and a line break, to say one thing. Down
     a list of exclusions that is a column of orphaned labels with
     gaps between them — "just tons of line breaks".
     Run in, with a colon, which is how a term and its definition are
     set: the label keeps its weight and the sentence follows it on
     the same line.
     THE REGEX IS GUARDED, and it has to be. Written without the test
     below, `<strong>…</strong>` backtracks across an intervening
     `</strong><strong>` and swallows two blocks into one heading —
     which is exactly what it did once before, on /cds/childfindform
     and /schools/nutrition/programs/fd. */
  if (opts.runin !== false) {
    let n = 0;
    html = html.replace(/<p([^>]*)>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>\s*<p([^>]*)>([\s\S]*?)<\/p>/gi,
      (m, a1, label, a2, body) => {
        if (/<br|<\/strong|<\/?p\b/i.test(label)) return m;
        if (/^\s*<strong>/i.test(body)) return m;
        /* A LABEL ABOVE A LIST STAYS ABOVE IT. If the paragraph it
           labels carries line breaks it is not a sentence — it is
           several, one per line, like the Food Service Committee's
           list of representatives. Running a label into the first of
           them attaches it to one name and leaves the rest hanging,
           and the run-in was meant for a term and its definition. */
        if (/<br/i.test(body)) return m;
        const L = strip(label), B = strip(body);
        if (!L || L.length > 60 || /[.:!?]$/.test(L)) return m;
        /* "PLEASE NOTE" IS NOT A TERM. The run-in sets a term and its
           definition — "Capital Projects Fund: Expenditures…" — and a
           notice word defines nothing; it announces the block it sits
           on. Run in, it becomes a prefix on the first sentence, and
           on /learning/highered/transcripts that prefix then travelled
           into the banner as the start of the page's description. */
        if (/^(please\s+note|note|important|attention|notice|please\s+read|reminder|warning)$/i.test(L)) return m;
        if (B.length < 25) return m;
        n++;
        /* DECLARED AS MARKUP, NOT AS PRE-STRIPPED TEXT. The check
           turns the document into blocks with textOf, which decodes
           entities on the way; a string put through this file's own
           strip() first has had its tags removed by a different route
           and an &amp; or an &nbsp; can survive it. The two then key
           differently and a block that was declared reads as lost.
           Handing over the original fragments lets the check
           normalise both sides by the same path. */
        removedOnPurpose.push(label);
        removedOnPurpose.push(body);
        joined.push(`${label} : ${body}`);
        return `<p${a1}><strong>${label.trim()}:</strong> ${body.trim()}</p>`;
      });
    if (n) decisions.push({ id: 'runin', on: true, label: 'Run a label into the line it labels',
      why: `${n} label${n > 1 ? 's sit' : ' sits'} alone in a paragraph with the sentence it labels in the next one — two blocks, two margins and a line break to say one thing. Down a list of exclusions that reads as a column of orphaned labels. Run in with a colon, which is how a term and its definition are set. The only character added is the colon.`,
      value: n + ' label' + (n > 1 ? 's' : '') });
  }

  /* (d3) A ROW OF CARDS THAT DOES NOT REACH THE EDGE OF THE PAGE.
     10 rows on 8 pages hold two or three cards in columns that add up
     to eight or nine of the twelve, so the grid stops short and the
     rest of the line is blank — and because the cards are narrower
     than they need to be, everything in them is taller than it needs
     to be. On /learning/mathpathways/studentdecisions the last pair
     sit in col-sm-4 each: two thirds of the width, a third empty, and
     a page that scrolls further than it has to.
     Only the column classes change, and only where the row holds
     cards. A row someone has weighted by hand already adds to twelve
     and never reaches this. */
  if (opts.fill !== false) {
    let n = 0;
    const rowsF = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)];
    for (const row of rowsF.reverse()) {                 // back to front: offsets stay valid
      const cols = [...row[1].matchAll(/class="[^"]*\bcol-[a-z]+-(\d+)/g)].map(x => +x[1]);
      if (cols.length < 2) continue;
      if (cols.reduce((a, b) => a + b, 0) >= 12) continue;
      if (!/class="(?:[^"]*\s)?card(?:\s[^"]*)?"/.test(row[1])) continue;
      /* Shared out evenly, and the remainder to the first card so the
         widths stay whole columns — three cards become 4/4/4, two
         become 6/6, five become 3/3/2/2/2. */
      const base = Math.floor(12 / cols.length);
      let extra = 12 - base * cols.length, k = 0;
      const rebuilt = row[1].replace(/class="([^"]*)\bcol-([a-z]+)-\d+/g, (mm, pre, bp) =>
        `class="${pre}col-${bp}-${base + (k++ < extra ? 1 : 0)}`);
      const next = html.slice(0, row.index) + row[0].replace(row[1], rebuilt) + html.slice(row.index + row[0].length);
      if (next === html) continue;
      html = next; n++;
    }
    if (n) decisions.push({ id: 'fill', on: true, label: 'Let a short row of cards reach the page edge',
      why: `${n} row${n > 1 ? 's hold' : ' holds'} cards in columns that add up to less than the full twelve, so the grid stops short and the rest of the line is blank. The cards are narrower than they need to be, which makes everything inside them taller — and the page longer. Only the column widths change.`,
      value: n + ' row' + (n > 1 ? 's' : '') });
  }

  /* (c13) CONTENT THAT SITS ABOVE ITS OWN SECTION HEADER.
     /schools/schoolops/waivers opens with a button — "Reschedule
     Instructional Days or Request a Waiver" — then the header
     "Waivers and Rescheduled Instructional Days", then immediately
     the next header. The button IS that section's content; it is
     just written above the heading instead of below it, which leaves
     a section with nothing in it and a button belonging to nothing.
     Moved only where BOTH are true: something is stranded between
     the banner and the first header, and that first section is
     otherwise empty. Where the section has content of its own the
     stranded part is an introduction and stays where the author put
     it — 92 pages have a lead-in like that and none of them are
     touched. */
  if (opts.stranded !== false) {
    const bh = [...html.matchAll(/<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*<h2[^>]*>[\s\S]*?<\/h2>\s*<\/div>/gi)];
    if (bh.length >= 2) {
      const heroOpen = html.indexOf('<div class="doe-hero');
      const heroEnd = heroOpen >= 0 ? html.indexOf('</div>', html.lastIndexOf('</nav>', bh[0].index)) : -1;
      const start = heroEnd > 0 ? heroEnd + 6 : 0;
      if (bh[0].index > start) {
        const stranded = html.slice(start, bh[0].index);
        const between = strip(html.slice(bh[0].index + bh[0][0].length, bh[1].index));
        if (strip(stranded).length > 0 && between.length === 0) {
          html = html.slice(0, start) + html.slice(bh[0].index, bh[0].index + bh[0][0].length) +
                 '\n' + stranded.trim() + '\n' + html.slice(bh[0].index + bh[0][0].length);
          decisions.push({ id: 'stranded', on: true, label: 'Put the content under its own heading',
            why: `"${strip(bh[0][0]).slice(0, 44)}" had nothing beneath it, and the ${strip(stranded).length > 60 ? 'content' : 'button'} that belongs to it was written above the heading instead of below. Nothing is added or removed; it moves under its own title.`,
            value: 'moved' });
        }
      }
    }
  }

  /* (c14) AN IMAGE THAT DOES NOT LOAD.
     Six of them across the site, each a 404 — /MTSS has one where its
     framework diagram should be. A broken image is worse than no
     image: the reader sees a damaged page rather than a plain one,
     and a screen reader announces alt text for something that is not
     there. Checked over the wire by check-images.js, not guessed.
     The paragraph around it goes too if the image was all it held. */
  if (opts.brokenImages !== false && BROKEN_IMAGES.size) {
    let n = 0, first = null;
    html = html.replace(/<img[^>]*>/gi, (m) => {
      const src = (m.match(/src="([^"]*)"/i) || [])[1];
      if (!src || !BROKEN_IMAGES.has(dec(src))) return m;
      n++; if (!first) first = (src.split('/').pop() || src).slice(0, 44);
      return '';
    });
    if (n) decisions.push({ id: 'brokenimg', on: true, label: 'Remove an image that does not load',
      /* dec(), not decodeURIComponent(). A filename with a stray %
         that is not a valid escape throws URI malformed, and one file
         on /exploreeducation/makemove does exactly that — which took
         the whole proposal for that page down. dec() is the helper
         that already catches it. */
      why: `${n} image${n > 1 ? 's return' : ' returns'} a 404 — "${dec(first)}". A broken image leaves a broken-icon and its alt text where a picture should be, which reads as a damaged page rather than a plain one.`,
      value: n + ' removed' });
  }

  /* (d) TABLES BACK TO THE STANDARD PATTERN.
     324 tables across the site, and 145 of them carry no .table class
     at all, so they inherit nothing — while 15 more are pinned to a
     pixel width measured against some other page's column. A 442px
     table in an 840px column is the "messed up in the accordion"
     case: it is not the accordion, it is a width written in 2019.
     Attributes only. No cell, no row and no word is touched. */
  if (opts.tables !== false) {
    let fixed = 0, widths = 0;
    html = html.replace(/<table\b[^>]*>/gi, t => {
      let out = t, changed = false;
      /* A width in pixels, and the junk width="0" / width="" that
         Word and the old editor left behind. */
      if (/style="[^"]*width:\s*\d{2,}px/i.test(out)) {
        out = out.replace(/(style="[^"]*?)width:\s*\d+px;?\s*/i, '$1');
        out = out.replace(/\sstyle="\s*"/i, '');
        widths++; changed = true;
      }
      if (/\swidth="(0|)"/i.test(out)) { out = out.replace(/\swidth="(0|)"/i, ''); changed = true; }
      if (!/class="[^"]*\btable\b/i.test(out)) {
        out = /class="/.test(out) ? out.replace(/class="/, 'class="table table-bordered ')
                                  : out.replace('<table', '<table class="table table-bordered"');
        changed = true;
      }
      if (!/\swidth=/i.test(out)) { out = out.replace('<table', '<table width="100%"'); changed = true; }
      if (changed) fixed++;
      return out;
    });
    if (fixed) {
      decisions.push({ id: 'tables', on: true, label: 'Put the tables back on the standard pattern',
        why: `${fixed} table${fixed > 1 ? 's were' : ' was'} carrying its own width and styling instead of the site's` +
             (widths ? `, including ${widths} pinned to a fixed pixel width that does not fit this column` : '') + '.',
        value: fixed + ' table' + (fixed > 1 ? 's' : '') });
    }
  }

  /* ── 2. THE TITLE ECHO ──────────────────────────────────────── */
  if (opts.removeEcho !== false) {
    const m = html.match(/<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>\s*<\/div>/i);
    if (m && norm(node.title).length > 12 && norm(m[1]).startsWith(norm(node.title).slice(0, 18))) {
      html = html.replace(m[0], '');
      removedOnPurpose.push(strip(m[1]));
      decisions.push({ id: 'echo', on: true, label: 'Remove the first section header',
        removes: strip(m[1]),
        why: `"${strip(m[1])}" repeats the page title, so the reader is told the same thing twice before any content.` });
    }
  }

  /* ── 3. THE DESCRIPTION ─────────────────────────────────────── */
  let deck = opts.deck !== undefined ? opts.deck : null;
  let deckJoined = null;
  if (deck === null && opts.useDeck !== false) {
    /* THE WINDOW STOPS AT THE FIRST HEADING so a paragraph is never
       lifted out of the middle of a section — but on a page that opens
       "Overview" and then introduces itself, that excluded the
       introduction and the page got no description at all.
       So a LEADING heading is stepped over: one that is generic enough
       to be the page's own opening rather than a topic of its own, and
       only when the section keeps other content after the paragraph
       moves. /schools/safeschools/fostercare is the case — its intro
       is the first thing a reader sees and it sits under "Overview". */
    const OPENER = /^(overview|introduction|about(\s+this\s+page)?|welcome|summary|background|purpose|at\s+a\s+glance)$/i;
    let from = 0;
    const lead = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (lead && OPENER.test(strip(lead[1])) && html.slice(0, lead.index).replace(/<[^>]+>/g, '').trim().length < 40) {
      const rest = html.slice(lead.index + lead[0].length);
      const firstP = rest.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      /* Only if the section still has something left to say. */
      const after = firstP ? rest.slice(firstP.index + firstP[0].length) : '';
      const nextHead = after.search(/<h[1-6][\s>]/i);
      if (firstP && strip(nextHead < 0 ? after : after.slice(0, nextHead)).length > 80) {
        from = lead.index + lead[0].length;
      }
    }
    /* AND THE PARAGRAPH HAS TO BE THE PAGE'S OWN, not something a
       component is saying. 53 descriptions had been taken out of the
       middle of one: 26 from cards, 11 from jumbotrons, 8 from notes,
       5 from accordion panels and 3 from contact blocks.
       A note is an aside — that is what makes it a note — so its words
       are the least summary-like on the page, and hoisting them to
       the top of the banner states an exception as though it were the
       point. /learning/standardsreview/worldlanguages is the case.
       Recomputed here rather than reused from the sectioning step,
       because every transform since has moved the offsets. */
    const deckSpans = componentSpans(html);
    /* NOT A BLANKET RULE, THOUGH — a note CAN be the opening.
       /pl/math/addition begins with one and it is the page's own
       introduction: "Welcome to the asynchronous module… read through
       the materials, watch the short video clips…", 620 characters of
       prose with one incidental mailto.
       /learning/standardsreview/worldlanguages also begins with one,
       and it is a signpost: "Looking for the standards themselves?
       Visit the Maine Learning Results for World Languages." — 110
       characters, 40% of them inside a link.
       Position cannot tell those apart; both are the first thing on
       the page. What tells them apart is what the paragraph IS. So a
       paragraph inside a component qualifies only when it opens the
       page, runs to real length, and is mostly not a link — and only
       from a note or a jumbotron, because a card, a contact block and
       an accordion panel are never a page's introduction. */
    const openingComponent = (() => {
      const first = deckSpans.slice().sort((a, b) => a[0] - b[0])[0];
      if (!first) return null;
      if (strip(html.slice(0, first[0])).length) return null;       // something came before it
      const tag = html.slice(first[0], first[0] + 200);
      return /class="[^"]*\b(dc-note|jumbotron)\b/.test(tag) ? first : null;
    })();
    const inside = (i, text) => {
      const span = deckSpans.find(([a, b]) => i >= a && i < b);
      if (!span) return false;
      if (!openingComponent || span[0] !== openingComponent[0]) return true;
      const t = strip(text);
      const linked = (text.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [])
        .reduce((n, a) => n + strip(a).length, 0);
      /* Substantial, and not mostly a link to somewhere else. */
      return !(t.length >= 200 && linked / t.length < 0.25);
    };
    const upTo = html.slice(from).search(/<h[1-6][\s>]/i);
    const head = upTo > 200 ? html.slice(from, from + upTo) : html.slice(from);
    for (const m of [...head.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].slice(0, 6)) {
      if (/<img|<iframe/i.test(m[1])) continue;
      /* A LEAD DESCRIBES THE PAGE; A LINK GOES SOMEWHERE ELSE.
         /funding/reports/essa-guidance opened with a paragraph
         holding nothing but a link to the guidance PDF, and it was
         lifted into the banner as the page's description — so the
         banner's job of saying what the page is was done by a file
         name. A paragraph that is only a link is a call to action and
         is handled as one below. */
      {
        const only = m[1].match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
        if (only.length === 1 && strip(m[1]) === strip(only[0])) continue;
      }
      /* AND A DATED NOTICE IS NOT WHAT THE PAGE IS ABOUT.
         "Update: 2025–2026 Preventing Student Homelessness funds are
         no longer available" is true this year and wrong next year,
         and the banner is the one place on the page that should still
         read correctly when it is. The note exception above — which
         lets a substantial opening callout be the description — was
         written for /pl/math/addition, where the note IS the page's
         introduction. A notice announces a change to the page; an
         introduction says what the page is. The word in front of the
         colon tells them apart. */
      if (/^\s*(?:update|updated|note|new|important|reminder|notice|attention|please note|coming soon)\s*[:!—–-]/i.test(strip(m[1]))) continue;
      /* AND NEITHER IS ITEM ONE OF A LIST.
         /learning/esea/titleIII/snapshot opens "All federally-funded
         program costs must be:" and then runs the three principles
         as a numbered paragraph. The lead-in is under 60 characters
         so it was skipped, and the banner took "(1) Reasonable:
         consistent with prudent business practice…" — the page
         introducing itself halfway through its own first list, with
         the sentence that set it up left behind underneath.
         A paragraph that opens with a list marker is part of a list;
         the description is somewhere else or there isn't one. */
      if (/^\s*[([]?\s*(?:\d{1,2}|[a-z]|[ivx]{1,4})\s*[).\]]/i.test(strip(m[1]))) continue;
      /* NOR A SENTENCE THAT CONTINUES ONE. "In addition, costs must
         be aligned with generally accepted accounting principles…"
         is the third paragraph of an argument; hoisted into the
         banner it opens the page by adding to something the reader
         has not been told yet. Two pages do this. A description that
         starts with "In addition" is not a description, and no
         banner at all reads better than one that starts mid-thought. */
      if (/^\s*(?:in addition|however|also|therefore|furthermore|moreover|additionally|as such|that said|in other words|for example|for instance|as a result|finally|likewise|meanwhile|conversely|nevertheless|nonetheless|similarly|in contrast|on the other hand)\b[,:]?/i.test(strip(m[1]))) continue;
      /* NOR IS AN INSTRUCTION TO GET IN TOUCH. "If you have questions
         regarding any of our trainings, please contact a member of
         the Child Nutrition staff" is not what the page is about —
         it is what to do when the page has not answered you, which
         is the last thing a reader needs, not the first. Six pages
         open that way, four of them Child Nutrition.
         It becomes a contact block instead; see the rule below. */
      if (CONTACT_LEAD.test(strip(m[1]))) continue;
      if (strip(m[1]).length < 60) continue;
      if (inside(from + m.index, m[1])) continue;
      /* NO HARD LINE BREAKS IN A DESCRIPTION. Authors put <br> where
         they wanted a line to end in the old layout — "…for
         information<br>on receiving ADDITIONAL REIMBURSEMENT…" on
         /schools/nutrition/programs/localfoods/producefund. In a
         banner that sets its own measure, a break mid-sentence just
         ends the line early wherever the reader's window happens to
         be. The words are untouched; only the instruction to break
         is dropped. */
      deck = m[1].replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/g, ' ')
                 .replace(/\s{2,}/g, ' ').trim().replace(/^\s*|\s*$/g, '');
      /* DROPPING A <br> JOINS TWO BLOCKS INTO ONE, and the loss check
         counts blocks — so every deck that had a break inside it read
         as two pieces of text going missing and one appearing. It
         took the unsafe count from 2 pages to 20.
         Both sides are declared here: the fragments the break used to
         separate are removals, the joined sentence is an addition.
         The check then sees a rewrite rather than a loss, and still
         catches a deck that genuinely vanishes. */
      if (/<br/i.test(m[1])) {
        for (const piece of m[1].split(/<br\s*\/?>/i)) {
          const t = strip(piece);
          if (t) removedOnPurpose.push(t);
        }
        deckJoined = strip(deck);
      }
      html = html.replace(m[0], '');
      decisions.push({ id: 'deck', on: true, label: 'Use this paragraph as the page description',
        why: from ? 'It is the page’s opening paragraph, moved into the banner rather than rewritten. It sat under the page’s own "Overview" heading, which stays where it is.'
                  : 'It is the page’s own opening paragraph, moved into the banner rather than rewritten.',
        value: strip(m[1]) });
      break;
    }
  }

  /* ── 2b. THE OLD BANNER GRAPHIC ─────────────────────────────── */
  /* A graphic at the top of the page that says the page's name in
     picture form. With an assembled banner above it the reader is
     told what the page is twice, in two different typefaces, before
     any content — so it goes.

     Recognised the same way banner-report.js recognises it, and for
     the same reason: near the top, full width, and named as a banner.
     Two signals or more, never one, because a page can legitimately
     open with a photograph that is not a title card.

     It is a decision rather than a certainty, so it is listed with
     the file it removes — and banner-report.js will tell you whether
     that file is used anywhere else before you delete it. */
  if (opts.removeBannerGraphic !== false) {
    const head = html.slice(0, 2500);
    for (const m of head.matchAll(/<img[^>]*>/gi)) {
      const tag = m[0];
      const at = m.index;
      const a = n => (tag.match(new RegExp(n + '="([^"]*)"', 'i')) || [])[1] || '';
      /* A NAME IS REQUIRED, NOT MERELY HELPFUL — and that was the
         fault in this rule.
         The comment above says "two signals or more, never one,
         because a page can legitimately open with a photograph that
         is not a title card". But position and full width are not two
         independent signals: EVERY leading photograph has both, so
         together they scored exactly the 4 needed and every one of
         them was removed as a banner.
         /lgbtq/student is the case. Its opening image is a collage of
         students at pride parades — alt text and all — and it was
         deleted as though it repeated the page title in picture form.
         It repeats nothing; it is the only photograph on the page.
         So the name now decides. A title card is called one:
         "…Banner.png", "MTSS - Homepage Banner", "header", "masthead".
         Position and width still have to corroborate, but they can no
         longer convict on their own. */
      const named = a('alt') + ' ' + decodeURIComponent(a('src') || '');
      if (!/banner|masthead|\bheader\b|title[-_ ]?card/i.test(named)) continue;
      let sc = 0;
      if (at < 600) sc += 2; else if (at < 1500) sc += 1;
      if (/^100%$/.test(a('width'))) sc += 2;
      if (/align-center/.test(a('class'))) sc += 1;
      if (/banner/i.test(named)) sc += 3;
      if (/header|masthead/i.test(named)) sc += 2;
      if (sc < 4) continue;
      html = html.replace(tag, '');
      /* An <img> holds no text, so nothing has to be exempted from
         the loss check — but the empty paragraph it leaves behind
         would show as a gap. */
      html = html.replace(/<p[^>]*>\s*<\/p>/gi, '');
      decisions.push({ id: 'banner-graphic', on: true,
        label: 'Retire the old banner graphic',
        why: 'It repeats the page title in picture form, which the new banner already does in type.',
        removes: decodeURIComponent((a('src') || '').split('/').pop()) });
      break;
    }
  }

  /* ── 3b. HEADINGS RENAMED BY HAND ───────────────────────────── */
  /* The one place this function changes wording, and only because it
     was told to. overrides.json carries { "old text": "new text" }
     per page; anything not listed is left exactly as written. Each
     rename is recorded as a decision so the panel shows both, and is
     exempt from the loss check for the same reason the title echo is
     — it is a reviewed edit, not a silent one. */
  if (opts.headings) {
    for (const [from, to] of Object.entries(opts.headings)) {
      const re = new RegExp('(<h[1-6][^>]*>)\\s*(?:<strong>)?\\s*' +
        from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?:<\\/strong>)?\\s*(<\\/h[1-6]>)', 'i');
      if (!re.test(html)) { notes.push(`Rename skipped — no heading reads "${from}".`); continue; }
      html = html.replace(re, `$1${to}$2`);
      removedOnPurpose.push(from);
      decisions.push({ id: 'rename:' + from.slice(0, 20), on: true,
        label: `Rename heading`, why: `"${from}" → "${to}"`, removes: from });
    }
  }

  /* ── 3c. TEXT CHANGED BY HAND ───────────────────────────────── */
  /* The general form of the rename above: { "old": "new" } for any
     text on the page, applied literally and once each. This is the
     only route by which wording changes, it is always a direction
     someone gave, and every one is listed as a decision showing both
     versions. A phrase that is not found is reported rather than
     silently ignored — a typo in an instruction should not look like
     a completed edit. */
  if (opts.replace) {
    for (const [from, to] of Object.entries(opts.replace)) {
      if (!html.includes(from)) { notes.push(`Edit skipped — "${from.slice(0, 60)}" is not on this page.`); continue; }
      html = html.replace(from, to);
      removedOnPurpose.push(from);
      decisions.push({ id: 'edit:' + from.slice(0, 16), on: true,
        label: 'Text edit', why: `"${from}" → "${to}"`, removes: from });
    }
  }

  /* ── 3c-1b. A DOCUMENT COVER PUT BESIDE ITS TEXT ────────────────
     { "figure": [ { "alt": "Pine Tree Present Thumbnail",
                     "before": "Chronic absenteeism",
                     "button": "Download the Fact Sheet" } ] }

     Four pages publish a document by showing its cover as a picture
     that is itself the download link, with a line underneath telling
     the reader to click it. Two faults in one shape. The line is not
     a caption, it is instructions for working the page — and the
     link's only accessible name is the image's alt, so a screen
     reader announces "Pine Tree Present Thumbnail" where a person
     sees a fact sheet to download (WCAG 2.4.4).

     A button fixes both: it names the document in words, it is a
     target a keyboard reaches, and the picture beside it is then
     just a picture. The caption comes out through dropText, which
     already exempts the sentence properly; this rule moves the
     picture to where the prose can wrap around it and puts the
     button after that prose.

     PAGE BY PAGE, NEVER INFERRED. The label has to name the
     document, and nothing in the markup knows what the document is
     called — the file name on /meac is "Student Supports -
     PineTreePresent Fact Sheet - 9.14.2026.pdf". A person writes it. */
  if (opts.figure) {
    for (const f of [].concat(opts.figure)) {
      const esc = String(f.alt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('<p[^>]*>\\s*<a\\b([^>]*)>\\s*(<img\\b[^>]*\\balt="' + esc + '"[^>]*>)\\s*<\\/a>\\s*<\\/p>', 'i');
      const m = html.match(re);
      if (!m) { notes.push(`Figure skipped — no linked image has alt "${f.alt}".`); continue; }
      const href = (m[1].match(/href="([^"]*)"/i) || [])[1] || '';
      html = html.replace(m[0], '');

      /* WHERE IT GOES. Before the block the picture belongs to, named
         by the words that block starts with — a float only wraps what
         comes AFTER it, and on /meac the cover was written below both
         paragraphs, which is why it sat alone with a column of white
         beside it. */
      const want = String(f.before || '').replace(/\s+/g, ' ').trim().toLowerCase();
      let target = null;
      if (want) {
        for (const p of html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)) {
          if (strip(p[0]).replace(/\s+/g, ' ').trim().toLowerCase().startsWith(want)) { target = p; break; }
        }
      }
      if (!target) { notes.push(`Figure skipped — no paragraph starts "${f.before}".`); continue; }
      html = html.slice(0, target.index) + m[0] + '\n' + html.slice(target.index);

      /* AND THE BUTTON AFTER THE PROSE, not between the picture and
         it. Walk the run of paragraphs the float is wrapping and put
         it at the end of them, so the order a reader meets is
         picture, what it is about, then the way to get it. */
      if (f.button && href) {
        let i = target.index + m[0].length + 1;
        const run = /^(?:\s*<p\b[^>]*>[\s\S]*?<\/p>)/i;
        let z;
        while ((z = html.slice(i).match(run))) i += z[0].length;
        const btn = `\n<p><a class="btn btn-info btn-lg" href="${href}">${f.button}</a></p>`;
        html = html.slice(0, i) + btn + html.slice(i);
      }
      decisions.push({ id: 'figure:' + slug(String(f.alt).slice(0, 24)), on: true,
        label: 'Put a document cover beside its text',
        why: `The cover of "${f.button || f.alt}" was a picture that was itself the download, with a line under it telling the reader to click it. It moves up so the text runs beside it, and the download becomes a button that names the document — the link's only name was the image's alt.`,
        value: f.button || 'moved' });
    }
  }

  /* ── 3c-1c. COLUMN WIDTHS SET BY HAND ───────────────────────────
     { "colWidths": { "Month & Topic": ["64%", "18%", "18%"] } }
     Keyed on the text of the first header cell. The theme lays real
     tables out fixed, so three columns with no widths come out in
     equal thirds however much is in them: on /meac a column of
     321-character summaries and two columns holding one short link
     each were 292px apiece. Percentages, never pixels — a pixel
     table stops fitting the column the moment anything changes. */
  if (opts.colWidths) {
    for (const [first, widths] of Object.entries(opts.colWidths)) {
      const want = String(first).replace(/\s+/g, ' ').trim().toLowerCase();
      let done = false;
      html = html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tbl) => {
        if (done) return tbl;
        const ths = [...tbl.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)];
        if (!ths.length) return tbl;
        if (textOf(ths[0][2]).replace(/\s+/g, ' ').trim().toLowerCase() !== want) return tbl;
        done = true;
        let k = 0;
        return tbl.replace(/<th\b([^>]*)>/gi, (tm, attrs) => {
          const w = widths[k++];
          if (!w) return tm;
          return /style="/i.test(attrs)
            ? `<th${attrs.replace(/style="/i, `style="width:${w};`)}>`
            : `<th${attrs} style="width:${w};">`;
        });
      });
      if (!done) { notes.push(`Column widths skipped — no table starts with a "${first}" header.`); continue; }
      decisions.push({ id: 'colwidths:' + slug(first.slice(0, 20)), on: true,
        label: 'Set the column widths',
        why: `The theme lays this table out fixed, so its columns came out in equal thirds whatever was in them — a column of summaries got the same room as a column holding one short link. Now ${widths.join(' / ')}.`,
        value: widths.join(' / ') });
    }
  }

  /* ── 3c-1d. A GRID LAID OUT AGAIN, WIDER ────────────────────────
     { "regrid": [ { "section": "Resources", "across": 2 } ] }

     Six categories of links were written as two rows of three. At
     three-across a column is 315px, and a 45-character document title
     does not fit in 315px — measured on /meac, 33 of 33 rows wrapped
     to a second line and every format tag wrapped with them. The tags
     were blamed; the tags were not the cause. Taking them all out
     left 33 of 33 rows still wrapping.

     The other half of the same number. A column holding a card is
     display:flex, so the card is stretched to the tallest card beside
     it. Eleven links beside two put 956px of empty box under
     "Community Collaboration" and the same again under "Progress
     Monitoring & Sustainability" — the two Matt asked about. Nothing
     is wrong with those categories; they are standing next to the
     biggest one on the page.

     Two-across fixes both at once and is the smaller change: 470px
     fits the titles, and the source order 3, 4, 6, 11, 2, 2 pairs
     itself as (3,4) (6,11) (2,2), so the two small categories come to
     rest beside each other rather than beside the largest. Measured
     dead space across the six falls from 1,303px to 241px.

     THE ROWS HAVE TO BE MERGED, not just re-classed. Widening three
     columns in place spills one card onto a line of its own and pairs
     nothing. Only rows written one after another are merged, and only
     inside the named section — two rows separated by a paragraph are
     separated on purpose.

     NOT A SITE-WIDE RULE, AND THAT IS A FINDING RATHER THAN A
     LIMITATION. Of 54 lopsided card rows, stopping the stretch above
     any threshold lands tidy on half and leaves a staircase of three
     different-height boxes on the other half — including the other
     row on this very page. The shape of the weights decides it, not
     their spread, so a person decides it. */
  if (opts.regrid) {
    const closeDiv = (h, from) => {
      let d = 1, i = from;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let z;
      while (d > 0 && (z = t.exec(h))) { d += z[0][1] === '/' ? -1 : 1; i = z.index + z[0].length; }
      return i;
    };
    for (const g of [].concat(opts.regrid)) {
      const want = String(g.section).replace(/\s+/g, ' ').trim().toLowerCase();
      const heads = [...html.matchAll(/<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi)];
      const hi = heads.findIndex(h => textOf(h[0]).replace(/\s+/g, ' ').trim().toLowerCase() === want);
      if (hi < 0) { notes.push(`Regrid skipped — no section heading reads "${g.section}".`); continue; }
      const start = heads[hi].index + heads[hi][0].length;
      const end = hi + 1 < heads.length ? heads[hi + 1].index : html.length;
      const body = html.slice(start, end);

      const cols = []; let p = 0, consumed = 0, rows = 0;
      for (;;) {
        const ws = (body.slice(p).match(/^\s*/) || [''])[0].length;
        const om = body.slice(p + ws).match(/^<div\b[^>]*\bclass="[^"]*\brow\b[^"]*"[^>]*>/i);
        if (!om) break;
        const openEnd = p + ws + om[0].length;
        const rowEnd = closeDiv(body, openEnd);
        const inner = body.slice(openEnd, rowEnd - 6);
        let q = 0;
        for (;;) {
          const cws = (inner.slice(q).match(/^\s*/) || [''])[0].length;
          const cm = inner.slice(q + cws).match(/^<div\b[^>]*\bclass="[^"]*\bcol-[^"]*"[^>]*>/i);
          if (!cm) break;
          const cEnd = closeDiv(inner, q + cws + cm[0].length);
          cols.push(inner.slice(q + cws, cEnd));
          q = cEnd;
        }
        p = rowEnd; consumed = rowEnd; rows++;
      }
      if (rows < 2 || cols.length < 2) { notes.push(`Regrid skipped — "${g.section}" has no run of adjacent rows to merge.`); continue; }

      const w = Math.max(1, Math.round(12 / (g.across || 2)));
      const out = cols.map(c => c.replace(/\bcol-(?:xs|sm|md|lg|xl)-\d+\b/g, 'col-sm-' + w));
      const merged = '\n<div class="row">\n' + out.join('\n') + '\n</div>\n';
      html = html.slice(0, start) + merged + body.slice(consumed) + html.slice(end);

      decisions.push({ id: 'regrid:' + slug(String(g.section).slice(0, 20)), on: true,
        label: `Lay "${g.section}" out ${g.across || 2}-across`,
        why: `${cols.length} cards were written as ${rows} rows of ${Math.round(cols.length / rows)}. At ${rows > 1 && cols.length / rows >= 3 ? 'three' : 'that width'}-across a column is about 315px and every title wrapped to a second line — taking the format tags out did not change that, because the width was the cause. And a column holding a card stretches to the tallest card beside it, so the two smallest categories sat under about 950px of empty box each. Two-across gives each column 470px and pairs the categories by the order they are already written in. No card moves and no word changes.`,
        value: cols.length + ' cards, ' + (g.across || 2) + '-across' });
    }
  }

  /* ── 3c-2. AN IMAGE GIVEN A SIZE ────────────────────────────── */
  /* { "alt text": "doe-img-left" } — matched on the image's ALT, not
     on its markup, for the same reason the note is matched on heading
     text: the clean-up strips data-entity attributes, so any rule
     written against the tag as it appears in the editor stops
     matching the moment it runs. The alt survives. */
  if (opts.imgClass) {
    for (const [alt, cls] of Object.entries(opts.imgClass)) {
      const esc = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('<img([^>]*?)alt="' + esc + '"([^>]*?)>', 'i');
      if (!re.test(html)) { notes.push(`Image class skipped — no image has alt "${alt}".`); continue; }
      html = html.replace(re, (m, a, b) => {
        const t = `<img${a}alt="${alt}"${b}>`;
        return /class="/.test(t)
          ? t.replace(/class="/, `class="${cls} `)
          : t.replace('<img', `<img class="${cls}"`);
      });
      decisions.push({ id: 'img:' + cls, on: true, label: 'Image sizing',
        why: `"${alt.slice(0, 44)}" → ${cls.replace('doe-img-', '')}` });
    }
  }

  /* ── 3c-3. IMAGES SIZED BY WHAT THEY MEASURE ────────────────── */
  /* 1,320 images were measured off the wire, so the obvious cases no
     longer need a person: a 1920x1080 photograph in a 900px column is
     going to be full width whatever anyone decides, and a portrait
     shown at full column width is a wall of picture.
     WHAT THIS DELIBERATELY DOES NOT DO is choose between left and
     tall. On /meac the two portraits measured 0.78 and 0.76 — all but
     identical — and got different classes, because one wraps prose
     and the other is a cover page. That is a judgement about content,
     and no ratio predicts it. Portraits therefore default to left,
     which is the commoner want, and the override says tall.
     The middling landscapes are left alone on purpose too: 824x632
     was offered a class on /meac and turned down. */
  if (opts.autoImg !== false && SIZES) {
    /* SPANS RECOMPUTED HERE. The ones taken at the top of sectioning
       describe a document several transforms ago — headings
       renumbered, h2s wrapped, tables rewritten — so every offset
       has moved and inComponent() answers about the wrong part of the
       string. That is how a contact block's photograph got classed
       as a loose image. A test against positions has to be made
       against the positions as they are. */
    const imgSpans = componentSpans(html);
    const inComponent = i => imgSpans.some(([a, b]) => i >= a && i < b);
    const seen = new Set(Object.keys(opts.imgClass || {}));
    for (const m of [...html.matchAll(/<img[^>]*>/gi)]) {
      const alt = (m[0].match(/alt="([^"]*)"/i) || [])[1] || '';
      const src = (m[0].match(/src="([^"]*)"/i) || [])[1] || '';
      if (!alt || seen.has(alt)) continue;              // a hand-written class wins
      if (/\bclass="[^"]*(card-img|doe-img)/i.test(m[0])) continue;
      /* AND NOT A COMPONENT'S OWN PICTURE. A contact block's
         photograph is already a 150px circle with object-fit:cover;
         putting doe-img-left on it handed it to the rule that sets
         aspect-ratio:auto and object-fit:contain, and Krista Averill
         went from a 150px circle to a 73x69 rectangle on
         /Testing_Accountability/MECAS/NWEA. A card, an accordion
         panel and a contact block all dress their own images. */
      if (inComponent(m.index)) continue;
      /* AND NOT INSIDE A NARROW COLUMN. doe-img-left caps an image at
         34% of whatever contains it. In the full-width flow that is a
         third of the page; inside a col-*-6 it is a third of a half —
         about 150px, which is the "SUPER tiny" image on
         /learning/highered/forprofit. A picture in a column is
         already as narrow as the layout wants it. */
      /* THE ENCLOSING COLUMN, NOT THE LAST ONE MENTIONED. Taking the
         last col-* class anywhere before the image treated every
         image AFTER a grid as though it were inside the final column
         of it — which suppressed 161 images that are in the ordinary
         flow. The column only counts if the image is still inside it,
         so the divs between are counted. */
      const colWidth = (() => {
        const open = /<div[^>]*class="[^"]*\bcol-[a-z]+-(\d+)[^"]*"[^>]*>/gi;
        let last = null, k;
        while ((k = open.exec(html)) && k.index < m.index) last = k;
        if (!last) return 12;
        const between = html.slice(last.index + last[0].length, m.index);
        const depth = (between.match(/<div\b/gi) || []).length - (between.match(/<\/div>/gi) || []).length;
        return depth >= 0 ? +last[1] : 12;      // still inside that column
      })();
      /* colWidth IS READ AFTER THE COLUMNS HAVE BEEN REWEIGHTED —
         the balance step runs earlier in this function than the
         comment numbering suggests, so a col-sm-6 may already have
         become a col-sm-9 by now and the narrow test misses it.
         The author's own instruction is the surer signal: an inline
         width:100% says this image fills its column, and floating it
         at 34% contradicts that directly. That is what left
         /learning/highered/forprofit with a 150px photograph. */
      const wantsFullWidth = /style="[^"]*width:\s*100%/i.test(m[0]);
      const inNarrowColumn = colWidth <= 6 || wantsFullWidth;
      const s = SIZES[dec(src)] || null;
      const r = s && s.w && s.h ? s.w / s.h : 0;
      let cls = null, why = null;
      /* An image we never measured is still an image sitting loose in
         the flow. Floated left it is capped and the text wraps; left
         bare it is whatever width the file happens to be. */
      if (inNarrowColumn) continue;
      if (!s) {
        html = html.replace(m[0], /class="/.test(m[0])
          ? m[0].replace(/class="/, 'class="doe-img-left ')
          : m[0].replace('<img', '<img class="doe-img-left"'));
        seen.add(alt);
        decisions.push({ id: 'autoimg:' + slug(alt), on: true, label: 'Size an image by its shape',
          why: `"${alt.slice(0, 44)}" could not be measured, so it is floated left and capped rather than left at its own size.`,
          value: 'left' });
        continue;
      }
      if (s.w < 400) continue;                          // logos, seals, icons — never floated
      /* doe-img-full is width:100%, so it UPSCALES anything narrower
         than the column. A 480x270 photo stretched to 900 is a blurry
         one, and the rule was handing out full width on measurements
         that small until this floor went in. */
      if (r >= 1.6 && s.w >= 800) { cls = 'doe-img-full'; why = 'wide enough to fill the column, too wide to float beside text'; }
      else if (r <= 0.85) { cls = 'doe-img-left'; why = 'a portrait at full width is a wall of picture'; }
      /* THE MIDDLE BAND USED TO BE LEFT ALONE, and 200 images on 113
         pages were the result — a photograph sitting between two
         sections at whatever pixel size it was uploaded at, aligned
         with nothing, which is the "just sort of hangs out there" on
         /Testing_Accountability/MECAS/materials/natint. Floating it
         left is the conservative answer: the text wraps, the image is
         capped at a third of the column, and nothing is enlarged. */
      else { cls = 'doe-img-left'; why = 'it was sitting in the flow at its own pixel size, aligned with nothing'; }
      seen.add(alt);
      html = html.replace(m[0], /class="/.test(m[0])
        ? m[0].replace(/class="/, `class="${cls} `)
        : m[0].replace('<img', `<img class="${cls}"`));
      decisions.push({ id: 'autoimg:' + slug(alt), on: true, label: 'Size an image by its shape',
        why: `"${alt.slice(0, 44)}" measures ${s.w}×${s.h} — ${why}.`,
        value: cls.replace('doe-img-', '') });
    }
  }

  /* ── 3d. A NOTE UNDER A HEADING ─────────────────────────────── */
  /* { "heading text": "the note" } puts a line directly beneath that
     section's header.

     Matched on the heading's TEXT, not on its markup. The first
     version of this matched the whole <h3>…</h3> string and silently
     did nothing, because by the time it ran the clean-up had already
     normalised that h3 to an h2 — an instruction written against
     markup breaks the moment anything upstream touches the markup.
     The words are the stable thing.

     A note is set as a section deck rather than a heading. It was
     suggested as an h3, and it should not be: a heading creates a
     landmark in the outline that assistive technology offers as a
     place to jump to, and "Continues at UMaine Orono on March 19,
     2027" is a qualifier on the section above it, not a section. */
  if (opts.notes) {
    for (const [head, text] of Object.entries(opts.notes)) {
      const esc = head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(<div[^>]*class="[^"]*\\bblockhead\\b[^"]*"[^>]*>\\s*<h[1-6][^>]*>\\s*' +
        esc + '\\s*<\\/h[1-6]>\\s*<\\/div>)', 'i');
      if (!re.test(html)) { notes.push(`Note skipped — no section header reads "${head}".`); continue; }
      html = html.replace(re, `$1\n<p class="doe-lead">${text}</p>`);
      decisions.push({ id: 'note:' + head.slice(0, 16), on: true,
        label: 'Add a note under a section', why: `Under "${head}": "${text}"` });
    }
  }

  /* THE OUTLINE AGAIN, NOW THAT THE TRANSFORMS HAVE RUN.
     They create headings: a section unfolded out of an accordion, a
     run of questions lifted out of a panel. Each is emitted at the
     depth it looks right at in isolation, which is not necessarily
     the depth it lands at — the questions on
     /learning/earlychildhood/publicpreschool/monitoring come out as
     an h3 and only become a child of "About the CLASS Interactions
     and Environments Observation Tool" once that accordion has been
     unfolded into an h2, which happens afterwards.
     Run before the contents list, because that reads the levels. */
  /* THE LONG-HEADING PASS RUNS TWICE, FOR THE REASON THE OUTLINE
     WALK DOES. The transforms above MAKE headings — subheads lifts a
     bold run-in line into one, the FAQ rule promotes a question — so
     a heading that did not exist when the first pass ran can be 400
     characters long by the time we finish. Five of them were, all
     five carrying a `subheads` decision. The first pass cleans what
     the author wrote; this one cleans what we wrote. */
  /* A LIST ITEM THAT IS ONLY A PICTURE IS NOT A LIST ITEM.
     Matt, on /learning/technology/infrastructure: "The Act Now flyer
     can be full width and actually that could just be an image card
     with that as the thumbnail. Makes it a little more prominent."
     The flyer is sitting as the first row of a list group inside the
     "Cyber Incident Responses" card, floated left at 366x470 with an
     align="left" attribute, so the prose in the row beneath wraps
     around a picture that is taller than it is. A list group is rows
     of links; a picture is not a row.
     The card already has a title and a body, so the picture has an
     obvious place to go: the top of the card, which is where this
     library puts a card's image, above the navy bar and full width.
     Two of them on the site, both flyers, both in a technology card.
     The float, the align attribute and the hand-set pixel size all go
     with it — card-img-top sizes itself. */
  if (opts.imgcard !== false) {
    const cardSpans = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi)]
      .map(m => {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let z;
        while (d > 0 && (z = t.exec(html))) { d += z[0][1] === '/' ? -1 : 1; i = z.index + z[0].length; }
        return { open: m[0], start: m.index, inner: m.index + m[0].length, end: i };
      });
    let moved = 0, alt = '';
    for (const m of [...html.matchAll(/<li[^>]*>\s*(<img[^>]*>)\s*<\/li>/gi)].reverse()) {
      const card = cardSpans.filter(c => m.index > c.inner && m.index < c.end)
        .sort((a, b) => (b.end - b.inner) - (a.end - a.inner)).pop();
      if (!card) continue;
      const img = m[1]
        .replace(/\s(?:align|width|height|hspace|vspace|border)="[^"]*"/gi, '')
        .replace(/\sstyle="[^"]*"/gi, '')
        .replace(/\sclass="[^"]*"/gi, '')
        .replace(/<img/i, '<img class="card-img-top"');
      alt = alt || (m[1].match(/alt="([^"]*)"/i) || [, ''])[1];
      html = html.slice(0, m.index) + html.slice(m.index + m[0].length);
      html = html.slice(0, card.inner) + '\n' + img + '\n' + html.slice(card.inner);
      moved++;
    }
    if (moved) decisions.push({ id: 'imgcard', on: true, label: 'Make the flyer the card\'s picture',
      why: `"${alt}" is sitting as a row of a list group inside a card, floated left at a hand-set size, so the text in the row beneath wraps around a picture taller than it is. A list group is rows of links. It moves to the top of the card, which is where a card's picture goes — full width, above the title bar, sized by the card rather than by hand. Nothing else moves.`,
      value: alt || (moved + ' image') });
  }

  if (opts.longhead !== false) {
    let n = 0;
    html = html.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, lv, attrs, inner) => {
      const t = strip(inner);
      if (t.length <= 100 || /\?\s*$/.test(t)) return m;
      n++;
      const id = (attrs.match(/\sid="[^"]*"/i) || [''])[0];
      return `<p${id}>${inner}</p>`;
    });
    if (n) {
      const d = decisions.find(z => z.id === 'longhead');
      if (d) d.value = (parseInt(d.value) || 0) + n + ' headings';
      else decisions.push({ id: 'longhead', on: true, label: 'Set an over-long heading as the paragraph it is',
        why: `${n} heading${n > 1 ? 's run' : ' runs'} past 100 characters after the page was restructured — a bold line lifted into a heading by an earlier step turned out to be a paragraph. It becomes one. Not a word changes.`,
        value: n + ' heading' + (n > 1 ? 's' : '') });
    }
  }

  if (opts.outline !== false) html = rebuildOutline(html).html;

  /* AND THE HEADINGS INSIDE COMPONENTS, WHICH THE WALK SKIPS.
     A card's title, a contact block's "Contact", an accordion term:
     the walk leaves these alone on purpose, because they label a
     thing on the page rather than a part of it, and the walk's job is
     the page's outline. But they are still headings, a screen reader
     still announces their level, and an h5 card title inside an h2/h3
     page is still a skip. They are styled by their class and their
     position, never by their number, so the number can come to the
     floor with everything else. */
  if (opts.outline !== false) {
    let capped = 0;
    html = html.replace(/<h([4-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, n, attrs, inner) => {
      capped++;
      return `<h3${attrs}>${inner}</h3>`;
    });
    if (capped) decisions.push({ id: 'capheadings', on: true, label: 'Bring every heading up to h3 or above',
      why: `${capped} heading${capped > 1 ? 's sat' : ' sat'} at h4 or deeper inside a card, a callout, a contact block or an accordion panel — components the outline walk leaves alone because they label a thing rather than a section. A reader using a screen reader still hears the level, so a fourth-level title inside a page that only goes to three is announced as belonging to a level that does not exist. Each is styled by its class and its position rather than its number, so nothing changes on screen.`,
      value: capped + ' heading' + (capped > 1 ? 's' : '') });
  }

  /* A HEADING HELD AT THE LEVEL IT WAS WRITTEN, named page by page.
     The outline rebuild is right in general — a page should not open
     at h3 — but on a page with exactly one section it promotes that
     section to h2 and it comes out as a full navy bar. On
     /schools/equivalentinstruction that is heavier than the single
     question under it deserves; at h3 it takes the lighter sub-head
     instead. Matt's call, on looks, for that page.
     Named text only, so nothing is inferred. */
  /* THE SAME ACTION REPEATED AT THE FOOT OF EACH SECTION.
     On /teachingandlearning/engagementseries the Register button
     sits once above the cohort listings and once below the second
     one, so a reader who has just finished reading the first cohort
     has to scroll back up to act on it. Matt's call: put it at the
     bottom of every cohort section so it is there when the decision
     is made.
     REPEATING A BUTTON IS ADDING SOMETHING, which is why it is named
     per section in overrides.json rather than inferred. A section
     that already ends with that button is left alone, so running
     this twice does not stack two. */
  if (opts.sectionCta) {
    for (const [heading, btn] of Object.entries(opts.sectionCta)) {
      const want = String(heading).replace(/\s+/g, ' ').trim().toLowerCase();
      const heads = [...html.matchAll(/<div[^>]*class="(?:[^"]*\s)?blockhead(?:\s[^"]*)?"[^>]*>\s*<h([1-6])[^>]*>([\s\S]*?)<\/h\1>\s*<\/div>/gi)];
      const hit = heads.find(h => strip(h[2]).replace(/\s+/g, ' ').trim().toLowerCase() === want);
      if (!hit) continue;
      const from = hit.index + hit[0].length;
      const rest = html.slice(from);
      const nextAt = rest.search(/<div[^>]*class="(?:[^"]*\s)?(?:blockhead|contact-cube)(?:\s[^"]*)?"/i);
      const end = nextAt < 0 ? html.length : from + nextAt;
      const span = html.slice(from, end);
      if (span.includes(btn.href)) continue;          // it is already here
      const mark = `<p><a class="btn btn-info btn-lg btn-block" href="${btn.href}">${btn.label}</a></p>\n`;
      html = html.slice(0, end) + mark + html.slice(end);
      decisions.push({ id: 'sectioncta:' + slug(strip(hit[2]).slice(0, 26)), on: true,
        label: 'Repeat the action at the foot of a section',
        why: `"${btn.label}" is the action this section leads to, and it sits above the section rather than at the end of it — so a reader who has just finished reading has to scroll back to act. Named in overrides.json for this page; the button is the one already on the page, pointing at the same place.`,
        adds: btn.label,
        value: strip(hit[2]).slice(0, 44) });
    }
  }

  /* THE DESCRIPTION STARTS A LINE, SO IT STARTS WITH A CAPITAL.
     223 of them on 70 pages open lower-case — "a framework used by
     many Maine schools", "research-based characteristics of
     state-of-the-art health education". They read that way because
     they used to follow a dash on the same line: "Title - a
     framework used by…". The dash is gone and the link is now set
     in its own face and size above them, so each description begins
     a line of its own and a small letter there reads as a mistake.
     This is the other half of dropping the separator; leaving it
     undone was mine.
     A CAMEL-CASE FIRST WORD IS LEFT ALONE — eLearning, iReady — and
     so is anything that does not start with a plain letter. One
     character changes and only ever the first. */
  if (opts.descap !== false) {
    let n = 0;
    html = html.replace(/(<li[^>]*\bdoe-item\b[^>]*>(?:(?!<\/li>)[\s\S])*?<\/a>(?:\s|&nbsp;|<span class="doe-chip"[^>]*>[^<]*<\/span>)*)([a-z])/g,
      (m, head, ch) => {
        const rest = html.slice(html.indexOf(m) + m.length, html.indexOf(m) + m.length + 12);
        if (/^[A-Z]/.test(rest)) return m;          // eLearning, iReady and friends
        n++;
        return head + ch.toUpperCase();
      });
    if (n) decisions.push({ id: 'descap', on: true, label: 'Start a description with a capital',
      why: `${n} description${n > 1 ? 's begin' : ' begins'} with a small letter, because ${n > 1 ? 'they' : 'it'} used to run on from the link after a dash. The dash is gone and the link now sits above in its own face, so each description opens a line of its own. One character changes and only ever the first.`,
      value: n + ' description' + (n > 1 ? 's' : '') });
  }

  /* THE ENDORSEMENT DISCLAIMER, WHICH BELONGS IN THE FOOTER.
     Six pages carry the same sentence verbatim — "Links to
     organizations and resources are for reference and information
     only and do not imply endorsement by the Maine Department of
     Education." It is true of every page on the site, which is why
     it is going into the footer, and a sentence that is true
     everywhere does not belong at the bottom of six pages in
     particular. Matt's call.
     ONE EXACT SENTENCE, matched in full. Nothing near it is
     touched. */
  if (opts.orgdisclaimer !== false) {
    /* THREE SHAPES, because six authors typed it six ways: alone in
       its own paragraph; split across two paragraphs at "by the /
       Maine Department of Education"; and run on to the end of a
       sentence that says something else. The third is the reason
       this removes a SENTENCE rather than an element — the
       paragraph around it is somebody's real writing and stays. */
    const SENT = 'Links to organizations and resources are for reference and information only and do not imply endorsement by the Maine Department of Education';
    const found = [];
    /* (a) split over two paragraphs — each declared on its own,
       because the check works a block at a time and a declaration
       spanning two matches neither. */
    html = html.replace(/(<p[^>]*>\s*(?:<em>)?\s*Links to organizations and resources are for reference and information only and do not imply endorsement by the\s*(?:<\/em>)?\s*<\/p>)\s*(<p[^>]*>\s*(?:<em>)?\s*Maine Department of Education\.?\s*(?:<\/em>)?\s*<\/p>)/gi,
      (m, a, b) => { found.push(strip(a)); found.push(strip(b)); return ''; });
    /* (b) alone in its own paragraph. */
    const RE = /<p[^>]*>\s*(?:<em>)?\s*Links to organizations and resources are for reference and information only and do not imply endorsement by the Maine Department of Education\.?\s*(?:<\/em>)?\s*<\/p>/gi;
    html = html.replace(RE, (m) => { found.push(strip(m)); return ''; });
    /* NOT WHERE IT SHARES A PARAGRAPH WITH REAL WRITING.
       Two pages run the disclaimer on to the end of a sentence that
       says something else — "…designing and implementing assessment
       in social studies. Links to organizations…". Cutting a
       sentence out of the middle of someone's paragraph is exactly
       what the content check exists to catch, and switching the
       check off to do it is the wrong trade for two pages. They are
       reported instead: /lgbtq and
       /learning/standardsreview/socialstudies. */
    if (found.length) {
      for (const f of found) removedOnPurpose.push(f);
      decisions.push({ id: 'orgdisclaimer', on: true, label: 'Drop the endorsement disclaimer',
        removes: found[0],
        why: 'The same sentence appears verbatim on six pages and is true of every page on the site, which is why it is moving to the footer. Matched in full and in one exact form — nothing near it is touched.',
        value: found.length + ' copy' + (found.length > 1 ? 'ies' : '') });
    }
  }

  /* A LABEL WRITTEN FOR A LIST THAT NEVER HAD ONE.
     /schools/nutrition/CNDatareports runs three lists one after
     another under a single section header — October Survey rows,
     Annual Participation rows, SNP Free and Reduced rows — with
     nothing between them, so the reader meets forty links and no
     indication of where one set ends and the next begins.
     THIS WRITES WORDS, which nothing else here does. Every label is
     named in overrides.json against the first item of the list it
     belongs to, so it is the page's owner writing them, not this
     tool inferring them. The panel shows each one as its own
     decision with the text it added. */
  if (opts.labelList) {
    for (const [first, label] of Object.entries(opts.labelList)) {
      const want = String(first).replace(/\s+/g, ' ').trim().toLowerCase();
      const lists = [...html.matchAll(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi)];
      const hit = lists.find((l) => {
        const li = l[0].match(/<li\b[^>]*>([\s\S]*?)<\/li>/i);
        return li && strip(li[1]).replace(/\s+/g, ' ').trim().toLowerCase().startsWith(want);
      });
      if (!hit) continue;
      if (html.slice(Math.max(0, hit.index - 200), hit.index).includes('>' + label + '<')) continue;
      html = html.slice(0, hit.index) + `<h3>${label}</h3>\n` + html.slice(hit.index);
      decisions.push({ id: 'label:' + slug(label), on: true,
        label: 'Name a list that had no heading',
        why: `The list beginning "${strip(first).slice(0, 48)}" runs straight on from the one above it with nothing to say where it starts. "${label}" is written in overrides.json for this page — it is the only step here that adds words, and it only ever adds the exact words it has been given.`,
        adds: label,
        value: label });
    }
  }

  if (opts.h3) {
    for (const want of [].concat(opts.h3)) {
      const needle = String(want).replace(/\s+/g, ' ').trim().toLowerCase();
      html = html.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, (m, attrs, inner) => {
        if (strip(inner).replace(/\s+/g, ' ').trim().toLowerCase() !== needle) return m;
        decisions.push({ id: 'h3:' + slug(needle.slice(0, 30)), on: true,
          label: 'Hold this heading at h3',
          why: `Named in overrides.json for this page. The outline rebuild raises it to h2 because it is the page's only section, which draws it as a full section bar; at h3 it takes the lighter sub-head. Only the level changes.`,
          value: 'h2 to h3' });
        return `<h3${attrs}>${inner}</h3>`;
      });
    }
  }

  /* AND THE WRAPPERS HAVE TO AGREE WITH THE LEVELS AFTER IT.
     A heading is wrapped before that last renumbering, so the wrapper
     can end up round the wrong level: on
     /learning/earlylearning/first10/pilot, "Round One Schools &
     Community" was a bold line promoted to h3, wrapped as a
     sub-heading, and then renumbered to h2 because it is the first
     heading on the page — leaving a .doe-sub containing an h2. A
     sub-heading component holding a top-level heading gets the teal
     tick and the small-caps of a sub-part while announcing itself as
     a section, which is Matt's "it's all messed up".
     Both wrappers are reconciled here, after the levels are final:
     h2 belongs in a section header, h3 in a sub-heading, and a
     heading inside a card or a contact block belongs to neither. */
  if (opts.outline !== false) {
    const sp = componentSpans(html);
    const free = i => !sp.some(([a, b]) => i >= a && i < b);
    const WRAP = /<div[^>]*class="[^"]*\b(blockhead|doe-sub)\b[^"]*"[^>]*>\s*<h([23])\b([^>]*)>([\s\S]*?)<\/h\2>\s*<\/div>/gi;
    let swapped = 0;
    html = html.replace(WRAP, (m, cls, lv, attrs, inner) => {
      const want = lv === '2' ? 'blockhead' : 'doe-sub';
      if (cls === want) return m;
      swapped++;
      return `<div class="${want}"><h${lv}${attrs}>${inner}</h${lv}></div>`;
    });
    /* A heading the renumbering moved into a level that has no
       wrapper yet. */
    for (const [lv, cls] of [['2', 'blockhead'], ['3', 'doe-sub']]) {
      const bare = [...html.matchAll(new RegExp('<h' + lv + '\\b[^>]*>[\\s\\S]*?<\\/h' + lv + '>', 'gi'))]
        .filter(m => free(m.index))
        .filter(m => !/<div[^>]*class="[^"]*\b(?:blockhead|doe-sub)\b[^"]*"[^>]*>\s*$/i.test(html.slice(Math.max(0, m.index - 140), m.index)))
        .filter(m => !/<(li|td|th|blockquote|figure)\b/i.test(html.slice(Math.max(0, m.index - 400), m.index).split(/<\/(?:li|td|th|blockquote|figure)>/).pop()));
      for (const m of bare.reverse()) {
        html = html.slice(0, m.index) + `<div class="${cls}">` + m[0] + '</div>' + html.slice(m.index + m[0].length);
        swapped++;
      }
    }
    if (swapped) decisions.push({ id: 'rewrap', on: true,
      label: 'Match the heading treatments to the final levels',
      why: `${swapped} heading${swapped > 1 ? 's were' : ' was'} wearing the wrong treatment for its level — a section header round a sub-heading or the reverse — because the wrapper was chosen before the outline was finished.`,
      value: swapped + ' fixed' });
  }

  /* (d2g) A LINK STANDING ALONE AT THE TOP OF THE PAGE.
     104 pages open with a paragraph holding nothing but a link or a
     button — the NEO login, the ESSA guidance document, an
     application form. It is the first thing the page asks you to do,
     and it is set as a line of body text above the content.
     The banner already has a place for exactly this. Moving it there
     puts the page's one action where the eye lands first, and it is
     the same slot the CTA override writes into, so a page that has
     one already keeps it and this never competes.
     Only the FIRST such paragraph, only at the very top, and only
     when it is genuinely alone — a paragraph with a sentence and a
     link in it is prose and stays where it is. */
  if (opts.leadbtn !== false && !opts.cta) {
    /* Two shapes. A paragraph that is ONLY the link, and a paragraph
       that OPENS with a button and then says something about it —
       /pathways writes the button and an italic line beneath it in
       one centred paragraph, so the first pattern could not see it.
       In the second shape only the button moves; whatever else the
       paragraph says stays exactly where the author put it, because
       removing it is a content decision and not this step's to make. */
    const top = html.match(/^\s*(?:<(?:p|div)[^>]*>\s*(?:&nbsp;|\s)*<\/(?:p|div)>\s*|<img\b[^>]*>\s*|<p[^>]*>\s*<img\b[^>]*>\s*<\/p>\s*)*(<p[^>]*>\s*(<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>)\s*(?:&nbsp;|\s)*<\/p>)/i)
      || html.match(/^\s*(?:<(?:p|div)[^>]*>\s*(?:&nbsp;|\s)*<\/(?:p|div)>\s*|<img\b[^>]*>\s*|<p[^>]*>\s*<img\b[^>]*>\s*<\/p>\s*)*<p[^>]*>\s*()(<a\b([^>]*\bclass="[^"]*\bbtn\b[^"]*"[^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>)(?=\s*(?:<br\s*\/?>|&nbsp;|\s))/i);
    /* THE LABEL CANNOT CONTAIN </a>, AND SAYING SO MATTERS.
       Written `[\s\S]*?` the first pattern still backtracks: it wants
       an </a> with only whitespace and a </p> after it, and when the
       real one is followed by <br> it keeps growing until it finds
       some other </a> that does qualify — on /pathways that was 642
       characters away, deep inside a card, so the "label" became the
       button's words plus the whole Adult Education card. The
       length guard below is the only thing that caught it.
       A label that by construction stops at the first </a> cannot do
       that, whatever follows. */
    if (top) {
      const href = (top[3].match(/href="([^"]*)"/i) || [])[1];
      const label = strip(top[4]);
      /* NOT A SENTENCE, AND NOT "CLICK HERE". A button's label is
         read out of context — by a screen reader listing the links on
         the page, and by anyone scanning the banner — so it has to
         say where it goes on its own. "Looking for a HiSET/GED
         transcript? Click here!" fails that twice, and promoting it
         to the most prominent control on the page would make a
         problem that needs a person to fix it larger rather than
         smaller. Those stay where they are. */
      const sentence = /click here|\?|!$/i.test(label);
      if (href && label && label.length <= 70 && !sentence && !/^#/.test(href)) {
        pageCta = [{ label, href }];
        /* The first pattern captures the whole paragraph in group 1
           and takes all of it; the second captures nothing there and
           takes only the anchor, leaving the rest of the paragraph. */
        html = html.replace(top[1] || top[2], '');
        decisions.push({ id: 'leadbtn', on: true, label: 'Put the page’s one action in the banner',
          why: `This page opens with a paragraph holding nothing but "${label}" — the first thing it asks you to do, set as a line of body text. The banner has a place for exactly that, so it moves there as a button. The link and its words are unchanged; only where it sits changes.`,
          value: label });
      }
    }
  }

  /* (d4b) WHO TO CONTACT ABOUT WHAT BELONGS IN THE CONTACT BLOCK.
     /safety/security ends with a full section header — "Contact
     Michelle for:" — and a list of three things, and then, directly
     underneath, the contact block naming Michelle Legare. Two halves
     of one answer, separated by a heading that also claimed a place
     in the banner's contents list as though it were a part of the
     page.
     The component list already has the shape for this and calls it
     the directory pattern: inside the cube, details on the left and
     what to contact them about on the right, no divider between.
     NARROW ON PURPOSE. Only a label that sits LOOSE in the flow with
     a contact block next to it. /learning/technology/contact writes
     the same words eight times inside staff cards, each with a
     photograph and a description — that is a good structure and it is
     left exactly alone. The test is whether the list is already
     inside something. */
  if (opts.contactfor !== false) {
    let n = 0;
    const LABEL = /^contact\s+\S.{0,44}?(?:for|regarding|about|with)\b.{0,20}?:?\s*$/i;
    const spans = componentSpans(html);
    const inComponent = (i) => spans.some(([a, b]) => i >= a && i < b);
    /* EVERY GROUP IS BOUNDED SO NOTHING CAN BACKTRACK PAST ITS OWN
       CLOSING TAG — and that is not caution, it is the fourth time
       today that a lazy quantifier has done real damage here.
       Written `[\s\S]*?<\/ul>` the list group does not stop at the
       first </ul>: if that one is not followed by a contact block it
       simply grows to the next, and the next, until it finds one that
       is. On /safety/security that made the match start at a
       paragraph five lists earlier, so the label read "Online
       Recruitment of Child Sex Trafficking", the label test rightly
       refused it — and String.replace consumed the whole span anyway,
       so the heading this rule was written for never got its own
       match attempt.
       A group that cannot contain its own closing tag cannot run
       away, whatever follows it. */
    const pat = new RegExp(
      '(?:<div[^>]*class="(?:[^"]*\\s)?blockhead(?:\\s[^"]*)?"[^>]*>\\s*<h[1-6][^>]*>((?:(?!<\\/h[1-6]>)[\\s\\S])*)<\\/h[1-6]>\\s*<\\/div>'
      + '|<p[^>]*>\\s*<strong>((?:(?!<\\/strong>)[\\s\\S])*)<\\/strong>\\s*<\\/p>)'
      + '\\s*(<ul\\b[^>]*>(?:(?!<\\/ul>)[\\s\\S])*<\\/ul>)'
      + '\\s*(<div[^>]*class="[^"]*\\bcontact-cube\\b[^"]*"[^>]*>)', 'gi');
    html = html.replace(pat, (m, h1, h2, list, cubeOpen, at) => {
      const label = strip(h1 || h2 || '').replace(/\s+/g, ' ').trim();
      if (!LABEL.test(label)) return m;
      if (inComponent(at)) return m;
      n++;
      /* Marked, then filled in below once the cube's own contents are
         known — the cube runs past this match. */
      return `\u0003${label}\u0004${list}\u0003${cubeOpen}`;
    });
    if (n) {
      html = html.replace(/\u0003([\s\S]*?)\u0004([\s\S]*?)\u0003(<div[^>]*class="[^"]*\bcontact-cube\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/gi,
        (m, label, list, open, body, close) => {
          /* The heading the cube already carries stays at the top,
             across both columns; everything under it is the details. */
          const head = body.match(/^\s*<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i);
          const details = head ? body.slice(head[0].length) : body;
          return open + (head ? head[0] : '') +
            '\n<div class="row">\n<div class="col-sm-6">' + details.trim() + '</div>\n' +
            '<div class="col-sm-6">\n<p><strong>' + label + '</strong></p>\n' + list.trim() + '\n</div>\n</div>\n' + close;
        });
      html = html.replace(/[\u0003\u0004]/g, '');
      decisions.push({ id: 'contactfor', on: true, label: 'Put who-to-contact-about-what in the contact block',
        why: `"${'Contact … for:'}" and its list sit loose in the page directly above the contact block that names the same person — two halves of one answer, with a section header between them that also claimed a place in the contents list. The component list already has this shape and calls it the directory pattern: details on the left, what to contact them about on the right. Every word moves together; none changes.`,
        value: n + ' block' + (n > 1 ? 's' : '') });
    }
  }

  /* (d4c) A PORTRAIT PHOTOGRAPH CROPPED TO A LANDSCAPE LETTERBOX.
     Every card image is set to 16:9 with object-fit:cover, which is
     right for a banner and ruinous for a headshot. The staff photos
     on /learning/technology/contact are 500x667 — taller than they
     are wide — and rendered at 293x165 the crop keeps a quarter of
     the picture and throws away the rest of the person.
     The natural size is known: image-sizes.json holds 1,320 of them,
     measured from the files themselves. Where the source is portrait
     the card is told so and the stylesheet gives it a ratio it fits,
     so the picture runs UP the card rather than being cut down to a
     strip. Nothing is guessed — a picture with no measurement keeps
     the default. */
  if (opts.portrait !== false && SIZES) {
    let n = 0;
    html = html.replace(/<img\b([^>]*\bclass="[^"]*\bcard-img-top\b[^"]*"[^>]*)>/gi, (m, attrs) => {
      const src = (attrs.match(/src="([^"]*)"/i) || [])[1];
      if (!src) return m;
      /* THE CACHE IS KEYED BY PATH; PAGES WRITE BOTH FORMS.
         image-sizes.json holds "/doe/sites/…/EBanks resize.jpg", and
         this page writes the same file as
         "https://www.maine.gov/doe/sites/…" — so a straight lookup
         missed every image on it and the rule silently did nothing.
         The origin comes off before asking. */
      let size = null;
      try {
        const key = dec(src).replace(/^https?:\/\/(?:www\.)?maine\.gov/i, '');
        size = SIZES[key] || SIZES[dec(src)] || null;
      } catch (e) { size = null; }
      if (!size || !size.w || !size.h) return m;
      if (size.h <= size.w * 1.05) return m;          // landscape or square: leave it
      if (/doe-img-portrait/.test(attrs)) return m;
      n++;
      return `<img${attrs.replace(/class="/, 'class="doe-img-portrait ')}>`;
    });
    if (n) decisions.push({ id: 'portrait', on: true, label: 'Let a portrait photograph keep its shape',
      why: `${n} card picture${n > 1 ? 's are' : ' is'} taller than ${n > 1 ? 'they are' : 'it is'} wide — headshots, mostly — and every card image is cropped to 16:9, so most of the person is thrown away to make a landscape strip. Measured from the files: these are 500x667 rendered into 293x165. Marked as portrait, the card gives them a shape they fit and the picture runs up the card instead. The file does not change.`,
      value: n + ' picture' + (n > 1 ? 's' : '') });
  }

  /* (d4d) A CARD WITH TWO TITLE BARS.
     /learning/technology/contact gives every staff card the person's
     name and then their job title, each as its own h3.card-title — so
     the card opens with two identical navy bars stacked, and a screen
     reader announces two headings of equal rank where there is one
     thing being named.
     The job title is not a second heading; it is a subtitle of the
     first. It keeps its words and its italics and becomes one. */
  if (opts.cardsubtitle !== false) {
    let n = 0;
    html = html.replace(/(<h([1-6])[^>]*class="[^"]*card-title[^"]*"[^>]*>[\s\S]*?<\/h\2>)\s*<h([1-6])[^>]*class="[^"]*card-title[^"]*"[^>]*>([\s\S]*?)<\/h\3>/gi,
      (m, first, l1, l2, second) => {
        if (/<h[1-6]/i.test(second)) return m;
        n++;
        const inner = second.trim().replace(/^<em>([\s\S]*)<\/em>$/i, '$1');
        return `${first}\n<p class="doe-card-sub"><em>${inner}</em></p>`;
      });
    if (n) decisions.push({ id: 'cardsubtitle', on: true, label: 'One title bar to a card, not two',
      why: `${n} card${n > 1 ? 's open' : ' opens'} with two headings of the same rank one above the other — the person's name and then their job title — so the card has two identical title bars and a screen reader announces two headings where one thing is being named. The job title becomes the subtitle it already reads as. The words do not change.`,
      value: n + ' card' + (n > 1 ? 's' : '') });
  }

  /* (d5) A SECTION HEADER INSIDE A GRID COLUMN IS NOT A SECTION.
     .blockhead is the page's section device — a full-width navy band
     that says "a new part of this page starts here". Three of them
     side by side in one row therefore claim three sections where
     there is one, and because the contents list is built from
     .blockhead h2, they also turn up in the banner as if they were
     places to jump to.
     /about/contact is the clearest case: Mailing Address, Physical
     Address and Phone & TTY are each an h2 in its own column, so the
     page's "On this page" list reads Mailing Address / Physical
     Address / Phone & TTY — which is not an outline of the page, it
     is a contact card. They are labels on three facts.
     A label inside a column is a sub-heading of the section the row
     belongs to, so it takes the sub-heading treatment: the same teal
     mark a heading inside any other component gets, and out of the
     contents list where it never belonged. Not one word changes. */
  if (opts.colhead !== false) {
    let n = 0;
    for (const c of [...html.matchAll(/<div[^>]*class="[^"]*\bcol-[a-z]+-\d+[^"]*"[^>]*>/gi)].reverse()) {
      let d = 1, i = c.index + c[0].length;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let z;
      while (d > 0 && (z = t.exec(html))) { d += z[0][1] === '/' ? -1 : 1; i = z.index + z[0].length; }
      const inner = html.slice(c.index + c[0].length, i - 6);
      let out = inner;
      out = out.replace(/<div[^>]*class="(?:[^"]*\s)?blockhead(?:\s[^"]*)?"([^>]*)>\s*<h2([^>]*)>([\s\S]*?)<\/h2>\s*<\/div>/gi,
        (m, outerAttrs, hAttrs, text) => {
          /* The anchor id belongs to the heading now, so a link that
             already points at this section still lands on it. */
          const id = (outerAttrs.match(/\sid="[^"]*"/i) || hAttrs.match(/\sid="[^"]*"/i) || [''])[0];
          n++; return `<h3${id}>${text.trim()}</h3>`;
        });
      if (out === inner) continue;
      /* AND WHERE THE WHOLE COLUMN IS A LABEL AND A FACT, say so.
         "Mailing Address / 23 State House Station, Augusta ME" is
         reference information — short, fixed, looked up rather than
         read — and three of them across a row are one contact card,
         not three sections. Marked so the stylesheet can set them as
         a set. A column with a heading and four paragraphs under it
         is a real part of the page and is only demoted, not marked. */
      let open = c[0];
      if (strip(out.replace(/<h3[^>]*>[\s\S]*?<\/h3>/i, '')).length < 200) {
        open = /class="/.test(open) ? open.replace(/class="/, 'class="doe-fact ') : open.replace('<div', '<div class="doe-fact"');
      }
      html = html.slice(0, c.index) + open + out + html.slice(i - 6);
    }
    if (n) decisions.push({ id: 'colhead', on: true, label: 'Stop a column label claiming to be a section',
      why: `${n} section header${n > 1 ? 's sit' : ' sits'} inside a grid column rather than across the page — so a row of three labels claims three sections where there is one, and each turns up in the banner's contents list as somewhere to jump to. They become sub-headings of the section the row is in, with the same mark a heading inside any other component gets. No word changes, and an anchor an author wrote by hand moves onto the heading with it.`,
      value: n + ' header' + (n > 1 ? 's' : '') });
  }

  /* (d6) A TABLE TOO LONG TO SCAN GETS THE SITE'S OWN SEARCH.
     The theme already loads jQuery and DataTables on every page and
     initialises them on `table.tables` — so a searchable table needs
     no script, no library and no new component: it needs one class.
     26 tables already carry it, including the contact directory,
     whose own copy tells the reader to "type in a keyword(s) to the
     search bar below".
     data-page-length="25" comes with it. The library's own default is
     ten, which would hide rows that are visible today on 65 of these
     tables; twenty-five leaves all but 22 of them whole while still
     giving the reader the length menu and the pager the moment a
     table is long enough to need them. Nothing is reordered until
     someone asks.
     FIFTEEN ROWS. Below that the whole table is on screen at once and
     a search box is furniture; above it, finding one row means
     reading every row. */
  if (opts.searchtable !== false) {
    let n = 0;
    html = html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (m, attrs, body) => {
      if (/\btables\b|\btablessortdesc\b/.test(attrs)) return m;
      const rows = (body.match(/<tr[\s>]/gi) || []).length - (/<thead[\s>]/i.test(body) ? 1 : 0);
      if (rows < 15) return m;
      n++;
      const withClass = /class="/.test(attrs)
        ? attrs.replace(/class="/, 'class="tables ')
        : attrs + ' class="tables"';
      return `<table${withClass} data-page-length="25">${body}</table>`;
    });
    if (n) decisions.push({ id: 'searchtable', on: true, label: 'Let a long table be searched',
      why: `${n} table${n > 1 ? 's run' : ' runs'} to fifteen rows or more, so finding one row means reading every row. The theme already loads the search behaviour on every page and switches it on for any table marked this way — 26 tables across the site already are, including the contact directory. It adds a search box and a "show 25 entries" menu above the table, makes the column headings sortable, and pages below twenty-five rows at a time — which leaves all but the longest tables whole. Nothing is reordered and nothing changes until someone types.`,
      value: n + ' table' + (n > 1 ? 's' : '') });
  }

  /* ── 4. SECTION HEADINGS AND THE CONTENTS LIST ──────────────── */
  /* ONE PASS OVER THE SAME ELEMENTS, which is the whole fix.
     This used to build a list of headings with one pattern and then
     hand out the ids with a DIFFERENT one, walking a counter down
     every <div class="blockhead"> on the page. The two populations
     are not the same: the list only counted a blockhead whose first
     child is an <h2>, while the counter advanced on every blockhead
     there is — one holding an h3, one left empty, one that already
     carried a hand-written id. Any single one of those and every id
     after it belonged to the heading above it.
     WHAT THAT DID TO A PAGE: on /funding/gpa/eps/23-24 all five
     contents-list links jumped one section short. On
     /literacy/literacyforme/resources three did, and the last
     section was given the literal id "sx" — the fallback string,
     reached because the counter had run past the end of the list.
     19 wrong ids on 10 pages, and nothing about it is visible until
     somebody clicks.
     A HAND-WRITTEN ID WINS. The old code skipped those elements when
     stamping but still pointed the contents list at the slug it
     would have used, so /learning/standards/visualarts linked to
     #arts-assessment while the section said id="assessment". Now the
     id the element actually carries is the id the list links to. */
  const sections = [];
  const seenIds = new Set();
  html = html.replace(/<div class="blockhead"([^>]*)>([\s\S]*?)<\/div>/gi, (m, rest, inner) => {
    if (/<div\b/i.test(inner)) return m;                 // not a plain section header
    const h = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const text = h ? strip(h[1]) : '';
    if (!text) return m;                                  // an h3 or an empty bar: not a section
    const existing = (rest.match(/\sid="([^"]*)"/) || [])[1];
    let id = existing || slug(text);
    if (!id) id = 'section-' + (sections.length + 1);
    /* Two sections can be called the same thing. Two elements cannot
       share an id, and a duplicate sends every link to the first. */
    if (!existing) {
      let base = id, k = 2;
      while (seenIds.has(id)) id = base + '-' + k++;
    }
    seenIds.add(id);
    sections.push({ id, text });
    return existing ? m : `<div class="blockhead" id="${id}"${rest}>${inner}</div>`;
  });

  const heads = sections.map(s => s.text);
  let toc = '';
  if (sections.length >= 3 && opts.useToc !== false) {
    toc = '<nav class="doe-toc"><h3>On this page</h3><ol>' +
      sections.map(s => `<li><a href="#${s.id}">${s.text}</a></li>`).join('') + '</ol></nav>';
    decisions.push({ id: 'toc', on: true, label: `Add a contents list (${sections.length} sections)`,
      why: 'Built from the section headings already on the page. Below three sections a list is not a route.' });
  } else if (sections.length && sections.length < 3) {
    notes.push(`${sections.length} section header${sections.length > 1 ? 's' : ''} — too few for a contents list.`);
  }
  /* MEASURED ON WHAT WE ARE HANDING OVER, NOT ON WHAT WE WERE GIVEN.
     This read audit.outline — the audit of the LIVE page — and told a
     reviewer "Needs a person" on 384 pages. The outline walk has
     rebuilt the levels and the cap has closed every gap by the time
     this runs, so on all 384 the person was being sent to look at a
     fault that no longer existed in the proposal. A note that
     describes the source rather than the output is worse than no
     note: it costs a reviewer the time to go and find nothing.
     Kept rather than deleted, and pointed at the finished html, so it
     still speaks up if a later transform ever reopens a gap. */
  {
    const seq = [...html.matchAll(/<h([1-6])\b/gi)].map(m => +m[1]);
    const jumps = [];
    for (let i = 1; i < seq.length; i++) if (seq[i] > seq[i - 1] + 1) jumps.push(`h${seq[i - 1]} to h${seq[i]}`);
    if (jumps.length) notes.push(`Heading levels skip in the proposal: ${[...new Set(jumps)].join('; ')}. Needs a person.`);
  }
  if (audit && !audit.components.blockheads && audit.words > 400) {
    notes.push(`${audit.words} words with no section headers at all — the biggest single improvement available here.`);
  }

  /* ── 5. THE EYEBROW, from the parent page's title ───────────── */
  let eyebrow = '';
  if (index && node.alias && opts.useEyebrow !== false) {
    const parent = node.alias.replace(/\/[^/]+$/, '');
    const p = parent && parent !== node.alias ? index.find(x => x.alias === parent) : null;
    if (p) {
      eyebrow = p.title;
      decisions.push({ id: 'eyebrow', on: true, label: `Eyebrow: "${p.title}"`,
        why: `Taken from the parent page, ${parent}.` });
    }
  }

  /* ── 6. CONTACT ANCHOR AND THE FLOATING CONTROLS ────────────── */
  /* THE SAME SWEEP AGAIN, AFTER EVERYTHING THAT MAKES A CHIP.
     interior-cleanup folds a tag back into its button, but chips are
     also made here — by the file-name rule and by the colon rule —
     and a cleanup pass cannot reach those. One button survived every
     guard because of it. Run last, where nothing can add another. */
  {
    let folded = 0;
    html = html.replace(/(<a\b[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>)((?:(?!<\/a>)[\s\S])*?)((?:\s|&nbsp;)*)<\/a>((?:\s|&nbsp;)*)<span class="doe-chip"[^>]*>([^<]*)<\/span>/gi,
      (m, open, inner, tail, gap, chip) => {
        const label = chip.trim();
        if (!label) return m;
        folded++;
        if (new RegExp('\\(\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\)', 'i').test(inner)) {
          return `${open}${inner}${tail}</a>`;
        }
        return `${open}${inner} (${label})${tail}</a>`;
      });
    if (folded) decisions.push({ id: 'btnchip', on: true, label: 'Keep the format inside the button',
      why: `${folded} button${folded > 1 ? 's had' : ' had'} a format tag set beside the label. A tag describes a document in a list of documents; a button is the one action the page is asking for, and two devices on one control make it neither. The format goes back inside the button's own label, in the brackets its author used. No word is added or removed.`,
      value: folded + ' button' + (folded > 1 ? 's' : '') });
  }

  /* A CONTACT SENTENCE BECOMES A CONTACT BLOCK.
     Five pages carry a standalone paragraph that exists only to say
     who to ask — "If you have questions regarding any of our
     trainings, please contact a member of the Child Nutrition
     staff" — and four of them are Child Nutrition. Sitting in the
     body it is the first thing read and the least useful; sitting in
     the banner, as the deck rule used to put it, it is the page
     describing itself as a place to be redirected from.
     It is the site's contact block, written as a sentence. Moved to
     the foot and drawn as one, it lands where a reader looks for it
     AND the banner gains its Contact chip, so it is one click from
     the top of the page.
     NOT ONE WORD IS ADDED OR CHANGED. The sentence, and the link it
     already contains, move intact. The block's "Contact" heading is
     the component's own chrome — marked so the text check knows the
     page did not gain a word. */
  if (opts.contactcube !== false && !/class="[^"]*contact-cube/.test(html)) {
    const para = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .filter(m => !inComponent(m.index))
      .find(m => {
        const t = strip(m[1]).replace(/\s+/g, ' ').trim();
        return CONTACT_LEAD.test(t) && t.length < 320 && /<a\b|mailto:/i.test(m[1]);
      });
    if (para) {
      const inner = para[1].replace(/^\s*<strong>([\s\S]*)<\/strong>\s*$/i, '$1').trim();
      html = html.slice(0, para.index) + html.slice(para.index + para[0].length)
        + `\n<div class="contact-cube" id="contact">\n<h3 data-src="component">Contact</h3>\n<p>${inner}</p>\n</div>\n`;
      decisions.push({ id: 'contactcube', on: true, label: 'Draw the contact sentence as a contact block',
        why: `The page carries a sentence whose whole job is to say who to ask, set as body text at the top where it is read before anything it could answer. Drawn as the site's contact block at the foot it sits where a reader looks for it, and the banner gains the Contact chip that jumps to it. The sentence and its link are unchanged.`,
        value: strip(inner).slice(0, 48) });
    }
  }
  const hasContact = /class="[^"]*contact-cube/.test(html);
  if (hasContact) {
    /* THE WHOLE TAG, not the part up to the class name. The match
       used to stop at "contact-cube", so an id written AFTER the
       class was invisible and a second id="contact" was added beside
       it — two ids on one element, and the anchor links land on
       whichever the browser decides. */
    html = html.replace(/<div[^>]*class="[^"]*contact-cube[^"]*"[^>]*>/i,
      m => (/\sid=/.test(m) ? m : m.replace('<div', '<div id="contact"')));
  }

  /* ── 6b. THE IN-PAGE COPY OF A BANNER BUTTON ────────────────── */
  /* Promoting a link into the banner leaves the original sitting in
     the body, so the page offers the same button twice — which is
     what /meac looked like: two blue buttons at the top and the same
     two again below the fold.
     This only ever removes a paragraph whose ENTIRE text is the link
     itself and which is styled as a button. A link inside a sentence
     is left alone, because taking it out would leave a hole in the
     prose — that is an author's call, not this tool's. */
  if (opts.cta && opts.dedupeCta !== false) {
    /* &amp; TOO. The markup writes an ampersand as &amp; and the
       override writes it as &, so a Microsoft Forms URL — which is
       nothing but query parameters — never matched itself and the
       duplicate sentence stayed on the page beneath its own button. */
    const tidy = s => decodeURIComponent(String(s || '').replace(/&amp;/g, '&'))
      .replace(/\/+$/, '').trim().toLowerCase();
    for (const c of [].concat(opts.cta)) {
      const wantHref = tidy(c.href), wantText = norm(c.label);
      for (const m of [...html.matchAll(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?(<a\b[^>]*>[\s\S]*?<\/a>)(?:(?!<\/p>)[\s\S])*?<\/p>/gi)]) {
        const solo = strip(m[0]) === strip(m[1]) && /class="[^"]*\bbtn\b/i.test(m[1]);
        /* THE OTHER SHAPE IS A SENTENCE THAT EXISTS TO BE CLICKED.
           "Please use this form to submit questions about community
           schools." is not prose with a link in it — it is a call to
           action written as prose, and once the banner carries the
           button the sentence says the same thing a second time.
           Held to one link and 160 characters, so a paragraph that
           also carries information of its own is never touched: the
           test is whether removing it loses anything but the
           instruction to click. */
        const oneLink = (m[0].match(/<a\b/gi) || []).length === 1;
        const short = strip(m[0]).length <= 160;
        if (!solo && !(oneLink && short)) continue;
        const href = (m[1].match(/href="([^"]*)"/i) || [])[1];
        if (tidy(href) !== wantHref && norm(m[1]) !== wantText) continue;
        html = html.replace(m[0], '');
        /* THE WHOLE PARAGRAPH, not just the link inside it. Exempting
           only the link text left the sentence around it looking like
           a block that had gone missing, and the page reported itself
           unsafe — which was the check working correctly on an
           incomplete declaration of what had been removed. */
        removedOnPurpose.push(strip(m[0]));
        decisions.push({ id: 'cta-dupe-' + slug(c.label), on: true,
          label: 'Remove the in-page copy of a banner button',
          removes: strip(m[1]),
          why: `"${c.label}" is now a button in the banner, so this second copy further down the page says the same thing again.` });
        break;
      }
    }
  }

  /* (c25) A TAG THAT EVERY ROW CARRIES TELLS YOU NOTHING.
     A format tag earns its place by telling one row from another.
     Where a list is six links and all six are PDFs, the tag says
     "PDF" six times and separates nothing — a column of identical
     words down the right-hand edge — and inside a narrow card it is
     the thing that pushes half the rows onto a second line.
     Ruled on the MEAC office-hours table first: a Recording column
     that is all YouTube and a Notes column that is all PDF. "This
     kind of a table doesn't need this." A list of six PDFs is the
     same table with the borders taken off. 5,709 tags on 198 pages
     are that, 52% of every tag on the site.

     THE SCOPE IS ONE LIST OR ONE COLUMN, NEVER THE PAGE. /meac has
     six resource cards and each is its own list, because the reader
     compares rows inside a card, not rows in different cards. A page
     whose first list is all PDF and whose second mixes PDF and Video
     loses the first list's tags and keeps the second's. 590 mixed
     lists and 76 mixed columns keep every tag they have.

     A ROW WITH A LINK AND NO TAG BREAKS THE UNIFORMITY, and this is
     the case the whole rule turns on. /meac's Chronic Absenteeism
     card is four links: three PDFs and a data visualisation that
     opens a web page. Drop the three tags and all four rows look
     alike, and the one row that behaves differently when you click
     it is the one the reader can no longer pick out. So that list
     keeps its tags. "Uniform" means every row that carries a link
     carries the same tag — not merely that the tags present agree.
     Reading it the loose way takes 535 more tags off the site and
     blinds 136 lists on 97 pages to their own odd row, which is the
     one thing a tag is for.

     UNLESS THE ROW SAYS IT IN WORDS. The MEAC Notes column is eight
     cells whose link text is literally "PDF" — filechip left those
     alone because the format was already written — and one cell
     reading "PDF | Slides", where the second link got a tag. Counted
     naively that column holds one tag, below the threshold, and the
     page keeps a single stray tag in a table Matt asked to be clear
     of them. A row whose own text names the same format is a row
     that carries the tag, in prose. It counts, and it does not break
     the uniformity.

     AND ONLY TAGS THIS TOOL INVENTED. filechip reads "PDF" off a
     file name and marks its own work data-src="file"; that is this
     tool's decoration and it may take it back. A tag made from a
     "(PDF)" the author typed is the author's word — moving it into a
     tag was never licence to delete it — so a group holding one is
     left whole (28 groups, 247 tags). It is the line the loss check
     already draws, which is why dropping an invented tag cannot make
     a page report text missing, and dropping a typed one would,
     correctly.

     OFF UNLESS A PAGE ASKS FOR IT. Turning this on everywhere
     takes 5,709 tags off 198 pages in one go, which is a change to
     look at rather than a default to inherit. { "samechip": true }
     per page in overrides.json until that call is made.

     A HEADER CELL IS NOT A ROW MISSING A TAG, so <th> is excluded
     before the group is judged. Column index counts colspan; it does
     not track rowspan, and a table that uses one can only mis-group
     cells into a set whose labels disagree, which this rule skips. */
  if (opts.samechip) {
    const VOIDT = /^(?:br|img|hr|input|meta|link|source|col|area|base|embed|param|track|wbr)$/i;
    /* One pass with a stack: every <li>, <td> and <th> becomes a row
       that knows which group it belongs to — the list that holds it,
       or the table column it sits in. */
    const rows = [];
    {
      const stack = [], T = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;
      let m, g = 0;
      const near = (k) => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === k) return stack[i]; return null; };
      const popTo = (tag, at) => {
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) {
          for (let j = stack.length - 1; j >= i; j--) { const e = stack.pop(); if (e.row) e.row.end = Math.min(e.row.end, at); }
          return;
        }
      };
      while ((m = T.exec(html))) {
        const tag = m[2].toLowerCase();
        if (VOIDT.test(tag) || m[4] === '/') continue;
        if (m[1] === '/') { popTo(tag, m.index); continue; }
        const attrs = m[3] || '', after = m.index + m[0].length;
        if (tag === 'ul' || tag === 'ol') { stack.push({ tag, kind: 'list', group: 'L' + (g++) }); continue; }
        if (tag === 'table') { stack.push({ tag, kind: 'table', group: 'T' + (g++), col: 0 }); continue; }
        if (tag === 'tr') {
          if (stack.length && stack[stack.length - 1].tag === 'tr') stack.pop();
          const t = near('table'); if (t) t.col = 0;
          stack.push({ tag, kind: 'tr' }); continue;
        }
        if (tag === 'li' || tag === 'td' || tag === 'th') {
          /* A row left open by the markup is closed by the next one. */
          const top = stack.length ? stack[stack.length - 1] : null;
          if (top && top.row && (tag === 'li' ? top.tag === 'li' : /^t[dh]$/.test(top.tag))) { stack.pop(); top.row.end = m.index; }
          let group = null, head = false;
          if (tag === 'li') { const L = near('list'); if (L) group = L.group; }
          else {
            const t = near('table');
            if (t) {
              group = t.group + ':' + t.col;
              t.col += parseInt((attrs.match(/colspan="?(\d+)/i) || [])[1] || '1', 10) || 1;
              head = tag === 'th';
            }
          }
          if (!group) { stack.push({ tag, kind: 'other' }); continue; }
          const row = { group, head, start: after, end: html.length, chips: [], links: 0 };
          rows.push(row); stack.push({ tag, kind: 'cell', row }); continue;
        }
        stack.push({ tag, kind: 'other' });
      }
      for (const e of stack) if (e.row) e.row.end = Math.min(e.row.end, html.length);
    }
    /* The row a thing sits in is the INNERMOST one that contains it,
       which is what makes a list inside a table cell its own group
       rather than part of that column's. */
    const sorted = rows.slice().sort((a, b) => a.start - b.start);
    const rowAt = (pos) => {
      let best = null;
      for (const r of sorted) { if (r.start > pos) break; if (pos < r.end) best = r; }
      return best;
    };
    let mm;
    const CHIP = /<span class="doe-chip"([^>]*)>([^<]*)<\/span>/gi;
    while ((mm = CHIP.exec(html))) {
      const r = rowAt(mm.index);
      if (r) r.chips.push({ label: mm[2].trim(), mine: /data-src="file"/.test(mm[1]), at: mm.index, len: mm[0].length });
    }
    /* A button is a different object and never counted as a row's
       link, for the same reason it never gets a tag. */
    const LINK = /<a\b([^>]*)>/gi;
    while ((mm = LINK.exec(html))) {
      const href = (mm[1].match(/href="([^"]*)"/i) || [])[1] || '';
      if (!href || href.charAt(0) === '#' || /\bbtn\b/.test(mm[1])) continue;
      const r = rowAt(mm.index); if (r) r.links++;
    }
    const groups = new Map();
    for (const r of rows) { const a = groups.get(r.group); if (a) a.push(r); else groups.set(r.group, [r]); }
    const cut = [], tally = {}; let cleaned = 0;
    for (const g of groups.values()) {
      const body = g.filter(r => !r.head);
      const chips = [];
      for (const r of body) for (const c of r.chips) chips.push(c);
      if (!chips.length) continue;
      const label = chips[0].label;
      if (chips.some(c => c.label !== label)) continue;      // mixed: every tag is doing work
      if (chips.some(c => !c.mine)) continue;                // the author's own word
      const says = (r) => {
        const t = html.slice(r.start, r.end).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        return FORMAT_WORDS.some(w => canonKey(w) === canonKey(label)
          && new RegExp('(?:^|[^A-Za-z])' + w.replace(/ /g, '\\s+') + '(?![A-Za-z])', 'i').test(t));
      };
      const bare = body.filter(r => r.links && !r.chips.length);
      if (bare.some(r => !says(r))) continue;                // a row that behaves differently
      if (chips.length + bare.length < 2) continue;          // one link is not a pattern
      for (const c of chips) cut.push(c);
      tally[label] = (tally[label] || 0) + chips.length;
      cleaned++;
    }
    if (cut.length) {
      /* Back to front, so an earlier removal cannot move a later
         offset out from under itself. */
      cut.sort((a, b) => b.at - a.at);
      for (const c of cut) html = html.slice(0, c.at) + html.slice(c.at + c.len);
      const kinds = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + ' ' + k).join(', ');
      decisions.push({ id: 'samechip', on: true,
        label: 'Drop a format tag that every row in a list already carries',
        why: `${cut.length} tag${cut.length > 1 ? 's' : ''} — ${kinds} — sit in ${cleaned} list${cleaned > 1 ? 's or columns' : ' or column'} where every linked row says the same format, so the tag tells no row from any other and only repeats down the edge. Where a list mixes formats, or where one row opens something different from the rest, every tag stays. No link text changes and no link changes what it opens.`,
        value: cut.length + ' tag' + (cut.length > 1 ? 's' : '') });
    }
  }

  /* ── 7. ASSEMBLE ────────────────────────────────────────────── */
  const art = opts.art || null;
  if (deck || eyebrow || toc || hasContact) {
    html =
      /* One attribute is the whole difference. Adding a photograph
         later means pasting a style attribute onto this div — no
         class to remember, nothing that can be half-done. */
      /* The band is sized to the title, and the title's line count is
         measured rather than guessed — see measure-titles.js. */
      `<div class="doe-hero${{ 2: ' doe-hero--tall', 3: ' doe-hero--tall3' }[Math.min(3, TITLE_LINES[node.alias] || 1)] || ''}"` +
      (art ? ` style="background-image:url(${art})"` : '') + '>\n' +
      (eyebrow ? `<p class="doe-eyebrow">${eyebrow}</p>\n` : '') +
      (hasContact ? '<p class="doe-contact-link"><a href="#contact">Contact</a></p>\n' : '') +
      (deck ? `<p class="doe-lead">${deck}</p>\n` : '') +
      ((opts.cta || pageCta) ? '<p class="doe-cta">' +
        [].concat(opts.cta || pageCta).map(c => `<a class="btn-cta" href="${c.href}">${c.label}</a>`).join('') +
        '</p>\n' : '') +
      toc + '\n</div>\n' + html;
  }
  html += (hasContact ? '\n<p class="doe-jump"><a href="#contact">Contact</a></p>' : '')
        + '\n<p class="doe-top"><a href="#top">Back to top</a></p>';

  /* A LAST TIDY, AFTER EVERY TRANSFORM RATHER THAN BEFORE THEM.
     interior-cleanup.js removes every empty paragraph and list item
     on the page — measured at zero left — and yet empties were still
     turning up in the finished proposal. They were not survivors: the
     transforms above MAKE them. Lifting a paragraph into the banner
     leaves the wrapper it sat in, retiring a banner graphic leaves
     the paragraph that held it, promoting a bold line to a heading
     leaves whatever else was in that block.
     Cleaning before the transforms could never have caught those, so
     the same sweep runs again here, on what we are actually going to
     hand over. */
  /* A PICTURE ONLY FLOATS IF SOMETHING WILL WRAP AROUND IT.
     doe-img-left exists so prose runs up beside a picture. Where the
     next thing on the page is a grid, a card, a table or a callout,
     nothing wraps — those are boxes and they clear the float — so the
     picture sits alone with a column of white beside it and the block
     below starts past the bottom of it. On /numeracy that is 379px of
     nothing to the right of the landing graphic.
     Un-floated it is simply a picture in the flow, which is what it
     was always going to look like. Decided here, at the end, because
     what follows the picture is only settled once every transform has
     moved what it is going to move — the banner graphic above this
     one had already been retired by the time it mattered. */
  if (opts.unfloat !== false) {
    let unfloated = 0;
    html = html.replace(/(<p[^>]*>(?:\s|&nbsp;)*)?(<img\b[^>]*\bdoe-img-left\b[^>]*>)((?:\s|&nbsp;)*<\/p>)?/gi,
      (m, open, img, close, at, whole) => {
        /* WHAT FOLLOWS, READ PAST THE TAGS THAT ONLY CLOSE THINGS.
           The match above takes a bare <img> whenever the picture sits
           inside a link — the <p> is not adjacent, so neither optional
           group can take it — and then what comes next reads as
           '</a></p><p>…'. The paragraph that would have wrapped is
           hiding behind two closing tags, and the float came off a
           picture that had prose beside it all along.
           Step over a run of closers first. Only the ones that end an
           inline or a paragraph: stepping out of a div, a cell, an
           article leaves the float inside a box the next block never
           reaches, and there the float really does have nothing beside
           it. Never step over an OPENING tag — that tag IS the thing
           being judged. */
        const after = whole.slice(at + m.length)
          .replace(/^(?:\s|&nbsp;)*(?:<\/(?:a|em|strong|b|i|u|s|span|small|sub|sup|font|abbr|figure|figcaption|p)\s*>(?:\s|&nbsp;)*)*/i, '');
        /* Prose wraps. A box does not. Nor do the two links this file
           adds at the foot of every page: a picture with nothing
           beside it but 'Back to top' is exactly the case the rule
           exists to catch, and without this it reads as prose. */
        const wraps = /^<(?:p|ul|ol|h[1-6]|dl|blockquote)[\s>]/i.test(after)
          && !/^<p[^>]*\bclass="(?:doe-top|doe-jump)"/i.test(after);
        if (wraps) return m;
        unfloated++;
        const plain = img.replace(/\sclass="([^"]*)"/i, (cm, cls) => {
          const kept = cls.replace(/\bdoe-img-left\b/g, '').replace(/\s{2,}/g, ' ').trim();
          return kept ? ` class="${kept}"` : '';
        }).replace(/\sstyle="([^"]*)"/i, (sm, css) => {
          const kept = css.replace(/(?:^|;)\s*float\s*:[^;]*/gi, '')
            .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
          return kept ? ` style="${kept}"` : '';
        });
        return (open || '') + plain + (close || '');
      });
    if (unfloated) decisions.push({ id: 'unfloat', on: true, label: 'Stop a picture floating with nothing beside it',
      why: `${unfloated} picture${unfloated > 1 ? 's are' : ' is'} set to float so text runs up beside ${unfloated > 1 ? 'them' : 'it'}, but what follows ${unfloated > 1 ? 'them' : 'it'} is a grid, a card or a table — a box, which clears the float rather than wrapping. So the picture sits alone with a column of white to its right and everything below starts past the bottom of it. Unfloated it is a picture in the flow, which is what it already looked like.`,
      value: unfloated + ' picture' + (unfloated > 1 ? 's' : '') });
  }

  html = tidyEmpties(html);

  html = html.replace(/\n{3,}/g, '\n\n').trim();

  /* PROOF THAT NOTHING WAS LOST — which is not the same as proving
     nothing changed, and the difference matters.

     The proposal deliberately ADDS text: the word "Contact", "Back to
     top", the eyebrow taken from the parent page, and a contents list
     that repeats the section headings. Compared naively that made all
     832 pages look like they had changed, which would have made the
     check useless by crying wolf on everything.

     What must never happen is text going MISSING. So the added
     navigation is removed from a copy of the proposal, and what
     remains must match the original character for character. An
     addition is visible on screen and reviewable; a loss is silent,
     and silence is what this exists to catch. */
  const ADDED = /<nav class="doe-toc"[\s\S]*?<\/nav>|<p class="doe-eyebrow"[\s\S]*?<\/p>|<p class="doe-contact-link"[\s\S]*?<\/p>|<p class="doe-jump"[\s\S]*?<\/p>|<p class="doe-top"[\s\S]*?<\/p>/g;
  /* .doe-cta IS NOT IN THAT LIST ANY MORE. It was, because the
     banner's buttons are labelled in overrides.json rather than taken
     off the page — but a heading that is only a link now becomes a
     .doe-cta too, and its words DID come off the page. Masking the
     class ate them and reported 19 pages as losing text. The banner's
     own labels are exempted by name instead, just below. */

  /* BLOCKS, NOT A STRING, and unordered. Comparing the concatenated
     text made 243 pages look damaged because the proposal MOVES the
     opening paragraph into the banner — same characters, different
     order, and an order-sensitive test calls that a loss.

     What actually matters is that every block of text still exists
     somewhere. So each page is reduced to the multiset of its
     paragraphs, headings, list items and cells, sorted, and the two
     multisets must match. A moved paragraph passes; a deleted one
     cannot, because its block would be missing from the list. */
  /* Split on every block boundary, opening AND closing. Closing tags
     alone were not enough: this markup is full of bare text sitting
     between paragraphs rather than inside one, and such text attaches
     itself to whichever block comes next. Move a paragraph and it
     re-attaches somewhere else — which looked like a block vanishing
     and a new one appearing, on 87 pages where nothing was lost. */
  const BLOCK = /<\/?(?:p|div|li|ul|ol|h[1-6]|td|th|tr|table|dl|dt|dd|br|hr|section|article|nav|blockquote|figure|figcaption)\b[^>]*>/gi;
  /* MDOE -> Maine DOE is a substitution inside a paragraph, so the
     paragraph's whole block changes and the multiset comparison sees
     one block vanish and another appear. Normalised identically on
     both sides, so the check still catches a paragraph that really
     went missing. */
  /* COMMENTS ARE NOT CONTENT, on either side. /exploreeducation/
     makemove carries a malformed comment — <!--- … ---> — and the
     stray "--->" was being counted as a block of text, so removing a
     broken image from inside that comment read as losing a paragraph.
     Stripped from both sides, which is also simply true: nothing
     inside a comment is on the page. */
  /* ONE NORMALISER, USED BY BOTH SIDES OF THE CHECK.
     It was two: the block list stripped whitespace and brackets, and
     the exemption key stripped whitespace and brackets separately.
     The moment a third rule was added to one of them — a standalone
     dash, which the item treatment removes on purpose — the two
     disagreed, and every removal that had been properly DECLARED
     stopped matching the block it was declared for. Nine pages
     reported losing text they had not lost.
     A dash between two spaces is a separator, not a word: this runs
     BEFORE whitespace is stripped, so it can only match a dash that
     stands alone. A hyphen inside K-12 and an unspaced em dash in
     prose both still have to survive. */
  const normKey = t => t
    /* A DASH AT THE EDGE OF A BLOCK IS PUNCTUATION TOO. The rule
       below needs air on both sides, which is right in the middle of
       a line — "K-12" must survive — but a block that opens or closes
       with a dash is carrying a separator whose other half is in the
       neighbouring block. Whether the whitespace in front of it
       survives a transform is then the difference between two keys
       for the same words, and a properly declared block reads as
       lost. Stripped at both edges before anything else. */
    .replace(/^[\s]*[-–—]+[\s]*/, ' ').replace(/[\s]*[-–—]+[\s]*$/, ' ')
    .replace(/\s+[-–—]+\s+/g, ' ')
    /* U+FFFC is the placeholder Word leaves where an embedded object
       used to be. The cleanup removes it and the cleanup's own check
       knows that is not a loss; this one has to know it too, or the
       block it sat in reads as a different block. */
    .replace(/\uFFFC/g, '')
    /* A FILE SIZE IS DELETED OUTRIGHT, not moved — see the rule of
       the same name in interior-cleanup.js. Both sides of this
       comparison have to forget it, or every block that carried a
       label like "(PDF, 82KB)" reads as a block that lost content
       and the page is refused whole. */
    .replace(new RegExp('(?:\\s|&nbsp;)*[,:;|·–—-]?(?:\\s|&nbsp;)*' + SIZE_RE, 'gi'), '')
    /* And a bracket with nothing alphanumeric left in it. */
    .replace(/\([^A-Za-z0-9()]*\)/g, '')
    /* A format label in parentheses becomes a chip and loses them —
       named formats only, because a blanket strip would hide far too
       much: parentheses carry dates, asides and phone numbers. */
    .replace(new RegExp('\\(\\s*(' + FORMAT_ALT + ')\\s*\\)', 'gi'), '$1')
    /* A CHIP IS SET IN ONE CASE — "pdf" and "PDF" become the same
       chip — so a format word is compared without its capitals. */
    .replace(new RegExp('(?:' + FORMAT_ALT + ')(?![a-z])', 'gi'), (m) => canonKey(m))
    .replace(/\s/g, '').replace(/[[\]]/g, '')
    /* THE LAST TWO NORMALISATIONS LIVE HERE TOO, and leaving them
       outside was the same fault this function was created to fix.
       blocks() lowercased addresses and expanded MDOE on its own
       afterwards; key() did not — so a removal declared on a
       paragraph containing HigherEd.DOE@maine.gov keyed with the
       capitals intact, the block it was declared for keyed without
       them, and a paragraph that had been properly declared read as
       lost on /learning/highered/forprofit.
       Every rule the two sides need is inside this one function now,
       so they cannot drift apart again. */
    .replace(/MDOE/g, 'MaineDOE')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, e => e.toLowerCase())
    /* CASE DOES NOT COUNT, AND THIS GOES LAST.
       A description that used to run on from the link after a dash
       now opens its own line and takes a capital — "a framework"
       becomes "A framework". One character, in the middle of a
       block, and it changed that block's key: 74 pages reported the
       original as lost over it.
       What this check is for is whether every word the author wrote
       is still on the page, and lowering both sides keeps that
       intact — a missing word, a dropped sentence, a truncated list
       all still fail.
       LAST IN THE CHAIN, because two steps above it match on case:
       MDOE and the format canon. Placed before them it silently
       switched both off, which put nine pages into "content lost"
       for reasons that had nothing to do with case. */
    .toLowerCase();
  /* A CHIP THIS TOOL INVENTED IS NOT TEXT THE PAGE GAINED.
     filechip reads "PDF" off a file name and tags the link with it —
     a word that was genuinely not on the page before, which is
     exactly what this check exists to catch. It marks its own chips
     data-src="file" and they come back out here, so the comparison
     still sees every word a person wrote and still refuses a page
     that loses one. A chip made from text the author typed carries
     no marker and is compared normally. */
  const unchip = x => x.replace(/<span class="doe-chip" data-src="file">[^<]*<\/span>/g, '');
  const blocks = x => textOf(unchip(x).replace(/<!--[\s\S]*?--!?>/g, ' ').replace(BLOCK, '\u0001'))
    .split('\u0001')
    .map(t => normKey(t))
    .filter(t => t.length > 1)
    .sort();
  /* Normalised through the SAME function the blocks are, or an
     ampersand written &amp; in the markup and decoded to & in the
     block list fails to match itself — which left two pages reporting
     a loss that was actually an exempt removal. */
  const key = t => normKey(textOf(t));
  const exempt = new Set(removedOnPurpose.map(key));
  /* Renames and edits replace text with different text, so the block
     that was there is gone and a new one has appeared. Both sides
     need exempting or every hand edit reads as a loss. */
  const added = new Set([
    ...Object.values(opts.headings || {}),
    ...Object.values(opts.replace || {}),
    ...Object.values(opts.notes || {}),
    /* THE BANNER'S BUTTON LABELS, which are written in overrides.json
       and are the only text in a .doe-cta that did not come off the
       page. The mask used to strip every .doe-cta instead — and once
       a heading that was only a link became a button, that mask ate
       the heading's own words and reported them as lost on 19 pages. */
    ...[].concat(opts.cta || []).map(c => c.label),
    /* A figure's button label is written in overrides.json too, for
       the same reason and with the same consequence if it is left
       out. */
    ...[].concat(opts.figure || []).map(f => f.button).filter(Boolean),
    ...(deckJoined ? [deckJoined] : []),
    ...joined,
  ].map(key));
  const before = blocks(node.body).filter(t => !exempt.has(t));
  const after = blocks(html.replace(ADDED, ' ')).filter(t => !added.has(t));
  const missing = [];
  {
    const pool = new Map();
    after.forEach(t => pool.set(t, (pool.get(t) || 0) + 1));
    for (const t of before) {
      const c = pool.get(t) || 0;
      if (c) pool.set(t, c - 1); else missing.push(t);
    }
  }
  const safe = missing.length === 0;
  if (!safe) {
    notes.push(`CONTENT LOST: ${missing.length} block(s) of text are missing from the proposal. `
      + `First: "${missing[0].slice(0, 90)}…". Do not apply.`);
  }

  return { html, notes, decisions, mechanical, safe, deck, toc: !!toc, eyebrow };
}

module.exports = { propose, componentSpans };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const C = path.join(__dirname, 'cache');
  const index = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
  const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
  let ok = 0, blocked = 0, unsafe = [];
  for (const n of index) {
    if (!n.body.trim()) continue;
    const a = pages.find(p => p.alias === n.alias);
    const r = propose(n, a, index);
    if (r.blocked) { blocked++; continue; }
    if (!r.safe) unsafe.push(n.alias); else ok++;
  }
  console.log(`proposed for ${ok} pages`);
  console.log(`  blocked by the cleanup check : ${blocked}`);
  console.log(`  proposal changed text        : ${unsafe.length}`);
  unsafe.slice(0, 10).forEach(u => console.log('    ' + u));
}
