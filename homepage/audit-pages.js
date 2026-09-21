#!/usr/bin/env node
/* Maine DOE — the full page audit
 * Version: 2026-09-19-a  ·  Last edited: 2026-09-19
 *
 *   node audit-pages.js            summary
 *   node audit-pages.js --json     cache/pages.json, one record per page
 *
 * WHAT THIS IS, as distinct from audit-inventory.js. That one answers
 * "what would the cleanup tool change" — a report about markup. This
 * one answers "what is on this page and what is wrong with it" — the
 * record a person needs in front of them to decide whether a page is
 * worth refreshing and what refreshing it would involve.
 *
 * Nothing here rewrites anything. It reads the cached bodies and
 * describes them.
 *
 * SIX THINGS IT LOOKS AT
 *   outline      the heading structure, and where it breaks
 *   components   what the page is built from
 *   access       the mechanical WCAG failures a tool can see
 *   links        every destination, so dead links can be checked
 *   age          signals that the CONTENT may have gone stale
 *   opening      what a description could be drawn from
 *
 * On age: it flags nothing as out of date, because a tool cannot know
 * that. It reports the years a page mentions and the phrases that
 * usually mean "not finished", and leaves the judgement to a person.
 */
'use strict';
const fs = require('fs'), path = require('path');
const C = path.join(__dirname, 'cache');
const nodes = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const { clean, textOf } = require('./interior-cleanup.js');

const attr = (t, n) => (t.match(new RegExp(n + '="([^"]*)"', 'i')) || [])[1];
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const VAGUE = /^(click here|here|read more|more|link|this page|learn more|click|download|view|see more|website|webpage|more info(rmation)?)[.:!]?$/i;
const UNFINISHED = /\b(coming soon|to be (determined|announced|added)|TBD|forthcoming|under (construction|development)|check back|placeholder|lorem ipsum)\b/i;
const THIS_YEAR = new Date().getFullYear();

function auditOne(n) {
  const b = n.body;
  const text = textOf(b);

  /* OUTLINE. A heading that skips a level leaves a hole in the
     structure a screen reader reads out, and it is the commonest
     structural fault on the site. */
  const headings = [...b.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(m => ({ level: Number(m[1][1]), text: strip(m[2]).slice(0, 90), inBlockhead: false }));
  const blockheadText = [...b.matchAll(/class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(m => strip(m[2]));
  headings.forEach(h => { h.inBlockhead = blockheadText.includes(h.text); });

  const outline = [];
  let prev = 1;
  headings.forEach((h, i) => {
    if (h.level === 1) outline.push({ i, issue: 'h1 in body — the page title is already the only h1', text: h.text });
    else if (h.level > prev + 1) outline.push({ i, issue: `jumps h${prev} to h${h.level}`, text: h.text });
    prev = h.level;
  });

  /* COMPONENTS — what the page is made of, which is what tells you
     how much work a refresh is. */
  const count = re => (b.match(re) || []).length;
  const components = {
    cards: count(/class="[^"]*\bcard\b/gi),
    cardHeaders: count(/card-header/gi),
    cardTitles: count(/card-title/gi),
    accordions: count(/<dl[^>]*ckeditor-accordion/gi),
    tables: count(/<table/gi),
    dataTables: count(/<table[\s\S]{0,4000}?<th[\s>]/gi),
    contactCube: count(/contact-cube/gi),
    jumbotron: count(/\bjumbotron\b/gi),
    dcNote: count(/dc-note/gi),
    blockheads: blockheadText.length,
    videos: count(/<iframe/gi),
    images: count(/<img/gi),
    buttons: count(/class="[^"]*\bbtn\b/gi),
  };

  /* ACCESS — only what is mechanically decidable. */
  const imgs = [...b.matchAll(/<img[^>]*>/gi)].map(m => m[0]);
  const links = [...b.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const access = {
    imagesNoAlt: imgs.filter(t => attr(t, 'alt') === undefined).length,
    vagueLinkText: links.map(m => strip(m[2])).filter(t => VAGUE.test(t)),
    emptyLinks: links.filter(m => !strip(m[2]) && !/<img/i.test(m[2])).length,
    tablesNoScope: count(/<th(?![^>]*scope=)/gi),
    multipleH1: headings.filter(h => h.level === 1).length,
    inlineColour: count(/style="[^"]*color\s*:/gi),
  };

  /* LINKS — every destination, deduped, so a dead-link pass has a
     list to work from. */
  const hrefs = [...new Set(links.map(m => attr(m[0], 'href')).filter(Boolean))];
  const linkSet = {
    internal: hrefs.filter(h => h.startsWith('/') && !/\/files\//.test(h)),
    files: hrefs.filter(h => /\/files\//.test(h)),
    external: hrefs.filter(h => /^https?:/i.test(h) && !/maine\.gov/i.test(h)),
    mailto: hrefs.filter(h => /^mailto:/i.test(h)),
    safelinks: hrefs.filter(h => /safelinks\.protection\.outlook\.com/i.test(h)),
    anchors: hrefs.filter(h => h.startsWith('#')),
  };

  /* AGE — reported, never judged. */
  const years = [...new Set((text.match(/\b20[0-2]\d\b/g) || []).map(Number))].sort();
  const schoolYears = [...new Set(text.match(/\b20[0-2]\d\s*[-–—]\s*(?:20)?[0-3]\d\b/g) || [])];
  const age = {
    changed: n.changed,
    yearsMentioned: years,
    newestYear: years.length ? years[years.length - 1] : null,
    yearsBehind: years.length ? THIS_YEAR - years[years.length - 1] : null,
    schoolYears,
    unfinishedPhrases: [...new Set((text.match(new RegExp(UNFINISHED.source, 'gi')) || []))],
  };

  /* OPENING — what a description could be drawn from, so the panel
     has something to propose rather than an empty box.

     NOT simply the first <p>. On a great many pages that paragraph
     holds nothing but the banner graphic, so taking it literally
     reported "no opening" for pages that have a perfectly good one
     two elements further down. Scans the first few paragraphs and
     takes the first with enough words in it, stopping at the first
     heading — past that it is a section's opening, not the page's. */
  let opening = '', openingIndex = -1;
  {
    const upTo = b.search(/<h[1-6][\s>]/i);
    const head = upTo > 200 ? b.slice(0, upTo) : b;
    const paras = [...head.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].slice(0, 6);
    for (const m of paras) {
      if (/<img|<iframe/i.test(m[1])) continue;
      const t = strip(m[1]);
      if (t.length >= 60) { opening = t; openingIndex = m.index; break; }
    }
  }

  const r = clean(b);
  return {
    nid: n.nid, alias: n.alias, title: n.title, changed: n.changed,
    words: text.split(' ').filter(Boolean).length,
    bytes: b.length,
    fixes: r.log, flags: r.flags, contentSafe: !r.lost,
    headings: headings.map(h => ({ l: h.level, t: h.text, bh: h.inBlockhead })),
    outline, components, access, links: linkSet, age,
    opening: opening || null,
    openingChars: opening.length,
  };
}

const pages = nodes.filter(n => n.body.trim()).map(auditOne);

if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(C, 'pages.json'), JSON.stringify(pages, null, 1));
  console.log(`${pages.length} page records → cache/pages.json`);
} else {
  const n = pages.length, pc = x => `${x} (${(x / n * 100).toFixed(0)}%)`;
  const some = f => pages.filter(f).length;
  console.log(`\n${n} pages\n`);

  console.log('STRUCTURE');
  console.log(`  no headings at all               ${pc(some(p => !p.headings.length))}`);
  console.log(`  an <h1> in the body              ${pc(some(p => p.access.multipleH1 > 0))}`);
  console.log(`  a heading level is skipped       ${pc(some(p => p.outline.some(o => /jumps/.test(o.issue))))}`);
  console.log(`  no blockhead section headers     ${pc(some(p => !p.components.blockheads))}`);
  console.log(`  3+ sections — earns a contents list  ${pc(some(p => p.components.blockheads >= 3))}`);
  console.log(`  an opening paragraph long enough to be a description  ${pc(some(p => p.opening))}`);

  console.log('\nACCESSIBILITY, mechanically decidable');
  console.log(`  images with no alt attribute     ${pc(some(p => p.access.imagesNoAlt))}   ${pages.reduce((s, p) => s + p.access.imagesNoAlt, 0)} images`);
  console.log(`  vague link text                  ${pc(some(p => p.access.vagueLinkText.length))}   ${pages.reduce((s, p) => s + p.access.vagueLinkText.length, 0)} links`);
  console.log(`  table headers with no scope      ${pc(some(p => p.access.tablesNoScope))}`);
  console.log(`  links with no text at all        ${pc(some(p => p.access.emptyLinks))}`);
  console.log(`  inline colour on text            ${pc(some(p => p.access.inlineColour))}`);

  console.log('\nLINKS');
  const uniq = k => new Set(pages.flatMap(p => p.links[k])).size;
  console.log(`  distinct internal                ${uniq('internal')}`);
  console.log(`  distinct files                   ${uniq('files')}`);
  console.log(`  distinct external                ${uniq('external')}   ← a dead-link pass would check these`);
  console.log(`  Outlook safelinks still present  ${pc(some(p => p.links.safelinks.length))}`);

  console.log('\nSIGNS A PAGE MAY HAVE GONE STALE — reported, not judged');
  console.log(`  mentions no year after 2022      ${pc(some(p => p.age.newestYear && p.age.newestYear <= 2022))}`);
  console.log(`  mentions no year after 2020      ${pc(some(p => p.age.newestYear && p.age.newestYear <= 2020))}`);
  console.log(`  "coming soon" / "TBD" and similar ${pc(some(p => p.age.unfinishedPhrases.length))}`);
  const stale = pages.filter(p => p.age.newestYear && p.age.newestYear <= 2021).sort((a, b) => a.age.newestYear - b.age.newestYear);
  console.log('\n  oldest ten by newest year mentioned:');
  stale.slice(0, 10).forEach(p => console.log(`    ${String(p.age.newestYear).padEnd(6)}${(p.alias || '').slice(0, 52).padEnd(54)}${p.words}w`));

  console.log('\nCOMPONENT INVENTORY — what a refresh has to deal with');
  const tot = k => pages.reduce((s, p) => s + p.components[k], 0);
  ['cards', 'cardTitles', 'accordions', 'tables', 'dataTables', 'contactCube', 'jumbotron', 'videos', 'images', 'buttons']
    .forEach(k => console.log(`  ${k.padEnd(16)}${String(tot(k)).padStart(6)} on ${some(p => p.components[k])} pages`));

  console.log('\n  node audit-pages.js --json   for the per-page records the panel needs');
}
