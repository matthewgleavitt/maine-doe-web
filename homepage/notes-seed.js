#!/usr/bin/env node
/* Maine DOE interior pages — the notes an author needs to act on
 * Version: 2026-09-22-b  ·  Last edited: 2026-09-22 17:15
 *
 *   node notes-seed.js            report
 *   node notes-seed.js --json     cache/notes-seed.json for the panel
 *
 * PHASE TWO IS NOT A DESIGN PROBLEM. Everything up to here has been
 * markup — things a rule can fix without anyone deciding anything.
 * What is left needs a person who knows the subject: whether a 2019
 * report is still the current one, whether a dead link should be
 * repointed or dropped, what a picture is actually of.
 *
 * Nothing here is a judgement about quality. Each note states a fact
 * about the page and leaves the decision to whoever owns it.
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = __dirname;
const { propose } = require(path.join(H, 'propose.js'));
const C = path.join(H, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const aud = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const by = Object.fromEntries(aud.map(p => [p.alias, p]));
const ov = JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8'));
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const THIS_YEAR = 2026;

const notes = [];
const add = (alias, kind, text, detail) => notes.push({ alias, kind, text, detail: detail || '' });

for (const x of idx) {
  if (!x.body.trim()) continue;
  const a = by[x.alias]; if (!a) continue;
  let r; try { r = propose(x, a, idx, ov[x.alias] || {}); } catch (e) { continue; }
  const h = r.html, t = strip(h);

  /* A school year that has already finished. */
  const yrs = [...t.matchAll(/\b(20[0-2][0-9])\s*[-–—]\s*(20[0-2][0-9])\b/g)].map(m => +m[2]);
  if (yrs.length) {
    const newest = Math.max(...yrs);
    if (newest < THIS_YEAR)
      add(x.alias, 'out of date',
        `The most recent school year named anywhere on this page is ${newest - 1}–${newest}. Is there a newer version?`,
        `${yrs.length} year range${yrs.length > 1 ? 's' : ''} on the page, newest ${newest}`);
  }

  /* Still promising something. */
  const soon = [...t.matchAll(/\b(coming soon|to be announced|TBD|under construction|check back)\b/gi)].map(m => m[1]);
  if (soon.length)
    add(x.alias, 'unfinished',
      `The page still says "${soon[0]}". Has it arrived, or should the line come out?`,
      soon.length + ' place' + (soon.length > 1 ? 's' : ''));

  /* A HUB WITH NO PICTURE IN ITS BANNER.
     Matt, on /numeracy: "Can we remove the globe but then just make a
     note to add an image to all of the hubs."
     The six hubs are the front doors to their subjects and each one
     already had a banner graphic — a photograph with the hub's name
     set into it — which is retired here because the name repeats the
     page title Drupal already prints. The photograph is not replaced
     by anything: the banner renders as flat navy, and on /numeracy
     the only picture left was a globe diagram that has now come off
     too.
     The band takes a photograph as a background with one attribute,
     so this is a picture away from being finished. What it needs is a
     copy of the existing banner CROPPED TO THE PICTURE, with the
     lettering out of it — otherwise the words sit behind the page's
     own h1. That is a person's job, so it is a note and not a rule.
     Only the hubs, which is what Matt asked for. 332 pages had a
     banner retired and the same note would be true of all of them;
     the hubs are where it is worth doing first. */
  if (/\bhub\b/i.test(x.title || '') && !/background-image/.test(h))
    add(x.alias, 'needs a picture',
      'The banner has no photograph. This hub\'s old banner graphic is retired because its lettering repeats the page title, which leaves the band flat navy.',
      'Needs the banner image cropped to the picture, without the words');

  /* A picture whose alt text is its file name. */
  const badAlt = [...h.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)]
    .map(m => m[1].trim())
    .filter(v => /\.(png|jpe?g|gif|webp)$/i.test(v) || /^(image|img|picture|photo|card image cap|untitled)/i.test(v));
  if (badAlt.length)
    add(x.alias, 'accessibility',
      `${badAlt.length} image${badAlt.length > 1 ? 's describe themselves' : ' describes itself'} with a file name rather than what the picture shows. A screen reader reads it out as written.`,
      badAlt.slice(0, 3).join(' · '));

  /* A link whose words are a web address. */
  const rawUrl = [...h.matchAll(/<a\b[^>]*>\s*(https?:\/\/[^<\s]{8,})\s*<\/a>/gi)].map(m => m[1]);
  if (rawUrl.length)
    add(x.alias, 'accessibility',
      `${rawUrl.length} link${rawUrl.length > 1 ? 's are' : ' is'} labelled with the web address instead of what it leads to.`,
      rawUrl.slice(0, 2).map(u => u.slice(0, 54)).join(' · '));

  /* A link that says nothing. */
  const vague = [...h.matchAll(/<a\b[^>]*>\s*(click here|here|read more|more|link|this page|this)\s*<\/a>/gi)].map(m => m[1]);
  if (vague.length)
    add(x.alias, 'accessibility',
      `${vague.length} link${vague.length > 1 ? 's say' : ' says'} only "${vague[0]}". Out of context that tells a screen-reader user nothing.`,
      vague.slice(0, 3).join(' · '));

  /* The address on the page is not the address it mails. */
  for (const m of h.matchAll(/<a\b[^>]*href="mailto:([^"?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const to = decodeURIComponent(m[1]).trim().toLowerCase();
    const shown = strip(m[2]).toLowerCase();
    if (/@/.test(shown) && shown !== to)
      add(x.alias, 'wrong', `The page shows "${strip(m[2])}" but the link sends to ${to}.`, '');
  }
}

const byKind = {};
for (const n of notes) (byKind[n.kind] = byKind[n.kind] || []).push(n);
const pages = new Set(notes.map(n => n.alias));
console.log(`${notes.length} notes across ${pages.size} pages\n`);
Object.entries(byKind).sort((a, b) => b[1].length - a[1].length).forEach(([k, list]) => {
  console.log(String(list.length).padStart(4) + '  ' + k + '  (' + new Set(list.map(n => n.alias)).size + ' pages)');
});

if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(C, 'notes-seed.json'), JSON.stringify(notes, null, 1));
  console.log('\ncache/notes-seed.json written');
}
