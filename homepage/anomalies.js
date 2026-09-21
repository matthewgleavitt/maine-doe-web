#!/usr/bin/env node
/* Maine DOE interior pages — the anomaly sweep
 * Version: 2026-09-21-b  ·  Last edited: 2026-09-21
 *
 *   node anomalies.js
 *
 * WHAT THIS IS FOR, AND WHY IT EXISTS.
 * Matt was finding something wrong on almost every page he opened,
 * and every one of them was reported, diagnosed and fixed one at a
 * time. That is the wrong shape of work: the faults are not page
 * faults, they are CLASSES of fault that happen to surface on a page.
 *
 * So this counts the classes across all 832 proposals at once. It
 * changes nothing. It answers two questions: what is still wrong, and
 * is it the kind of thing a rule can fix or the kind that needs a
 * person to decide.
 *
 * Run it after any change to interior-cleanup.js or propose.js. A
 * number that goes UP is the signal worth chasing — it means a new
 * rule created work rather than removing it, which has happened here
 * more than once.
 *
 * THE COUNTS ARE OF THE PROPOSAL, not the live page, so they measure
 * what would be pasted into Drupal.
 */
const fs = require('fs'), path = require('path');
const H = '/Users/mattmini/Documents/GitHub/maine-doe-web/homepage';
const { propose } = require(H + '/propose.js');
const C = path.join(H, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const by = Object.fromEntries(pages.map(p => [p.alias, p]));
const ov = JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8'));
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const CHECKS = {
  'inline background colour on text': h => (h.match(/style="[^"]*background(?:-color)?\s*:/gi) || []).length,
  'inline font-size / font-family left': h => (h.match(/style="[^"]*font-(?:size|family)\s*:/gi) || []).length,
  'inline colour on text': h => (h.match(/style="[^"]*(?:^|;)\s*color\s*:/gi) || []).length,
  'bare <span> still nested': h => (h.match(/<span>/g) || []).length,
  'empty paragraph': h => (h.match(/<p[^>]*>\s*(?:&nbsp;|\s)*<\/p>/gi) || []).length,
  'two <br> in a row': h => (h.match(/<br\s*\/?>\s*<br\s*\/?>/gi) || []).length,
  'heading that is only bold text': h => (h.match(/<h[1-6][^>]*>\s*<strong>[\s\S]{0,90}?<\/strong>\s*<\/h[1-6]>/gi) || []).length,
  'link text that is a raw URL': h => (h.match(/>\s*https?:\/\/[^<\s]{8,}\s*</gi) || []).length,
  'link text saying nothing': h => (h.match(/<a\b[^>]*>\s*(?:click here|here|read more|more|link|this)\s*<\/a>/gi) || []).length,
  'heading in ALL CAPS': h => [...h.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
      .filter(m => { const t = strip(m[1]); return t.length > 6 && t === t.toUpperCase() && /[A-Z]{4}/.test(t); }).length,
  'table with no header row': h => [...h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
      .filter(m => !/<th[\s>]/i.test(m[1]) && (m[1].match(/<tr[\s>]/gi) || []).length > 1).length,
  'image with no alt text': h => (h.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length,
  'image with a filename as its alt': h => [...h.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)]
      .filter(m => /\.(png|jpe?g|gif|webp)$|^(image|img|picture|photo|card image|untitled)/i.test(m[1].trim())).length,
  'target=_blank left on a link': h => (h.match(/<a\b[^>]*target="_blank"/gi) || []).length,
  'inline width/height on an image': h => (h.match(/<img\b[^>]*style="[^"]*(?:width|height)\s*:/gi) || []).length,
  'nested table': h => [...h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].filter(m => /<table\b/i.test(m[1])).length,
  'card with no title': h => [...h.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>([\s\S]{0,600})/gi)]
      .filter(m => !/card-header|card-title/i.test(m[1])).length,
  'list of one item': h => [...h.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .filter(m => (m[2].match(/<li[\s>]/gi) || []).length === 1).length,
};

/* ── settled, and the sweep should stop asking ───────────────────
   A finding that has been looked at and kept is not a finding. The
   colour blocks on the achievement pages are indicators — they carry
   meaning, they are used consistently, and Matt confirmed them — so
   re-listing 56 of them every run buries the things nobody has
   looked at yet. Recorded here rather than deleted from the check,
   because the check is still right about every other page.
   Add a page here only after a person has actually decided. */
const SETTLED = {
  'inline background colour on text': [
    '/assessment/achievement/reading',   // scoring-band indicators, confirmed 2026-09-21
    '/assessment/achievement/math',      // scoring-band indicators, confirmed 2026-09-21
  ],
  'inline colour on text': [
    '/assessment/achievement/math',      // same blocks, the ink that sits on them
  ],
};

const tot = {}, pageCount = {}, worst = {};
for (const k of Object.keys(CHECKS)) { tot[k] = 0; pageCount[k] = new Set(); worst[k] = []; }
let n = 0, settled = 0;
for (const x of idx) {
  if (!x.body.trim()) continue;
  const a = by[x.alias]; if (!a) continue;
  let r; try { r = propose(x, a, idx, ov[x.alias] || {}); } catch (e) { continue; }
  n++;
  for (const [name, fn] of Object.entries(CHECKS)) {
    if ((SETTLED[name] || []).includes(x.alias)) { settled++; continue; }
    let c = 0; try { c = fn(r.html); } catch (e) { c = 0; }
    if (c) { tot[name] += c; pageCount[name].add(x.alias); worst[name].push([x.alias, c]); }
  }
}
console.log(n + ' pages scanned' + (settled ? '  (' + settled + ' settled finding(s) held back)' : '') + '\n');
const rows = Object.entries(tot).sort((a, b) => b[1] - a[1]);
for (const [name, count] of rows) {
  if (!count) continue;
  const top = worst[name].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p, c]) => p + ' (' + c + ')');
  console.log(String(count).padStart(6) + '  ' + name.padEnd(36) + ' on ' + String(pageCount[name].size).padStart(3) + ' pages   ' + top.join(', '));
}
