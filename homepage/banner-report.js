#!/usr/bin/env node
/* Maine DOE — the duplicate page banners, and what it is safe to delete
 * Version: 2026-09-19-a  ·  Last edited: 2026-09-19
 *
 *   node banner-report.js            table
 *   node banner-report.js --csv      cache/banners.csv
 *
 * Finds the decorative graphic at the top of a page that repeats the
 * page title — the thing the assembled banner replaces — and reports
 * where it is, what file it is, and whether deleting that file would
 * break anything else.
 *
 * THE SAFETY CHECK IS THE POINT. A file used as a banner on one page
 * may be used in the middle of another, and a file id is deleted
 * once and for all. So every candidate is counted across EVERY page
 * body, not just the one it was found on, and anything referenced
 * elsewhere is reported as keep rather than delete.
 */
'use strict';
const fs = require('fs'), path = require('path');
const C = path.join(__dirname, 'cache');
const nodes = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const files = fs.existsSync(path.join(C, 'files.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'files.json'), 'utf8')) : {};

const attr = (tag, name) => (tag.match(new RegExp(name + '="([^"]*)"', 'i')) || [])[1] || '';

/* HOW A PAGE BANNER IS RECOGNISED. Not one signal but several, because
   any one of them alone is wrong somewhere:
     in the opening of the body   a banner is at the top by definition
     width 100% / align-center    it spans the column
     "banner" in the alt or file  how they are actually named here
     wide and short               a real banner's shape
   Two signals or more is a candidate; the score is reported so a
   borderline one can be judged rather than guessed at. */
function score(tag, offset) {
  let s = 0, why = [];
  if (offset < 600) { s += 2; why.push('at top'); }
  else if (offset < 1500) { s += 1; why.push('near top'); }
  if (/^100%$/.test(attr(tag, 'width'))) { s += 2; why.push('full width'); }
  if (/align-center|align_center/.test(attr(tag, 'class'))) { s += 1; why.push('centred'); }
  const named = (attr(tag, 'alt') + ' ' + attr(tag, 'src')).toLowerCase();
  if (/banner/.test(named)) { s += 3; why.push('named banner'); }
  if (/header|masthead/.test(named)) { s += 2; why.push('named header'); }
  return { s, why };
}

/* Every file reference anywhere, so deletion can be checked. */
const refCount = {};
for (const n of nodes) {
  for (const m of n.body.matchAll(/<img[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (src) refCount[src] = (refCount[src] || 0) + 1;
  }
  for (const m of n.body.matchAll(/href="([^"]*\/files\/[^"]*)"/gi)) {
    refCount[m[1]] = (refCount[m[1]] || 0) + 1;
  }
}

const rows = [];
for (const n of nodes) {
  if (!n.body.trim()) continue;
  const head = n.body.slice(0, 2500);
  for (const m of head.matchAll(/<img[^>]*>/gi)) {
    const { s, why } = score(m[0], m.index);
    if (s < 3) continue;
    const src = attr(m[0], 'src');
    const uuid = attr(m[0], 'data-entity-uuid');
    const f = files[uuid] || Object.values(files).find(x => x.url && src && x.url.endsWith(src.split('/').pop())) || null;
    rows.push({
      page: n.alias, title: n.title, nid: n.nid,
      alt: attr(m[0], 'alt'), src,
      fid: f ? f.fid : null,
      filename: f ? f.filename : (src ? decodeURIComponent(src.split('/').pop()) : ''),
      size: f ? f.size : null,
      uses: refCount[src] || 1,
      score: s, why: why.join(' + '),
    });
  }
}

rows.sort((a, b) => b.score - a.score || (a.page || '').localeCompare(b.page || ''));
const safe = rows.filter(r => r.uses === 1);
const shared = rows.filter(r => r.uses > 1);

if (process.argv.includes('--csv')) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['page,title,nid,file_id,filename,alt,uses_elsewhere,confidence,why,src']
    .concat(rows.map(r => [r.page, r.title, r.nid, r.fid, r.filename, r.alt, r.uses - 1, r.score, r.why, r.src].map(esc).join(',')))
    .join('\n');
  fs.writeFileSync(path.join(C, 'banners.csv'), csv);
  console.log(`${rows.length} rows → cache/banners.csv`);
} else {
  console.log(`\n${rows.length} banner graphics across ${new Set(rows.map(r => r.page)).size} pages`);
  console.log(`  with a resolved file id : ${rows.filter(r => r.fid).length}`
    + (Object.keys(files).length ? '' : '   (run fetch-files.js to resolve the rest)'));
  console.log(`  used ONLY as this banner: ${safe.length}   ← safe to delete once the page is updated`);
  console.log(`  used somewhere else too : ${shared.length}   ← do NOT delete`);
  const totalKB = safe.reduce((s, r) => s + (r.size || 0), 0) / 1024 / 1024;
  if (totalKB) console.log(`  space they take         : ${totalKB.toFixed(1)}MB`);

  console.log(`\nFIRST 25, highest confidence first`);
  console.log('  ' + 'fid'.padEnd(8) + 'page'.padEnd(44) + 'file');
  for (const r of rows.slice(0, 25)) {
    console.log('  ' + String(r.fid ?? '—').padEnd(8) + String(r.page || '').slice(0, 42).padEnd(44) + r.filename.slice(0, 44));
  }
  if (shared.length) {
    console.log(`\nSHARED — used on more than one page, keep the file:`);
    for (const r of shared.slice(0, 10)) console.log(`  ${String(r.fid ?? '—').padEnd(8)}${r.filename.slice(0, 44).padEnd(46)}${r.uses} uses`);
  }
  console.log(`\n  node banner-report.js --csv   for the full list`);
}
