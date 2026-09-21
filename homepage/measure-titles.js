#!/usr/bin/env node
/* Maine DOE — how many lines each page title takes
 * Version: 2026-09-20-b  ·  Last edited: 2026-09-20
 *
 *   node measure-titles.js        (needs the review server on 8791)
 *   → cache/title-lines.json      { "/alias": 1 }
 *
 * WHY THIS EXISTS. The title band is a fixed height, because the
 * banner below it is pulled up by a negative margin equal to that
 * height and CSS cannot measure a sibling. A fixed height has to fit
 * the longest title, so every short title sat in a box built for a
 * long one — 65px of empty navy above a one-line title against 28px
 * above a two-line one, and raising the box only moved the problem.
 * CSS cannot count lines. So they are counted here and propose.js
 * marks the wrapping pages .doe-hero--tall.
 *
 * THE PROBE HAS TO BE THE REAL PAGE, WHICH IS THE WHOLE DIFFICULTY.
 * The first version of this file linked only our own stylesheet, so
 * League Spartan never loaded and every title was measured in the
 * fallback face — which is narrower, so nothing wrapped and all 830
 * pages were recorded as one line. The titles that really do wrap
 * then overflowed their band by 20px.
 * Three things therefore have to match the real frames exactly:
 *   · the production stylesheets, for the font
 *   · a .doe-hero in the content block, because the h1's max-width is
 *     lifted by #maincontent2:has(.doe-hero)
 *   · the column width, which is the hero's own measured width
 * If any of them is missing the answer is wrong in the direction that
 * looks fine — fewer wraps than there are.
 *
 * Re-run when the title font, the column width or the titles change.
 * A page missing from the file is treated as one line.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(require('path').join(process.env.HOME, 'Documents/Claude/node_modules/playwright'));

const { propose } = require('./propose.js');

const C = path.join(__dirname, 'cache');
const R = path.join(__dirname, 'review');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'))
  .filter(n => n.body.trim());

/* The same production stylesheets the review frames use, read from a
   live page so the list cannot drift from what the site serves. */
let SHEETS = [{ href: 'https://www.maine.gov/awt/templateV3/css/styles2.css', media: 'all' }];
try {
  const live = require('child_process').execFileSync('curl',
    ['-s', '-A', 'Mozilla/5.0', '--max-time', '20',
     'https://www.maine.gov/doe/learning/multilinguallearner/services'],
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const found = [...live.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m => m[0])
    .map(tag => ({
      href: (tag.match(/href="([^"]+)"/) || [])[1],
      media: (tag.match(/media="([^"]+)"/) || [])[1] || 'all',
    }))
    .filter(x => x.href)
    .map(x => ({ ...x, href: x.href.replace(/&amp;/g, '&') }))
    .map(x => ({ ...x, href: x.href.startsWith('http') ? x.href : 'https://www.maine.gov' + x.href }))
    .filter(x => !/asset_injector/.test(x.href));
  if (found.length >= 4) SHEETS = found;
  console.log(`  ${SHEETS.length} production stylesheets linked into the probe`);
} catch (e) {
  console.log('  could not read the live stylesheet list — the font may be wrong, check the counts');
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const links = SHEETS.map(s => `<link rel="stylesheet" media="${s.media}" href="${s.href}">`).join('')
  + '<link rel="stylesheet" href="/interior-css-injector.deploy.css">';

/* EACH PAGE'S OWN HERO, not a generic one. The h1's max-width is
   calc(100% - 140px) when the banner carries a contact chip and the
   full width when it does not — 140px is the chip. A generic probe
   hero had no chip, so every title was measured 140px wider than it
   really is and 27 wrapping titles came back as one line.
   Reading the real hero costs a propose() per page and removes the
   guess. It is not circular: propose() reads this file only to decide
   the .doe-hero--tall class, which does not affect the h1's width. */
const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const overrides = fs.existsSync(path.join(C, 'overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8')) : {};
const byAlias = Object.fromEntries(pages.map(p => [p.alias, p]));
const heroOf = n => {
  const a = byAlias[n.alias];
  if (!a) return '<div class="doe-hero"><p class="doe-lead">x</p></div>';
  let h = '';
  try { h = propose(n, a, idx, overrides[n.alias] || {}).html; } catch (e) { h = ''; }
  const m = h.match(/<div class="doe-hero[\s\S]*?<\/div>/);
  /* Only the parts that can reach the h1 — the chip and the eyebrow.
     The contents list and the deck cannot change its width. */
  const chip = /doe-contact-link/.test(h) ? '<p class="doe-contact-link"><a href="#contact">Contact</a></p>' : '';
  const eyebrow = /doe-eyebrow/.test(h) ? '<p class="doe-eyebrow">Section</p>' : '';
  return `<div class="doe-hero">${eyebrow}${chip}<p class="doe-lead">x</p></div>`;
};
const probe = path.join(R, '_titles.html');
fs.writeFileSync(probe,
  '<!doctype html><html><head>' + links +
  '<style>body{margin:0;background:#f2ece7}#container{width:100%}</style></head>' +
  '<body class="page-node-type-multi-column-page"><div id="container"><div id="content" class="clearfix">' +
  idx.map((n, i) =>
    `<div id="maincontent2" class="article" data-i="${i}">` +
    `<div id="block-doe-pagetitle"><h1>${esc(n.title)}</h1></div>` +
    `<div id="block-doe-content">${heroOf(n)}</div>` +
    `</div>`).join('') +
  '</div></div></body></html>');

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const res = await pg.goto('http://localhost:8791/review/_titles.html', { waitUntil: 'networkidle' });
  if (!res || !res.ok()) {
    console.error('Could not load the probe. Is the review server running on 8791?');
    process.exit(2);
  }
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(1200);

  const out = await pg.evaluate(() => {
    const face = getComputedStyle(document.querySelector('#block-doe-pagetitle h1')).fontFamily;
    const lines = [...document.querySelectorAll('#block-doe-pagetitle h1')].map(h =>
      Math.max(1, Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight))));
    const width = Math.round(document.querySelector('#block-doe-pagetitle h1').parentElement.getBoundingClientRect().width);
    return { face, lines, width };
  });
  await b.close();
  fs.unlinkSync(probe);

  if (out.lines.length !== idx.length) {
    console.error(`measured ${out.lines.length} of ${idx.length} titles — not writing`);
    process.exit(3);
  }
  /* THE FONT IS THE CHECK. If the face is a system fallback the whole
     measurement is wrong and silently plausible, so say so loudly. */
  console.log(`  title face: ${out.face}`);
  console.log(`  title block width: ${out.width}px`);
  if (!/spartan/i.test(out.face)) {
    console.error('  REFUSING TO WRITE: the title font is not League Spartan, so every');
    console.error('  width is wrong. Check the stylesheet list above.');
    process.exit(4);
  }

  const map = {};
  idx.forEach((n, i) => { map[n.alias] = out.lines[i]; });
  fs.writeFileSync(path.join(C, 'title-lines.json'), JSON.stringify(map));
  const n = Object.values(map);
  console.log(`cache/title-lines.json — ${n.length} titles`);
  console.log(`  one line   ${n.filter(x => x <= 1).length}`);
  console.log(`  two lines  ${n.filter(x => x === 2).length}`);
  console.log(`  three plus ${n.filter(x => x > 2).length}`);
})();
