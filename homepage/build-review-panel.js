#!/usr/bin/env node
/* Maine DOE — the page review panel
 * Version: 2026-09-22-a  ·  Last edited: 2026-09-22
 *
 *   node build-review-panel.js
 *   then open http://localhost:8791/review/
 *
 * MUST BE SERVED, not opened as a file. Each page's data is fetched
 * on demand, and a browser blocks fetch from file:// — 832 pages of
 * before-and-after inlined into one document would be about 25MB.
 *
 * WHAT IT IS FOR. Deciding, page by page, whether a proposal is right
 * — with the current page and the proposed page side by side, the
 * reasoning for every judgement call listed and switchable, and proof
 * that no block of text went missing.
 *
 * PER-PAGE DIRECTIONS LIVE IN cache/overrides.json, keyed by alias.
 * They are data, not edits to this file, so they survive every
 * rebuild:
 *
 *   { "/about/laws/policy": {
 *       "art": "/doe/sites/…/Policy.png",
 *       "deck": "A description written by hand.",
 *       "cta": { "label": "Start here", "href": "/doe/…" },
 *       "useToc": false,
 *       "note": "leave the jumbotron alone for now" } }
 */
'use strict';
const fs = require('fs'), path = require('path');
const { propose } = require('./propose.js');
/* The same checks sweep.js reports in the terminal, so a page's own
   findings show up on the page while it is being reviewed. */
const { CHECKS } = require('./sweep.js');

const C = path.join(__dirname, 'cache');
const R = path.join(__dirname, 'review');
let SEED_NOTES = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'notes-seed.json'), 'utf8'));
  for (const n of raw) (SEED_NOTES[n.alias] = SEED_NOTES[n.alias] || []).push({ kind: n.kind, text: n.text, detail: n.detail });
} catch (e) { SEED_NOTES = {}; }
let OVERRIDES_NOW = {};
try { OVERRIDES_NOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'overrides.json'), 'utf8')); } catch (e) { OVERRIDES_NOW = {}; }
const OUT = path.join(__dirname, 'out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(C, 'pages.json'), 'utf8'));
const overrides = fs.existsSync(path.join(C, 'overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'overrides.json'), 'utf8')) : {};

fs.rmSync(path.join(R, 'data'), { recursive: true, force: true });
fs.mkdirSync(path.join(R, 'data'), { recursive: true });

const byAlias = Object.fromEntries(pages.map(p => [p.alias, p]));
const rows = [];

index.forEach((n, i) => {
  if (!n.body.trim()) return;
  const a = byAlias[n.alias];
  if (!a) return;
  const o = overrides[n.alias] || {};
  const r = propose(n, a, index, o);

  /* WHY A PAGE IS WORTH LOOKING AT, as one number, so the worklist
     can lead with the pages where the design has most to offer.
     Sections and length dominate because those are what the banner
     and the contents list actually solve; tidiness barely counts,
     because the stylesheet fixes that whether anyone reviews it or
     not. */
  const score =
      (a.components.blockheads >= 3 ? 40 : 0)
    + (a.words > 800 ? 25 : a.words > 400 ? 12 : 0)
    + (a.outline.some(x => /jumps/.test(x.issue)) ? 15 : 0)
    + (a.access.multipleH1 ? 10 : 0)
    + (!a.components.blockheads && a.words > 400 ? 20 : 0)
    + (a.components.accordions ? 8 : 0)
    + (r.deck ? 6 : 0);

  /* THE FILE THAT GOES INTO DRUPAL, written here so it cannot drift
     from the preview. The panel renders r.html and this writes the
     same string to out/<slug>.html in the same pass — there is no
     second transform and no second chance for the two to disagree.
     Paste the file, get the preview. */
  /* A handful of nodes have no alias at all, so the node id is the
     fallback name rather than a crash halfway through the run. */
  const slug = (n.alias || '').replace(/^\//, '').replace(/[^A-Za-z0-9]+/g, '-') || ('node-' + n.nid);
  fs.writeFileSync(path.join(OUT, slug + '.html'), r.html);

  const id = String(i).padStart(4, '0');
  fs.writeFileSync(path.join(R, 'data', id + '.json'), JSON.stringify({
    alias: n.alias, title: n.title, nid: n.nid, changed: n.changed,
    before: n.body, after: r.html,
    notes: r.notes, decisions: r.decisions, mechanical: r.mechanical,
    findings: Object.entries(CHECKS).map(([name, fn]) => {
      let hits = []; try { hits = fn(r.html) || []; } catch (e) { hits = []; }
      return hits.length ? { name, n: hits.length, eg: hits.slice(0, 2) } : null;
    }).filter(Boolean),
    safe: r.safe, audit: a, override: o,
  }));

  rows.push({
    id, alias: n.alias, title: n.title, words: a.words, score,
    /* The page's own last-edited stamp, so an approval can tell
       whether the page has moved since it was given. */
    changed: n.changed,
    sections: a.components.blockheads, deck: !!r.deck, toc: !!r.toc,
    safe: r.safe, fixes: r.mechanical ? r.mechanical.length : 0,
    flags: a.flags.length, outline: a.outline.length,
    stale: a.age.newestYear && a.age.newestYear <= 2022 ? a.age.newestYear : null,
  });
});

rows.sort((a, b) => b.score - a.score || b.words - a.words);

/* THE IMAGE PICKER'S DATA. Only images, and only their filename and
   path — the point is that adding a photo to a banner is a search
   and a click rather than hunting for a path. */
const files = fs.existsSync(path.join(C, 'files.json'))
  ? JSON.parse(fs.readFileSync(path.join(C, 'files.json'), 'utf8')) : {};
const images = Object.values(files)
  .filter(f => f.url && /\.(png|jpe?g|gif|webp)$/i.test(f.url))
  .map(f => ({ n: f.filename, u: f.url, k: Math.round((f.size || 0) / 1024) }))
  .sort((a, b) => a.n.localeCompare(b.n));

const CSS = `
:root{--ink:#182b3c;--mid:#274f73;--teal:#42c3f7;--warm:#eee6df;--rule:#dfe5ea;--ok:#1a7f4b;--warn:#8a5a00;--bad:#8a2e13}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#f2ece7}
.wrap{display:grid;grid-template-columns:330px 1fr;height:100vh}
aside{background:var(--ink);color:#dbe7f0;overflow-y:auto;display:flex;flex-direction:column}
aside header{padding:16px 18px 12px;border-bottom:1px solid rgba(255,255,255,.12);position:sticky;top:0;background:var(--ink);z-index:2}
aside h1{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:0 0 10px}
aside input,aside select{width:100%;padding:7px 9px;margin-bottom:6px;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:13px}
.counts{font-size:12px;color:#9db2c2;margin-top:4px}
.item{padding:9px 18px;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;font-size:13px;line-height:1.35}
.item:hover{background:rgba(255,255,255,.06)}
.item.sel{background:rgba(66,195,247,.16);box-shadow:inset 3px 0 0 var(--teal)}
.item b{display:block;font-weight:600;color:#fff}
.item small{color:#8fa6b8;font-size:11.5px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#5b7health}
.s-none{background:#4a6478}.s-approved{background:#3ec98a}.s-flagged{background:#f0b400}.s-skipped{background:#6d5a4a}.s-delete{background:#8a2e13}.s-moved{background:#c2410c}
.addnote{display:flex;gap:8px;margin-top:10px}
.addnote input{flex:1 1 auto;min-width:0}
.addnote select{flex:0 0 auto}
#notelist .n{display:flex;gap:9px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #edf0f3}
#notelist .n:last-child{border-bottom:0}
#notelist .n.done{opacity:.45}
#notelist .n.done .t{text-decoration:line-through}
#notelist .k{flex:0 0 auto;font:700 10px/1.6 system-ui;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#eef2f6;color:#48607a}
#notelist .k.wrong{background:#fdece8;color:#8a2e13}
#notelist .k.outofdate{background:#fff4e0;color:#8a5a00}
#notelist .t{flex:1 1 auto}
#notelist .d{display:block;font-size:11.5px;color:#7d8fa0;margin-top:2px}
#notelist .x{flex:0 0 auto;cursor:pointer;color:#9aa8b5;font-weight:700}
.notecount{font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#48607a}
.moved{font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#c2410c}
main{overflow-y:auto;padding:0 0 60px}
.bar{position:sticky;top:0;background:#fff;border-bottom:2px solid var(--rule);padding:14px 22px;z-index:3;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.bar h2{margin:0;font-size:19px}
.bar .meta{font-size:12.5px;color:#5c6b78}
.bar .sp{flex:1}
button{font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:7px;border:2px solid var(--ink);background:#fff;color:var(--ink);cursor:pointer}
button.pri{background:var(--ink);color:#fff}
button.go{background:#1a7f4b;border-color:#1a7f4b;color:#fff}
button.warn{background:#f0b400;border-color:#c99700;color:#3a2c00}
button.kill{background:#8a2e13;border-color:#8a2e13;color:#fff}
button:disabled{opacity:.4;cursor:not-allowed}
section{margin:18px 22px;background:#fff;border:1px solid var(--rule);border-radius:10px;overflow:hidden}
section>h3{margin:0;padding:11px 16px;background:var(--ink);color:#fff;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
section>div{padding:14px 16px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0}
/* min-width:0 IS LOAD-BEARING. A grid item's default min-width is auto,
   which means "at least as wide as my content" — and the content here is
   a 1280px iframe. So both tracks grew to 1280, the grid overflowed the
   panel, the wrapper measured 1280, and the scale factor computed to
   exactly 1: no scaling, second column off the right edge. */
.cols>div{padding:0;min-width:0}
.cols>div+div{border-left:2px solid var(--rule)}
.lab{padding:7px 14px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:#5c6b78;background:#f7f4f1;border-bottom:1px solid var(--rule)}
/* THE FRAMES RENDER AT DESKTOP WIDTH AND ARE SCALED DOWN.
   Side by side in a 1700px panel each frame was about 850px wide —
   and an iframe has its own viewport, so every media query in the
   stylesheet saw a narrow screen. Both frames were showing the
   tablet layout: two columns in the contents list instead of three,
   the banner stacked instead of overlaid. Reviewing a layout no
   desktop visitor will ever see.
   Rendered at a real 1280 and scaled to fit instead, so the
   breakpoints behave and the comparison is honest. */
.fwrap{overflow:hidden;position:relative;width:100%}
iframe{width:1280px;height:1500px;border:0;display:block;background:#fff;
  transform-origin:top left;transform:scale(var(--fs,0.66))}
.dec{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid #eef1f4;align-items:flex-start}
.dec:last-child{border-bottom:0}
.dec input{margin-top:3px;width:17px;height:17px;flex:none}
.dec b{display:block;font-size:14px}
.dec span{font-size:13px;color:#5c6b78}
.dec em{display:block;font-size:12.5px;color:#8a2e13;margin-top:3px;font-style:normal}
.note{padding:9px 12px;border-left:4px solid var(--teal);background:#f3f8fb;font-size:13.5px;margin-bottom:8px;border-radius:0 6px 6px 0}
.note.bad{border-left-color:var(--bad);background:#fbf2ef}
textarea{width:100%;min-height:78px;padding:10px;border:1px solid var(--rule);border-radius:7px;font:inherit;font-size:14px;resize:vertical}
.imgrow{display:flex;gap:9px;align-items:center;margin-bottom:9px}
.imgrow input{flex:1;padding:8px 10px;border:1px solid var(--rule);border-radius:7px;font:inherit;font-size:13px}
.hits{max-height:230px;overflow:auto;border:1px solid var(--rule);border-radius:7px;display:none}
.hits.on{display:block}
.hit{display:flex;gap:10px;align-items:center;padding:6px 9px;cursor:pointer;border-bottom:1px solid #f0f3f5;font-size:13px}
.hit:hover{background:#f3f8fb}
.hit img{width:58px;height:34px;object-fit:cover;border-radius:3px;background:#eee;flex:none}
.hit small{color:#7b8894;margin-left:auto;white-space:nowrap}
pre{margin:0;padding:14px 16px;background:#0f1d29;color:#dbe7f0;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto;max-height:340px;white-space:pre-wrap;word-break:break-word}
.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.04em}
.pill.ok{background:#e4f6ec;color:var(--ok)}.pill.bad{background:#fbe9e4;color:var(--bad)}
.empty{padding:80px 30px;text-align:center;color:#7b8894}
`;

/* THE REAL STYLESHEET LIST, taken from a live page at build time.
   Two hand-picked sheets were not enough: the theme serves about
   eight aggregated bundles and the components we are restyling —
   blockhead's gradient, the card, the contact block — are defined in
   those, so both frames rendered half-dressed and the comparison was
   against something no visitor sees. The aggregate filenames carry
   content hashes and change whenever Drupal rebuilds them, which is
   exactly why they are read rather than written down.

   Falls back to the two known-stable sheets if the fetch fails, so a
   rebuild without a network still produces a usable panel. */
let SHEETS = [{ href: 'https://www.maine.gov/awt/templateV3/css/styles2.css', media: 'all' },
              { href: 'https://www.maine.gov/doe/themes/doe/css/sphone.css', media: '(max-width:651px)' }];
try {
  const probe = require('child_process')
    .execFileSync('curl', ['-s', '-A', 'Mozilla/5.0', '--max-time', '20',
      'https://www.maine.gov/doe/learning/multilinguallearner/services'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  /* THE media ATTRIBUTE COMES TOO. Dropping it is a mistake I have
     now made twice: the theme serves a print aggregate and a
     narrow-screen sheet, and without their media conditions both
     apply at every width — the print one appends "(#anchor)" after
     every link, which is exactly what appeared in the contents list. */
  const found = [...probe.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)]
    /* m[0], not m. matchAll yields match ARRAYS, and an array has no
       .match — which threw, was swallowed by the catch below, and
       reported itself as "could not read the live stylesheet list"
       when the fetch had in fact worked perfectly. */
    .map(m => m[0])
    .map(tag => ({
      href: (tag.match(/href="([^"]+)"/) || [])[1],
      media: (tag.match(/media="([^"]+)"/) || [])[1] || 'all',
    }))
    .filter(x => x.href)
    .map(x => ({ ...x, href: x.href.replace(/&amp;/g, '&') }))
    .map(x => ({ ...x, href: x.href.startsWith('http') ? x.href : 'https://www.maine.gov' + x.href }))
    /* The injector rules are pulled in separately and deliberately:
       including the live one would style the BEFORE frame with the
       very design the frame exists to show the absence of. */
    .filter(x => !/asset_injector/.test(x.href));
  if (found.length >= 4) SHEETS = found;
  console.log(`  ${SHEETS.length} production stylesheets linked into the frames`);
} catch (e) {
  console.log('  could not read the live stylesheet list (' + e.message.slice(0, 80) + ') — using the fallback pair');
}

const APP = `
const ROWS = __ROWS__;
const IMAGES = __IMAGES__;
const SHEETS = __SHEETS__;
let cur = null, data = null;

/* NOTES ARE KEPT APART FROM THE REVIEW STATUS. A note is about the
   page's CONTENT and is addressed to whoever owns it; approving is
   about the markup and is addressed to nobody. They have different
   lifetimes — a note outlives the redesign — so they do not share a
   key. */
const notes = {
  all: () => { try { return JSON.parse(localStorage.getItem('doe-notes') || '{}'); } catch (e) { return {}; } },
  save: (o) => localStorage.setItem('doe-notes', JSON.stringify(o)),
  /* What the panel shows for a page: the notes generated from the
     page itself, plus anything typed here, each keyed so its state
     survives a rebuild that regenerates the seed. */
  forPage: (alias) => {
    const mine = notes.all()[alias] || {};
    const out = (SEED[alias] || []).map((n, i) => ({
      id: 'seed:' + i, kind: n.kind, text: n.text, detail: n.detail,
      from: 'found', done: !!(mine['seed:' + i] || {}).done,
    }));
    for (const [id, v] of Object.entries(mine)) {
      if (id.startsWith('seed:')) continue;
      out.push({ id, kind: v.kind || 'note', text: v.text, detail: '', from: 'you', done: !!v.done });
    }
    return out;
  },
  set: (alias, id, v) => { const o = notes.all(); o[alias] = o[alias] || {}; if (v) o[alias][id] = v; else delete o[alias][id]; notes.save(o); },
};
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem('doe-review') || '{}'); } catch (e) { return {}; } },
  set: (a, v) => { const s = store.get(); if (v) s[a] = v; else delete s[a]; localStorage.setItem('doe-review', JSON.stringify(s)); },
};

/* Each frame gets the SITE stylesheets plus ours, so the comparison
   is the real page against the real proposal rather than two bare
   fragments. The BEFORE frame deliberately omits the injector — that
   is the point of a before. */
function frame(body, withInjector) {
  /* NO <base>. It was set to maine.gov so the body's relative image
     paths would resolve — but it also resolved the injector's own
     relative path to maine.gov, where it does not exist, so neither
     frame was styled at all. The image paths are rewritten to
     absolute below instead, and every stylesheet is named in full. */
  const links = SHEETS.map(s => '<link rel="stylesheet" media="' + s.media + '" href="' + s.href + '">').join('')
    /* ?v=BUILD, for the same reason the data files carry it. The
       frame linked the injector with a bare path, so a rebuilt
       stylesheet kept rendering from the browser cache — a stripe
       colour was fixed, rebuilt, and still measured at the old value
       in the panel. The stamp changes every build. */
    + (withInjector ? '<link rel="stylesheet" href="' + location.origin + '/interior-css-injector.deploy.css?v=' + BUILD + '">' : '');
  /* Built with new RegExp rather than a literal: this whole script is
     emitted from a template literal, and a backslash in a template
     literal is consumed before the regex is ever parsed — so /\/doe/
     arrived in the browser as an unterminated regex and took the
     entire panel down with "invalid regular expression flags". */
  body = body
    .replace(new RegExp('(src|href)="/doe/', 'g'), '$1="https://www.maine.gov/doe/')
    .replace(new RegExp('url[(]/doe/', 'g'), 'url(https://www.maine.gov/doe/');
  return '<!doctype html><html><head>' + links
    + '<style>body{margin:0;background:#f2ece7}#container{width:100%}'
    + '#maincontent2{padding:0 0 30px}</style></head>'
    + '<body class="page-node-type-multi-column-page path-node"><div id="container"><div id="content" class="clearfix">'
    + '<div id="maincontent2" class="article"><div id="block-doe-pagetitle"><h1>' + (data ? esc(data.title) : '') + '</h1></div>'
    + '<div id="block-doe-content">' + body + '</div></div></div></div>'
    + '<scr' + 'ipt src="https://code.jquery.com/jquery-3.7.0.min.js"></scr' + 'ipt>'
    + '<scr' + 'ipt src="https://www.maine.gov/awt/templateV3/js/datatables/js/jquery.dataTables.min.js"></scr' + 'ipt>'
    + '<scr' + 'ipt>' + DATATABLES + '</scr' + 'ipt>'
    + '<scr' + 'ipt>' + TABS + '</scr' + 'ipt>'
    + (withInjector ? '<scr' + 'ipt>' + ACCORDION + '</scr' + 'ipt>' : '') + '</body></html>';
}

/* TABS, BOTH KINDS, RUN IN THE FRAME.
   26 pages carry tab markup and none of them worked here: the
   stylesheet for tabs is already in two of the production sheets the
   frame loads, but the SCRIPT is not, and the script is what hides
   the panels. So every tabbed page previewed with all of its panels
   stacked on top of each other, which is neither the live page nor
   the proposal.
   The site runs two behaviours on the same .lesson-tabs.js-tabs hook
   and they are not interchangeable: 13 pages are BUTTONS
   (.tab-button[data-tab] naming a panel id, panels in .tab-contents)
   and 13 are RADIOS (a hidden input per tab, a label[for], the panel
   id derived as inputId + '-content', panels in .content). Both are
   mirrored exactly rather than merged into one tolerant version — a
   preview that initialises tabs the live site would not is worse
   than one that leaves them stacked, because it shows a page working
   that is broken in production. */
const TABS = \`
(function () {
  function radioTabs(t) {
    var inputs = [].slice.call(t.querySelectorAll('input[type="radio"][name]'));
    var panels = [].slice.call(t.querySelectorAll('.content .tab-content'));
    var labels = [].slice.call(t.querySelectorAll('.tab-labels .tab-button[for]'));
    if (!inputs.length || !panels.length || !labels.length) return false;
    function show(id) {
      var panel = t.querySelector('#' + CSS.escape(id + '-content'));
      panels.forEach(function (p) { p.style.display = 'none'; });
      if (panel) panel.style.display = 'block';
      labels.forEach(function (l) { l.classList.toggle('active', l.getAttribute('for') === id); });
    }
    var checked = inputs.filter(function (i) { return i.checked; })[0] || inputs[0];
    if (checked) show(checked.id);
    inputs.forEach(function (i) {
      i.addEventListener('change', function () { if (i.checked) show(i.id); });
    });
    return true;
  }
  function buttonTabs(t) {
    var wrap = t.querySelector('.tab-labels');
    var buttons = [].slice.call(t.querySelectorAll('.tab-labels .tab-button[data-tab]'));
    var panels = [].slice.call(t.querySelectorAll('.tab-contents .tab-content'));
    if (!wrap || !buttons.length || !panels.length) return false;
    panels.forEach(function (c) { c.style.display = 'none'; });
    var initial = t.querySelector('.tab-labels .tab-button.active[data-tab]') || buttons[0];
    var firstPanel = t.querySelector('#' + CSS.escape(initial.getAttribute('data-tab')));
    if (firstPanel) firstPanel.style.display = 'block';
    buttons.forEach(function (b) { b.classList.toggle('active', b === initial); });
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-button[data-tab]');
      if (!btn) return;
      var panel = t.querySelector('#' + CSS.escape(btn.getAttribute('data-tab')));
      if (!panel) return;
      buttons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      panels.forEach(function (c) { c.style.display = 'none'; });
      panel.style.display = 'block';
    });
    return true;
  }
  document.querySelectorAll('.lesson-tabs.js-tabs').forEach(function (el) {
    if (el.getAttribute('data-tabs-bound') === '1') return;
    el.setAttribute('data-tabs-bound', '1');
    if (!radioTabs(el)) buttonTabs(el);
  });
})();
\`;

/* THE SEARCH BEHAVIOUR, RUN IN THE FRAME.
   The panel was linking DataTables' STYLESHEET and none of its
   JavaScript, so all 73 searchable tables previewed as a plain list
   of every row — /schools/schoolops/equivalentinstruction/entry
   showed 259 rows rather than a search box and 25. Matt reviewed
   exactly that and reasonably concluded the table was wrong; it was
   the preview that was wrong.
   The theme initialises on table.tables and table.tablessortdesc
   plus five ids, and reads the row count from data-page-length.
   Mirrored here rather than loading Drupal's own aggregate, which
   would also drag the menus, Google Translate and analytics into
   every frame. */
const DATATABLES = \`
jQuery(function ($) {
  if (!$.fn || !$.fn.DataTable) return;
  $('table.tables, table.tablessortdesc, #coolTable, #certificatetable, #framework2020, #table100, #filter')
    .each(function () {
      if ($.fn.dataTable.isDataTable(this)) return;
      var n = parseInt($(this).attr('data-page-length'), 10) || 25;
      try { $(this).DataTable({ pageLength: n, order: [], autoWidth: false }); } catch (e) {}
    });
});
\`;

/* The accordion module rewrites its own markup on the live site, so
   the proposal frame has to do the same or it shows something no
   visitor will ever see. */
const ACCORDION = \`
document.querySelectorAll('dl.ckeditor-accordion').forEach(function(dl){
  var w=document.createElement('div'); w.className='ckeditor-accordion-container';
  dl.parentNode.insertBefore(w,dl); w.appendChild(dl); dl.className='styled';
  dl.querySelectorAll(':scope > dt').forEach(function(dt){
    var t=dt.textContent.trim(), id=t.toUpperCase().replace(/[^A-Z0-9]/g,'');
    dt.innerHTML='<a class="ckeditor-accordion-toggler" href="#'+id+'" onclick="return false;"><span class="ckeditor-accordion-toggle"></span>'+t+'</a>';
  });
});
document.addEventListener('click',function(e){
  var a=e.target.closest('.ckeditor-accordion-toggler'); if(!a) return; e.preventDefault();
  var dt=a.parentElement, dd=dt.nextElementSibling, o=dt.classList.toggle('active');
  if(dd&&dd.tagName==='DD') dd.style.display=o?'block':'';
});
/* FRAGMENT LINKS HAVE TO BE HANDLED BY HAND IN HERE.
   These frames are srcdoc, and an srcdoc document inherits its base
   URL from the page that holds it — so href="#section" resolves to
   the REVIEW PANEL's own address and the frame navigates to a second
   copy of the panel instead of scrolling. Contents lists, the contact
   jump and back-to-top are all fragment links, so all three did it.
   Scrolled manually instead; on the real page none of this is needed,
   because there the base URL is the page itself. */
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href^="#"]');
  if(!a || a.classList.contains('ckeditor-accordion-toggler')) return;
  e.preventDefault();
  var id=a.getAttribute('href').slice(1);
  if(!id||id==='top'){ window.scrollTo({top:0}); return; }
  var t=document.getElementById(id)||document.getElementsByName(id)[0];
  if(t) t.scrollIntoView({block:'start'});
});\`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* How many notes on a page are still outstanding — seeded ones that
   have not been ticked off, plus anything typed here. */
function openNotes(alias) {
  const mine = (notes.all()[alias]) || {};
  let n = 0;
  (SEED[alias] || []).forEach((_, i) => { if (!(mine['seed:' + i] || {}).done) n++; });
  for (const [id, v] of Object.entries(mine)) if (!id.startsWith('seed:') && !v.done) n++;
  return n;
}
function renderList() {
  const q = document.getElementById('q').value.toLowerCase();
  const f = document.getElementById('filter').value;
  const st = store.get();
  const rows = ROWS.filter(r => {
    if (q && !(r.alias + ' ' + r.title).toLowerCase().includes(q)) return false;
    const s = (st[r.alias] || {}).status || 'none';
    if (f === 'todo' && s !== 'none') return false;
    if (f === 'approved' && s !== 'approved') return false;
    if (f === 'flagged' && s !== 'flagged') return false;
    if (f === 'delete' && s !== 'delete') return false;
    if (f === 'notes' && !openNotes(r.alias)) return false;
    if (f === 'moved') {
      const rec = st[r.alias] || {};
      if (!(rec.status === 'approved' && rec.changedAt && rec.changedAt !== r.changed)) return false;
    }
    if (f === 'toc' && !r.toc) return false;
    if (f === 'outline' && !r.outline) return false;
    if (f === 'unsafe' && r.safe) return false;
    if (f === 'stale' && !r.stale) return false;
    return true;
  });
  document.getElementById('counts').textContent =
    rows.length + ' of ' + ROWS.length + ' · ' +
    ROWS.filter(r => (st[r.alias] || {}).status === 'approved').length + ' approved'
    + (ROWS.filter(r => (st[r.alias] || {}).status === 'delete').length
        ? ' · ' + ROWS.filter(r => (st[r.alias] || {}).status === 'delete').length + ' to delete' : '')
    + (ROWS.filter(r => { const c = st[r.alias] || {};
        return c.status === 'approved' && c.changedAt && c.changedAt !== r.changed; }).length
        ? ' · ' + ROWS.filter(r => { const c = st[r.alias] || {};
            return c.status === 'approved' && c.changedAt && c.changedAt !== r.changed; }).length
          + ' edited since approval' : '');
  document.getElementById('list').innerHTML = rows.map(r => {
    const rec = st[r.alias] || {};
    const s = rec.status || 'none';
    const moved = s === 'approved' && rec.changedAt && rec.changedAt !== r.changed;
    return '<div class="item' + (cur === r.id ? ' sel' : '') + '" data-id="' + r.id + '">'
      + '<b><span class="dot s-' + (moved ? 'moved' : s) + '"></span>' + esc(r.title || r.alias)
      + (moved ? ' <span class="moved">edited since you approved it</span>' : '')
      + (openNotes(r.alias) ? ' <span class="notecount">' + openNotes(r.alias) + ' note' + (openNotes(r.alias) > 1 ? 's' : '') + '</span>' : '')
      + '</b>'
      + '<small>' + esc(r.alias) + ' · ' + r.words + 'w'
      + (r.sections ? ' · ' + r.sections + ' sections' : '')
      + (r.outline ? ' · outline' : '') + (r.stale ? ' · ' + r.stale : '')
      + (r.safe ? '' : ' · UNSAFE') + '</small></div>';
  }).join('') || '<div class="empty">nothing matches</div>';
}

async function open(id) {
  cur = id;
  renderList();
  /* ?v=BUILD — the panel is served off a plain static file
     server, so a rebuilt data file keeps rendering from the
     browser cache and the page looks unchanged after a run that
     did in fact change it. Matt saw a page with no chips on it
     while the file on disk had eighteen. The build stamp makes
     every rebuild a different URL. */
  data = await (await fetch('data/' + id + '.json?v=' + BUILD)).json();
  const st = store.get()[data.alias] || {};
  const a = data.audit;
  document.getElementById('main').innerHTML = \`
    <div class="bar">
      <h2>\${esc(data.title)}</h2>
      <span class="meta">\${esc(data.alias)} · \${a.words} words · changed \${data.changed.slice(0, 10)}</span>
      <span class="pill \${data.safe ? 'ok' : 'bad'}">\${data.safe ? 'no text lost' : 'TEXT LOST — do not apply'}</span>
      <span class="sp"></span>
      <a href="https://www.maine.gov/doe\${esc(data.alias)}" target="_blank"><button>live page</button></a>
      <button class="warn" id="flag">flag</button>
      <button class="kill" id="kill">\${st.status === 'delete' ? 'marked for deletion ✓' : 'delete'}</button>
      <button class="go" id="approve">\${st.status === 'approved' ? 'approved ✓' : 'approve'}</button>
    </div>

    \${data.notes.length ? '<section><h3>Needs a person</h3><div>' +
      data.notes.map(n => '<div class="note' + (/LOST/.test(n) ? ' bad' : '') + '">' + esc(n) + '</div>').join('') +
      '</div></section>' : ''}

    \${data.findings && data.findings.length ? '<section><h3>Still worth a look on this page</h3><div>' +
      data.findings.map(x => '<div class="note"><b>' + esc(x.name.replace(/-/g, ' ')) + '</b> \u00d7 ' + x.n +
        (x.eg && x.eg.length ? ' <span style="color:#5c6b78">\u2014 ' + esc(String(x.eg[0]).slice(0, 80)) + '</span>' : '') +
        '</div>').join('') +
      '</div></section>' : ''}

    <section><h3>Judgement calls — untick to leave alone</h3><div>
      \${data.decisions.length ? data.decisions.map(d => \`
        <label class="dec"><input type="checkbox" checked data-dec="\${d.id}">
        <span><b>\${esc(d.label)}</b><span>\${esc(d.why)}</span>
        \${d.removes ? '<em>Deletes: "' + esc(d.removes) + '"</em>' : ''}</span></label>\`).join('')
        : '<div class="note">Nothing proposed beyond the mechanical clean-up.</div>'}
    </div></section>

    <section><h3>Banner photograph</h3><div>
      <div class="imgrow">
        <input id="imgq" placeholder="search \${IMAGES.length} images by filename, or paste a path" value="\${esc(st.art || data.override.art || '')}">
        <button id="imgclear">none</button>
      </div>
      <div class="hits" id="hits"></div>
      <div class="note">Leave empty for a plain navy banner. A photo added later is one attribute:
        <code>style="background-image:url(…)"</code></div>
    </div></section>

    <section><h3>Description</h3><div>
      <textarea id="deck" placeholder="No description — the banner closes up without one.">\${esc(st.deck != null ? st.deck : (a.opening || ''))}</textarea>
    </div></section>

    <section><h3>Notes for the author</h3>
      <div class="note">What this page needs from whoever owns it — content, not markup. These stay with the page and export together.</div>
      <div id="notelist"></div>
      <div class="addnote">
        <select id="notekind">
          <option value="out of date">out of date</option>
          <option value="wrong">wrong</option>
          <option value="unfinished">unfinished</option>
          <option value="accessibility">accessibility</option>
          <option value="note" selected>note</option>
        </select>
        <input id="notetext" placeholder="What does the author need to do?">
        <button id="noteadd">add</button>
      </div>
    </section>

    <section><h3>Before and after</h3>
      <div class="cols">
        <div><div class="lab">now</div><div class="fwrap" id="wb"><iframe id="fb"></iframe></div></div>
        <div><div class="lab">proposed</div><div class="fwrap" id="wa"><iframe id="fa"></iframe></div></div>
      </div>
    </section>

    <section><h3>What the clean-up changed</h3><div>
      \${data.mechanical && data.mechanical.length
        ? data.mechanical.map(m => '<div class="note">' + esc(m) + '</div>').join('')
        : '<div class="note">Nothing — this page is already tidy.</div>'}
    </div></section>

    <section><h3>Proposed HTML</h3><pre id="src">\${esc(data.after)}</pre></section>\`;

  document.getElementById('fb').srcdoc = frame(data.before, false);
  document.getElementById('fa').srcdoc = frame(data.after, true);
  fitFrames();

  document.getElementById('approve').onclick = () => {
    /* changedAt pins the approval to the version that was on screen.
       Authors keep editing while the review runs, and sync.js pulls
       their edits in — so without this an approval stays green over
       content nobody has looked at. */
    /* THE DESCRIPTION IS ONLY STORED IF IT WAS ACTUALLY EDITED.
       The box is pre-filled with the page's opening paragraph, not
       with the description the proposal chose — and a stored deck
       OVERRIDES the deck rules completely. So approving without
       touching the box used to pin that opening paragraph as the
       description, re-injecting the very text those rules reject:
       a contact instruction, a dated notice, item one of a list.
       Unedited, nothing is stored and the rules keep deciding. */
    const box = document.getElementById('deck').value;
    const prefilled = (data.audit && data.audit.opening) || '';
    const rec = { status: 'approved', changedAt: data.changed,
      art: document.getElementById('imgq').value || null };
    if (box.trim() !== prefilled.trim()) rec.deck = box;
    store.set(data.alias, rec);
    renderList(); document.getElementById('approve').textContent = 'approved ✓';
  };
  document.getElementById('flag').onclick = () => {
    store.set(data.alias, { status: 'flagged', note: prompt('What needs doing here?') || '' });
    renderList();
  };
  /* A PAGE THAT SHOULD NOT EXIST is not a page with a problem, so it
     gets its own status rather than a flag with a note saying so.
     Marked pages keep their entry — the alias is the whole point —
     but they are never counted as approved and they carry no image
     or deck, because nothing is going to be built from them. */
  document.getElementById('kill').onclick = () => {
    /* cur is the panel's current row id — do not shadow it. */
    const was = (store.get()[data.alias] || {}).status;
    if (was === 'delete') { store.set(data.alias, null); renderList(); open(cur); return; }
    if (!confirm('Mark ' + data.alias + ' for deletion?\\n\\nThis only records it here — nothing is deleted on the server.')) return;
    store.set(data.alias, { status: 'delete', note: prompt('Why? (optional)') || '' });
    renderList();
    document.getElementById('kill').textContent = 'marked for deletion ✓';
  };
  /* ── notes for the author ─────────────────────────────────── */
  const esc2 = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderNotes() {
    const list = notes.forPage(data.alias);
    const el = document.getElementById('notelist');
    if (!list.length) { el.innerHTML = '<div class="note">No notes yet.</div>'; renderList(); return; }
    el.innerHTML = list.map(n =>
      '<div class="n' + (n.done ? ' done' : '') + '" data-id="' + esc2(n.id) + '">'
      + '<input type="checkbox" class="ck"' + (n.done ? ' checked' : '') + '>'
      + '<span class="k ' + n.kind.replace(/[^a-z]/gi, '').toLowerCase() + '">' + esc2(n.kind) + '</span>'
      + '<span class="t">' + esc2(n.text)
      + (n.detail ? '<span class="d">' + esc2(n.detail) + '</span>' : '')
      + (n.from === 'found' ? '<span class="d">found automatically</span>' : '')
      + '</span>'
      + (n.from === 'you' ? '<span class="x" title="remove">x</span>' : '')
      + '</div>').join('');
    renderList();
  }
  document.getElementById('notelist').onclick = (e) => {
    const row = e.target.closest('.n'); if (!row) return;
    const id = row.dataset.id;
    const mine = notes.all()[data.alias] || {};
    if (e.target.classList.contains('ck')) {
      const was = mine[id] || {};
      notes.set(data.alias, id, Object.assign({}, was, { done: e.target.checked,
        kind: was.kind || (notes.forPage(data.alias).find(n => n.id === id) || {}).kind,
        text: was.text || (notes.forPage(data.alias).find(n => n.id === id) || {}).text }));
      renderNotes();
    } else if (e.target.classList.contains('x')) {
      notes.set(data.alias, id, null); renderNotes();
    }
  };
  document.getElementById('noteadd').onclick = () => {
    const box = document.getElementById('notetext');
    const text = box.value.trim(); if (!text) return;
    notes.set(data.alias, 'you:' + Date.now(),
      { kind: document.getElementById('notekind').value, text, done: false, at: new Date().toISOString() });
    box.value = ''; renderNotes();
  };
  document.getElementById('notetext').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('noteadd').click(); };
  renderNotes();

  const q = document.getElementById('imgq'), hits = document.getElementById('hits');
  q.oninput = () => {
    const t = q.value.toLowerCase().trim();
    if (t.length < 2 || t.startsWith('/')) { hits.className = 'hits'; return; }
    const m = IMAGES.filter(i => i.n.toLowerCase().includes(t)).slice(0, 40);
    hits.innerHTML = m.map(i => '<div class="hit" data-u="' + esc(i.u) + '"><img src="https://www.maine.gov' + esc(i.u) + '" loading="lazy"><span>' + esc(i.n) + '</span><small>' + i.k + 'kb</small></div>').join('') || '<div class="hit">no match</div>';
    hits.className = 'hits on';
  };
  hits.onclick = e => { const h = e.target.closest('.hit'); if (!h || !h.dataset.u) return; q.value = h.dataset.u; hits.className = 'hits'; };
  document.getElementById('imgclear').onclick = () => { q.value = ''; hits.className = 'hits'; };
}

/* The wrapper is as tall as the scaled frame, or the page below it
   sits under 1500px of empty space. */
function fitFrames() {
  for (const [w, f] of [['wb', 'fb'], ['wa', 'fa']]) {
    const wrap = document.getElementById(w), fr = document.getElementById(f);
    if (!wrap || !fr) continue;
    const s = wrap.clientWidth / 1280;
    fr.style.setProperty('--fs', s);
    wrap.style.height = Math.round(1500 * s) + 'px';
  }
}
window.addEventListener('resize', fitFrames);

document.getElementById('list').onclick = e => { const i = e.target.closest('.item'); if (i) open(i.dataset.id); };
document.getElementById('q').oninput = renderList;
document.getElementById('filter').onchange = renderList;
/* THE NOTES, AS SOMETHING THAT CAN BECOME EMAILS.
   Grouped by page and written as plain text, because the next step
   is a person pasting it into a message — not another tool reading
   it. Only what is still outstanding: a note ticked off has been
   dealt with and does not need repeating to anybody.
   Author names are not here yet; they live in the Comms Portal. The
   grouping is by page so that when those names arrive, pages can be
   gathered under them without any of this changing. */
document.getElementById('exnotes').onclick = () => {
  const all = notes.all();
  const aliases = [...new Set([...Object.keys(all), ...Object.keys(SEED)])]
    .filter(a => openNotes(a)).sort();
  if (!aliases.length) return alert('No outstanding notes.');
  const byAlias = Object.fromEntries(ROWS.map(r => [r.alias, r]));
  let total = 0;
  const out = ['Maine DOE — page notes', new Date().toString(), ''];
  for (const a of aliases) {
    const row = byAlias[a] || {};
    const open = notes.forPage(a).filter(n => !n.done);
    total += open.length;
    out.push('https://www.maine.gov/doe' + a);
    if (row.title) out.push('  ' + row.title);
    for (const n of open) {
      out.push('  [' + n.kind + '] ' + n.text);
      if (n.detail) out.push('        ' + n.detail);
    }
    out.push('');
  }
  out.push(total + ' outstanding note(s) across ' + aliases.length + ' page(s).');
  const blob = new Blob([out.join('\\n')], { type: 'text/plain' });
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob); el.download = 'doe-page-notes.txt'; el.click();
};

document.getElementById('export').onclick = () => {
  const st = store.get();
  const out = Object.entries(st).filter(([, v]) => v.status === 'approved');
  if (!out.length) return alert('Nothing approved yet.');
  /* MERGED WITH WHAT IS ALREADY IN THE FILE, not written over it.
     The export used to emit the approvals alone, and the alert told
     you to save it as cache/overrides.json — which would delete
     every hand-written page instruction in there: the dropped
     section on /schools/nutrition/CNDatareports, the h3 on
     /schools/equivalentinstruction, the list labels. Those are not
     recoverable from the panel, because the panel never had them.
     The file's current contents ship inside this page and are
     merged back in, per page, with the approval's own keys layered
     on top. */
  const merged = JSON.parse(JSON.stringify(EXISTING));
  for (const [alias, v] of out) merged[alias] = Object.assign({}, merged[alias] || {}, v);
  const kept = Object.keys(EXISTING).filter(k => k !== '_readme').length;
  const blob = new Blob([JSON.stringify(merged, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'overrides.json'; a.click();
  alert(out.length + ' approved page(s) exported, with ' + kept + ' existing page instruction(s) kept.'
    + '\\n\\nSave as cache/overrides.json and re-run the builder.');
};
renderList();
/* THE FIRST ROW THE FILTER IS SHOWING, not the first row there is.
   The filter now opens on "not yet reviewed", so ROWS[0] is very
   likely a page that has already been dealt with and is not in the
   list on screen — the panel would open one page and highlight
   none. */
{
  const first = document.querySelector('#list .item');
  /* The id is a zero-padded string — "0828". Coercing it to a
     number gives 828, which matches nothing. */
  if (first) open(first.dataset.id);
  else if (ROWS.length) open(ROWS[0].id);
}
`;

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Page review — Maine DOE</title>
<style>${CSS}</style></head>
<body><div class="wrap">
<aside>
  <header>
    <h1>Page review</h1>
    <input id="q" placeholder="search title or path">
    <select id="filter">
      <option value="all">everything</option>
      <option value="todo" selected>not yet reviewed</option>
      <option value="toc">earns a contents list</option>
      <option value="outline">heading levels skip</option>
      <option value="stale">mentions no recent year</option>
      <option value="unsafe">proposal unsafe</option>
      <option value="approved">approved</option>
      <option value="flagged">flagged</option>
      <option value="delete">marked for deletion</option>
      <option value="moved">approved, but edited since</option>
      <option value="notes">has notes for the author</option>
    </select>
    <div class="counts" id="counts"></div>
    <button id="export" style="width:100%;margin-top:8px">export approved</button>
    <button id="exnotes" style="width:100%;margin-top:6px">export notes</button>
  </header>
  <div id="list"></div>
</aside>
<main id="main"><div class="empty">select a page</div></main>
</div>
<script>const BUILD = '${Date.now().toString(36)}';
const EXISTING = ${JSON.stringify(OVERRIDES_NOW)};
const SEED = ${JSON.stringify(SEED_NOTES)};
${APP
  .replace('__ROWS__', JSON.stringify(rows))
  .replace('__IMAGES__', JSON.stringify(images))
  .replace('__SHEETS__', JSON.stringify(SHEETS))}</script>
</body></html>`;

fs.writeFileSync(path.join(R, 'index.html'), HTML);
console.log(`review panel → review/index.html`);
console.log(`  ${rows.length} pages, ${images.length} images in the picker`);
console.log(`  ${rows.filter(r => !r.safe).length} proposal(s) flagged unsafe`);
console.log(`  ${rows.filter(r => r.toc).length} earn a contents list, ${rows.filter(r => r.outline).length} have heading problems`);
console.log(`\n  open  http://localhost:8791/review/`);
