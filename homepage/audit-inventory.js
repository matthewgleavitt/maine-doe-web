#!/usr/bin/env node
/* Maine DOE — what is actually wrong across every page
 * Version: 2026-09-19-a  ·  Last edited: 2026-09-19
 *
 *   node audit-inventory.js [--type multi_column_page]
 *
 * Runs the real cleanup transforms over the cached inventory and
 * reports what they would change, what they cannot change, and
 * whether a single word of text would move. No network, so it can be
 * re-run freely as the transforms improve.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { clean, textOf } = require('./interior-cleanup.js');

const TYPE = process.argv.includes('--type')
  ? process.argv[process.argv.indexOf('--type') + 1] : 'multi_column_page';
const nodes = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', `inventory-${TYPE}.json`), 'utf8'));

const fixTotals = {}, fixPages = {}, flagPages = {}, lost = [];
let spacing = 0;
const rows = [];
let clean0 = 0;

for (const n of nodes) {
  if (!n.body.trim()) continue;
  let r;
  try { r = clean(n.body); } catch (e) { lost.push({ alias: n.alias, why: 'threw: ' + e.message }); continue; }
  if (r.lost) lost.push({ alias: n.alias, why: `text changed (${r.lost.charsBefore}→${r.lost.charsAfter})` });
  if (r.spacingOnly) spacing++;
  let fixed = 0;
  for (const line of r.log) {
    const [k, v] = line.split(': ');
    fixTotals[k] = (fixTotals[k] || 0) + Number(v);
    fixPages[k] = (fixPages[k] || 0) + 1;
    fixed += Number(v);
  }
  for (const f of r.flags) flagPages[f] = (flagPages[f] || 0) + 1;
  if (!fixed && !r.flags.length) clean0++;
  rows.push({ alias: n.alias, title: n.title, words: textOf(n.body).split(' ').length, fixed, flags: r.flags.length, changed: n.changed });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${rows.length} pages with content, of ${nodes.length} nodes\n`);

console.log('MECHANICAL — the tool fixes these, no judgement needed');
console.log(`  ${pad('fix', 38)}${'pages'.padStart(7)}${'total'.padStart(9)}`);
Object.entries(fixTotals).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${pad(k, 38)}${String(fixPages[k]).padStart(7)}${String(v).padStart(9)}`));

console.log('\nNEEDS A PERSON — the tool deliberately will not touch these');
console.log(`  ${pad('issue', 38)}${'pages'.padStart(7)}${'% of site'.padStart(11)}`);
Object.entries(flagPages).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${pad(k, 38)}${String(v).padStart(7)}${(v / rows.length * 100).toFixed(0).padStart(10)}%`));

console.log('\nCONTENT SAFETY');
console.log(lost.length
  ? `  ${lost.length} page(s) where text would move — EXCLUDE THESE:\n` +
    lost.slice(0, 20).map(l => `    ${l.alias}  — ${l.why}`).join('\n')
  : `  ${rows.length} pages transformed, not one word of text moved.`);

const byWords = [...rows].sort((a, b) => b.words - a.words);
const byWork  = [...rows].sort((a, b) => (b.fixed + b.flags * 10) - (a.fixed + a.flags * 10));
console.log('\nSHAPE OF THE SITE');
console.log(`  pages already clean            ${clean0}  (${(clean0 / rows.length * 100).toFixed(0)}%)`);
console.log(`  median length                  ${byWords[Math.floor(byWords.length / 2)].words} words`);
console.log(`  longest                        ${byWords[0].words} words — ${byWords[0].alias}`);
console.log(`  pages over 1,000 words         ${rows.filter(r => r.words > 1000).length}`);
console.log(`  pages under 150 words          ${rows.filter(r => r.words < 150).length}`);
const stale = rows.filter(r => r.changed && r.changed < '2023').length;
console.log(`  untouched since 2023           ${stale}  (${(stale / rows.length * 100).toFixed(0)}%)`);

console.log('\nWORST TEN — where the effort is');
byWork.slice(0, 10).forEach(r =>
  console.log(`  ${pad((r.alias || '').slice(0, 46), 48)}${String(r.fixed).padStart(5)} fixes  ${r.flags} flags  ${r.words}w`));

fs.writeFileSync(path.join(__dirname, 'cache', 'audit.json'), JSON.stringify(rows, null, 1));
console.log(`\nPer-page detail → cache/audit.json`);
