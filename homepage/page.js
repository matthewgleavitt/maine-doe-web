#!/usr/bin/env node
/* Maine DOE — look at one page
 * Version: 2026-09-22-a  ·  Last edited: 2026-09-22
 *
 *   node page.js /meac                 outline, decisions, notes, safe
 *   node page.js /meac --html          the full proposed body
 *   node page.js /meac --find "Portal" the markup around a phrase
 *   node page.js /meac --shot .card    a screenshot of the first match
 *
 * WHY THIS EXISTS. Matt is reviewing 830 pages one at a time and most
 * of what he reports is "this bit of this page is wrong". Answering
 * that was costing four or five commands and, far too often, a sweep
 * over the whole corpus to size something he had not asked to have
 * sized. One command, one page.
 *
 * THE ONE CHECK THAT IS NOT OPTIONAL is r.safe — the proof that no
 * block of text went missing between the live page and the proposal.
 * Everything else here is convenience; that is the thing standing
 * between a formatting change and quietly deleting somebody's
 * content, so it prints every time.
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = __dirname;
const { propose } = require(path.join(H, 'propose.js'));
const C = path.join(H, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const by = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8')).map(p => [p.alias, p]));
const ov = JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8'));
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const arg = process.argv[2];
if (!arg) { console.error('usage: node page.js /alias [--html|--find "text"|--shot sel]'); process.exit(1); }
const alias = arg.startsWith('/') ? arg : '/' + arg;
const node = idx.find(n => n.alias === alias)
  || idx.find(n => (n.alias || '').toLowerCase().endsWith(alias.toLowerCase()));
if (!node) { console.error('no page with alias ' + alias); process.exit(1); }
const r = propose(node, by[node.alias] || {}, idx, ov[node.alias] || {});

const mode = process.argv[3], param = process.argv[4];
if (mode === '--html') { console.log(r.html); process.exit(0); }
if (mode === '--find') {
  const re = new RegExp(param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  let n = 0;
  for (const m of r.html.matchAll(re)) {
    if (n++ > 4) break;
    console.log('--- hit ' + n + ' ---');
    console.log(r.html.slice(Math.max(0, m.index - 320), m.index + 420).replace(/></g, '>\n<'));
  }
  if (!n) console.log('"' + param + '" is not in the proposal');
  process.exit(0);
}

console.log(`${node.alias}   ${node.title}`);
console.log(`  safe: ${r.safe ? 'yes' : 'NO — CONTENT LOST, do not apply'}   ${strip(node.body).split(' ').length} words`);
if (ov[node.alias]) console.log(`  override: ${Object.keys(ov[node.alias]).filter(k => k !== '_why').join(', ')}`);

/* The shape of the page, one line per structural element.
   CLASS TOKENS, NOT \b. A word boundary sits either side of the
   hyphen in "card-body", so /\bcard\b/ matches it and every card
   was listed twice. The token has to be bounded by a space or the
   quote that ends the attribute. */
const TOK = '(?:blockhead|card|contact-cube|dc-note|doe-hero|ckeditor-accordion-container|row|doe-video)';
const RE = new RegExp(
  '<div[^>]*class="(?:[^"]*\\s)?(' + TOK + ')(?=[\\s"])[^>]*>'
  + '|<(h[1-6])\\b[^>]*>([\\s\\S]*?)<\\/h[1-6]>'
  + '|<table\\b|<ul[^>]*class="[^"]*list-group|<iframe\\b'
  + '|<img[^>]*alt="([^"]*)"|<a[^>]*class="[^"]*\\bbtn\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/a>', 'gi');
console.log('\n  STRUCTURE');
for (const m of r.html.matchAll(RE)) {
  let t = '', x = '';
  if (m[1]) {
    t = m[1];
    if (t === 'card') {
      const seg = r.html.slice(m.index, m.index + 700);
      const h = seg.match(/card-header[^>]*>\s*(?:<strong>)?([^<]{1,58})/);
      x = h ? '"' + h[1].trim() + '"' : '(no header)';
    }
  } else if (m[2]) { t = m[2].toUpperCase(); x = strip(m[3]).slice(0, 58); }
  else if (m[4] !== undefined) { t = 'img'; x = 'alt="' + m[4].slice(0, 40) + '"'; }
  else if (m[5] !== undefined) { t = 'button'; x = '"' + strip(m[5]).slice(0, 46) + '"'; }
  else if (m[0].startsWith('<table')) t = 'table';
  else if (m[0].startsWith('<ul')) t = 'list-group';
  else t = 'iframe';
  console.log('    ' + t.padEnd(24) + x);
}

if (r.decisions && r.decisions.length) {
  console.log('\n  DECISIONS (' + r.decisions.length + ')');
  for (const d of r.decisions) console.log('    ' + String(d.id).padEnd(24) + (d.value || d.label || ''));
}
if (r.notes && r.notes.length) {
  console.log('\n  NOTES');
  for (const n of r.notes) console.log('    ' + n);
}
