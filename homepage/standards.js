#!/usr/bin/env node
/* Maine DOE — how far each page is from the house pattern
 * Version: 2026-09-20-a  ·  Last edited: 2026-09-20
 *
 *   node standards.js              every component, conforming vs not
 *   node standards.js <component>  the pages that deviate
 *   node standards.js --pages      the worst pages, ranked
 *
 * WHY THIS IS DIFFERENT FROM sweep.js.
 * sweep.js looks for faults I can name in advance — an empty
 * paragraph, a heading at the wrong level. This looks for
 * INCONSISTENCY, which is the thing Matt keeps finding by eye: the
 * same kind of information presented three different ways depending
 * on which page you land on.
 *
 * AND IT TAKES THE STANDARD FROM THE SITE, NOT FROM ME. Six months of
 * hand cleanup has already established what the house pattern is —
 * a card whose title is a card-header, a table that is
 * table-bordered with navy headers, a callout that is a dc-note. So
 * for each component this counts how the site actually writes it, and
 * calls the commonest form the standard. A rule nobody follows is not
 * a standard, and a pattern 300 pages already use does not need me to
 * justify it.
 *
 * It only reports. Nothing here changes a page.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { propose } = require('./propose.js');

const C = path.join(__dirname, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const overrides = fs.existsSync(path.join(C, 'overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8')) : {};
const byAlias = Object.fromEntries(pages.map(p => [p.alias, p]));

/* Each component lists the FORMS it is written in. Every occurrence is
   attributed to exactly one form — first match wins, so the list is
   ordered from most specific to least. */
const COMPONENTS = {
  'card title': {
    /* class="… card …" AS A WHOLE TOKEN. Written \bcard\b it also
       matched card-header, card-body, card-img-top and card-title —
       because a hyphen is a word boundary — so every inner div of
       every card counted as another card, and the report said 3,708
       cards of which 2,286 had no title. */
    find: /<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>[\s\S]{0,700}/gi,
    forms: [
      ['card-header, white on navy', s => /class="[^"]*card-header[^"]*text-white[^"]*bg-primary/i.test(s)],
      ['card-header, some other colour', s => /class="[^"]*card-header/i.test(s)],
      ['a heading with .card-title', s => /class="[^"]*card-title/i.test(s)],
      ['no title at all', () => true],
    ],
  },
  'table': {
    find: /<table\b[^>]*>/gi,
    forms: [
      ['table table-bordered', s => /class="[^"]*\btable\b[^"]*\btable-bordered\b/i.test(s)],
      ['some other .table variant', s => /class="[^"]*\btable\b/i.test(s)],
      ['no class at all', () => true],
    ],
  },
  'call to action': {
    find: /<a\b[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>/gi,
    forms: [
      ['btn-info', s => /\bbtn-info\b/.test(s)],
      ['btn-primary', s => /\bbtn-primary\b/.test(s)],
      ['an outline or link button', s => /\bbtn-(outline|link)/.test(s)],
      ['btn with no variant', () => true],
    ],
  },
  'callout': {
    find: /<div[^>]*class="[^"]*\b(dc-note|jumbotron|alert|well|bg-light)\b[^"]*"[^>]*>/gi,
    forms: [
      ['dc-note', s => /\bdc-note\b/.test(s)],
      ['jumbotron', s => /\bjumbotron\b/.test(s)],
      ['a Bootstrap alert or well', () => true],
    ],
  },
  'video': {
    find: /<iframe\b[^>]*(?:youtube|vimeo)[^>]*>/gi,
    forms: [
      ['inside .doe-video or .video-center', (s, whole, at) =>
        /class="[^"]*(doe-video|video-center)/i.test(whole.slice(Math.max(0, at - 220), at))],
      ['a bare iframe', () => true],
    ],
  },
  'link that goes somewhere': {
    find: /<li\b[^>]*>\s*<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<\/a>\s*<\/li>/gi,
    forms: [
      ['.doe-action', s => /class="[^"]*\bdoe-action\b/.test(s)],
      ['a plain list item', () => true],
    ],
  },
  'section header': {
    find: /<h2\b[^>]*>/gi,
    forms: [
      ['inside .blockhead', (s, whole, at) =>
        /<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*$/i.test(whole.slice(Math.max(0, at - 160), at))],
      ['a bare h2', () => true],
    ],
  },
  'contact details': {
    /* Only the addresses OUTSIDE a contact block. Counting every
       mailto meant the ones inside a properly built block were
       reported as loose, and the component looked 29% conformant when
       most of those addresses were exactly where they belong. */
    find: /<a[^>]*href="mailto:[^"]*"[^>]*>/gi,
    forms: [
      ['inside a .contact-cube', (s, whole, at) => {
        const spans = [...whole.matchAll(/<div[^>]*class="(?:[^"]*\s)?contact-cube(?:\s[^"]*)?"[^>]*>/gi)];
        return spans.some(sp => {
          let depth = 1, i = sp.index + sp[0].length;
          const tag = /<div\b[^>]*>|<\/div>/gi; tag.lastIndex = i; let t;
          while (depth > 0 && (t = tag.exec(whole))) { depth += t[0][1] === '/' ? -1 : 1; i = t.index + t[0].length; }
          return at >= sp.index && at < i;
        });
      }],
      ['a loose mailto link', () => true],
    ],
  },
};

const tally = {};
const deviating = {};
for (const k of Object.keys(COMPONENTS)) { tally[k] = {}; deviating[k] = {}; }
const pageScore = {};
let total = 0;

for (const n of idx) {
  if (!n.body.trim()) continue;
  const a = byAlias[n.alias];
  if (!a) continue;
  let r;
  try { r = propose(n, a, idx, overrides[n.alias] || {}); } catch (e) { continue; }
  total++;
  const html = r.html;
  for (const [name, spec] of Object.entries(COMPONENTS)) {
    for (const m of html.matchAll(spec.find)) {
      const form = (spec.forms.find(([, test]) => test(m[0], html, m.index)) || ['unclassified'])[0];
      tally[name][form] = (tally[name][form] || 0) + 1;
      if (form !== spec.forms[0][0]) {
        (deviating[name][n.alias] = deviating[name][n.alias] || { form, n: 0 }).n++;
        pageScore[n.alias] = (pageScore[n.alias] || 0) + 1;
      }
    }
  }
}

const arg = process.argv[2];

if (arg === '--pages') {
  const worst = Object.entries(pageScore).sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log(`the pages furthest from the house pattern (of ${total})\n`);
  for (const [alias, n] of worst) console.log('  ' + String(n).padStart(4) + '  ' + alias);
  process.exit(0);
}

if (arg) {
  const name = Object.keys(COMPONENTS).find(k => k.includes(arg));
  if (!name) { console.log('components:\n  ' + Object.keys(COMPONENTS).join('\n  ')); process.exit(1); }
  const rows = Object.entries(deviating[name]).sort((a, b) => b[1].n - a[1].n);
  console.log(`${name} — ${rows.length} pages write it another way\n`);
  for (const [alias, d] of rows.slice(0, 50))
    console.log('  ' + String(d.n).padStart(3) + '  ' + alias.padEnd(52) + d.form);
  process.exit(0);
}

console.log(`${total} pages\n`);
for (const [name, spec] of Object.entries(COMPONENTS)) {
  const forms = tally[name];
  const sum = Object.values(forms).reduce((a, b) => a + b, 0);
  if (!sum) continue;
  const house = spec.forms[0][0];
  const ok = forms[house] || 0;
  console.log(`${name.toUpperCase()}   ${Math.round(ok / sum * 100)}% on the house pattern`);
  for (const [form, n] of Object.entries(forms).sort((a, b) => b[1] - a[1]))
    console.log('   ' + String(n).padStart(5) + '  ' + (form === house ? '✓ ' : '  ') + form);
  console.log('');
}
console.log('  node standards.js <component>   the pages that deviate');
console.log('  node standards.js --pages       the worst pages, ranked');
