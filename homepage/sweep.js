#!/usr/bin/env node
/* Maine DOE — what is still wrong with the proposals
 * Version: 2026-09-20-a  ·  Last edited: 2026-09-20
 *
 *   node sweep.js            every fault, counted, worst class first
 *   node sweep.js <class>    the pages in one class
 *
 * WHY THIS EXISTS. The faults in the proposals were being found by
 * Matt, one page at a time, by looking at them — a navy section header
 * nested inside the navy contact block on /Testing_Accountability/
 * MECAS/materials/natint, a heading that is really a link to a PDF, a
 * photograph left hanging between two sections, "MDOE" where the brand
 * guide says Maine DOE. Each one took a message to report and each one
 * was an instance of a class affecting dozens of pages.
 *
 * This looks for the CLASS across all 832 at once. It reads the
 * proposed HTML, not the live page, so it measures what we are about
 * to produce rather than what is already there.
 *
 * It only reports. Nothing here changes a page.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { propose, componentSpans } = require('./propose.js');

const C = path.join(__dirname, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const overrides = fs.existsSync(path.join(C, 'overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8')) : {};
const byAlias = Object.fromEntries(pages.map(p => [p.alias, p]));

const strip = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* Each check returns a list of findings for one page. A finding is a
   short string — the thing that is wrong, quoted, so the count and a
   sample are enough to judge whether the class is worth fixing. */
const CHECKS = {

  'section-header-inside-a-component': h => {
    /* A .blockhead is the page's own section rule — a navy slab the
       full width of the column. Inside a contact block, a card or an
       accordion panel it is a navy slab inside another one.
       USES THE SAME BALANCED SCAN propose.js uses. Written here as a
       lazy regex first, it reported 196 pages that had no blockhead
       at all: with one card on the page the span ran to the end of
       the document and swallowed every section header after it. */
    const spans = componentSpans(h);
    return [...h.matchAll(/<div[^>]*class="[^"]*\bblockhead\b/gi)]
      .filter(m => spans.some(([a, b]) => m.index > a && m.index < b))
      .map(() => 'inside a component');
  },

  'heading-that-is-only-a-link': h =>
    [...h.matchAll(/<h([1-6])\b[^>]*>\s*(<a\b[^>]*>[\s\S]*?<\/a>)\s*<\/h\1>/gi)]
      .filter(m => strip(m[0]) === strip(m[2]))
      .map(m => strip(m[2]).slice(0, 56)),

  'image-alone-between-sections': h => {
    /* An <img> that is its own block, outside a card, a table, a
       figure and an accordion panel, with no sizing class. It renders
       at whatever pixel size it was uploaded at, in the middle of the
       page, aligned with nothing. */
    const masked = h.replace(/<(table|figure|dd|dl)\b[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length))
                    .replace(/<div[^>]*class="[^"]*card[^"]*"[\s\S]*?<\/div>/gi, m => ' '.repeat(m.length));
    return [...masked.matchAll(/<img[^>]*>/gi)]
      .filter(m => !/class="[^"]*(doe-img|card-img|doe-art)/i.test(m[0]))
      .map(m => (m[0].match(/alt="([^"]*)"/i) || [])[1] || '(no alt)');
  },

  'contact-block-not-on-the-pattern': h => {
    const out = [];
    for (const m of h.matchAll(/<div[^>]*class="[^"]*contact-cube[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
      const inner = m[1];
      /* The pattern is a heading then paragraphs. Bare text and <br>
         sitting straight inside the div is what the old editor left. */
      const bare = inner.replace(/<(p|h[1-6]|div|ul|ol|table|hr)\b[\s\S]*?<\/\1>/gi, '')
                        .replace(/<(br|hr)\s*\/?>/gi, '');
      if (strip(bare).length > 20) out.push('loose text not in a paragraph');
    }
    return out;
  },

  'mdoe-instead-of-maine-doe': h =>
    (strip(h).match(/\bMDOE\b/g) || []).map(() => 'MDOE'),

  'drupal-attribute-left-on-a-link': h =>
    (h.match(/\s(?:filename|data-entity-type|data-entity-uuid|data-entity-substitution)="/g) || [])
      .map(a => a.trim().replace('="', '')),

  'broken-mailto': h =>
    [...h.matchAll(/href="mailto:\s+[^"]*"/gi)].map(m => m[0].slice(0, 48)),

  'empty-heading': h =>
    /* A heading holding only an image is not empty — it has an alt.
       Counting those kept 12 pages on the list that were right. */
    [...h.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .filter(m => !strip(m[2]) && !/<img/i.test(m[2])).map(() => '(empty)'),

  'link-text-that-says-nothing': h =>
    [...h.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => strip(m[1]))
      .filter(t => /^(click here|here|read more|more|link|this|download)$/i.test(t)),

  'bullet-holding-only-a-sublist': h =>
    /* <li><ul>…</ul></li> — a bullet with nothing beside it, then the
       sublist indented under it. The nested list belongs inside the
       PREVIOUS item, which is what the author meant. */
    [...h.matchAll(/<li\b[^>]*>\s*(<(?:ul|ol)\b[\s\S]*?<\/(?:ul|ol)>)\s*<\/li>/gi)]
      .map(() => 'empty bullet before a sublist'),

  'inline-layout-style-on-text': h =>
    [...h.matchAll(/<(p|li|span|div|h[1-6]|td|th|a|strong|em)\b[^>]*style="([^"]*)"/gi)]
      .map(m => (m[2].match(/\b(margin[a-z-]*|padding[a-z-]*|font-family|font-size|line-height|text-indent|letter-spacing)\s*:/gi) || []))
      .filter(x => x.length).flat(),

  'empty-list-item': h =>
    [...h.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .filter(m => !strip(m[1]) && !/<(img|ul|ol|iframe)/i.test(m[1]))
      .map(() => '(empty)'),

  'empty-paragraph': h =>
    [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .filter(m => !strip(m[1]) && !/<(img|iframe|br)/i.test(m[1]))
      .map(() => '(empty)'),

  'list-not-inside-a-list-item': h =>
    /* <ul> as a direct child of another <ul> rather than of an <li>.
       Invalid, and browsers guess at the indent. */
    [...h.matchAll(/<\/li>\s*<(ul|ol)\b/gi)].map(() => 'sublist adrift'),

  'font-tag': h => (h.match(/<font\b/gi) || []).map(() => '<font>'),

  'word-paste-class': h =>
    (h.match(/class="[^"]*\bMso[A-Za-z]+/g) || []).map(() => 'MsoNormal'),

  'the-same-heading-twice-on-one-page': h => {
    /* /learning/earlylearning/first10/pilot has "Round One Schools &
       Community" twice, and its own text says a second round was
       awarded — so one of them is meant to say Round Two. A contents
       list cannot link to two sections with the same name either. */
    const seen = {}, out = [];
    for (const m of h.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const t = strip(m[2]).toLowerCase();
      if (!t) continue;
      if (seen[t]) out.push(strip(m[2]).slice(0, 44));
      seen[t] = 1;
    }
    return out;
  },

  'video-in-a-card-outside-the-top-slot': h =>
    /* A video in a card's TOP slot is fine and styled — the gap that
       used to sit under it is closed in CSS. What is still wrong is a
       video buried in the card BODY, where it competes with the text
       instead of heading it. */
    [...h.matchAll(/<div[^>]*class="[^"]*\bcard-body\b[^"]*"[^>]*>[\s\S]*?<iframe/gi)]
      .map(() => 'video inside the card body'),

  'contact-details-inside-a-card': h =>
    /* Names, phone numbers and addresses set as list items in a card
       body, where the contact block component would set them. */
    [...h.matchAll(/<div[^>]*class="[^"]*\bcard-body\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
      .filter(m => /\bContact\b/.test(strip(m[1])) && /mailto:|\(\d{3}\)|\d{3}-\d{4}/.test(m[1]))
      .map(() => 'contact inside a card'),

  'card-row-holding-one-card': h =>
    [...h.matchAll(/<div[^>]*class="[^"]*\brow\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\brow\b|$)/gi)]
      .filter(m => (m[1].match(/class="[^"]*\bcol-/g) || []).length === 1
                && /class="[^"]*\bcard\b/.test(m[1]))
      .map(() => 'a grid row with one card in it'),

  'card-titles-at-a-random-level': h => {
    /* h5.card-title is the Bootstrap default and it is what authors
       copy. On a page whose sections are h2 it announces a card as a
       fifth-level heading of nothing. */
    /* h3 is the level they are put on, so only the ones that are
       still something else are a fault. Written without that test the
       check counted the pattern rather than the problem and reported
       446 faults after all 446 had been fixed. */
    const out = [];
    for (const m of h.matchAll(/<h([1-6])\b[^>]*class="[^"]*card-title/gi))
      if (m[1] !== '3') out.push('h' + m[1]);
    return out;
  },

  'lopsided-card-row': h => {
    /* Two cards side by side where one holds four times the words of
       the other. Cards in a row are equal height by design, so the
       short one is stretched into a box that is mostly empty — the
       "GIANT card with a ton of extra space" on
       /schoolsupports/highmobility/titleIpartC, where a 233-character
       card sits beside a 944-character one in equal halves.
       The fix is a layout decision, not a markup one: give the short
       card a narrower column, pair it with something of its own
       weight, or fold it into the card beside it. */
    const out = [];
    const cards = (src) => {
      const found = [];
      for (const m of src.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi)) {
        let d = 1, i = m.index + m[0].length;
        const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
        while (d > 0 && (x = t.exec(src))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
        found.push(strip(src.slice(m.index, i)).length);
      }
      return found;
    };
    for (const row of h.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"|$)/gi)) {
      const lens = cards(row[1]).filter(n => n > 40);
      if (lens.length < 2) continue;
      const lo = Math.min(...lens), hi = Math.max(...lens);
      if (hi >= lo * 4) out.push(lo + ' chars beside ' + hi);
    }
    return out;
  },

  'list-item-whose-link-is-gone': h =>
    /* "<li>. This rule chapter is specific to the education of
       children with disabilities in Maine" on /cds/laws — the link
       was deleted and the punctuation after it left behind, so the
       item names a document the reader cannot reach. Not repairable
       here: the destination is not in the markup any more. */
    [...h.matchAll(/<li\b[^>]*>((?:(?!<\/li>)[\s\S])*?)<\/li>/gi)]
      .filter(m => /^[.,;:)]/.test(strip(m[1])))
      .map(m => strip(m[1]).slice(0, 56)),

  'heading-in-all-capitals': h =>
    [...h.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .map(m => strip(m[2]))
      .filter(t => t.length > 6 && t === t.toUpperCase() && /[A-Z]{4}/.test(t))
      .map(t => t.slice(0, 48)),
};

/* The panel imports these so a page's findings appear where the page
   is being reviewed, rather than only in a terminal Matt cannot see.
   require.main guards the report below: importing sweep.js must not
   run an 832-page scan as a side effect. */
module.exports = { CHECKS, strip };
if (require.main !== module) return;

const results = {};
for (const k of Object.keys(CHECKS)) results[k] = [];
let total = 0;

for (const n of idx) {
  if (!n.body.trim()) continue;
  const a = byAlias[n.alias];
  if (!a) continue;
  let r;
  try { r = propose(n, a, idx, overrides[n.alias] || {}); } catch (e) { continue; }
  total++;
  for (const [name, fn] of Object.entries(CHECKS)) {
    let hits = [];
    try { hits = fn(r.html) || []; } catch (e) { continue; }
    if (hits.length) results[name].push({ alias: n.alias, hits });
  }
}

const want = process.argv[2];
const ranked = Object.entries(results)
  .map(([name, rows]) => ({ name, pages: rows.length, count: rows.reduce((s, r) => s + r.hits.length, 0), rows }))
  .filter(x => x.pages)
  .sort((a, b) => b.pages - a.pages);

if (want) {
  const one = ranked.find(x => x.name === want || x.name.includes(want));
  if (!one) { console.log('no such class. names:\n  ' + ranked.map(x => x.name).join('\n  ')); process.exit(1); }
  console.log(`${one.name} — ${one.count} on ${one.pages} pages\n`);
  for (const row of one.rows.slice(0, 60))
    console.log('  ' + row.alias.padEnd(52) + row.hits.slice(0, 2).join(' | ').slice(0, 70));
  if (one.rows.length > 60) console.log(`  … and ${one.rows.length - 60} more pages`);
} else {
  console.log(`swept ${total} proposals\n`);
  console.log('  PAGES  COUNT  CLASS');
  for (const x of ranked)
    console.log('  ' + String(x.pages).padStart(5) + String(x.count).padStart(7) + '  ' + x.name);
  console.log('\n  node sweep.js <class>   to see the pages');
}
