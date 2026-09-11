#!/usr/bin/env node
/* Builds preview.html from the three deploy files, so what you look
   at is exactly what you paste into Drupal. Re-run after any edit:

     node homepage/build-preview.js
*/
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

/* Root-relative paths are correct on maine.gov and 404 from a local
   preview server, so guardPhoto() strips the images and every hero
   slide falls back to the branded panel — which makes the preview
   useless for judging photography. Absolutise them for the preview
   ONLY. The deploy file on disk is never touched. */
const body = read('drupal-body.html')
  .replace(/(src|href)="\/doe\//g, '$1="https://www.maine.gov/doe/');
const css  = read('drupal-css-injector.css');
const js   = read('drupal-js-injector.js');

/* The CSS rule deliberately contains no external URL (the maine.gov
   WAF 403s a CSS Injector save that has one), so the font URL is
   assembled in the JS rule. Pull it back out of there for the preview
   rather than duplicating it. */
const fontHref = (() => {
  const m = js.match(/var FONT_CSS =([\s\S]*?);\n/);
  if (!m) return null;
  try { return eval(m[1].replace(/\n/g, '')); } catch { return null; }
})();
const cssNoImport = css;

/* maine.gov chrome, so the page is judged in its real context. */
const chrome = `
<div class="mg-strip"><div class="mg-rail">
  <b>Maine.gov</b><a href="#">Agencies</a><a href="#">Online Services</a><a href="#">Help</a><a href="#">Search Maine.gov</a>
</div></div>
<header class="mg-mast"><div class="mg-rail">
  <span class="mg-seal">ME</span>
  <span class="mg-word"><span class="mg-l1">Maine</span><span class="mg-l2">Department of Education</span></span>
  <nav class="mg-util" aria-label="Utility">
    <a href="#">Newsroom</a><a href="#">Event Calendar</a><a href="#">Newsletters</a><a href="#">Contact Us</a><a href="#">Language Assistance</a>
  </nav>
</div></header>
<nav class="mg-nav" aria-label="Main"><div class="mg-rail">
  <a href="#">About</a><a href="#">Offices</a><a href="#">Educators</a><a href="#">Learning</a>
  <a href="#">Initiatives</a><a href="#">School Services</a><a href="#">Data &amp; Funding</a>
</div></nav>`;

/* Minimal stand-in for the parts of the maine.gov theme this page
   actually sits inside — the header, and #maincontent1's gutters. */
const shell = `
:root{color-scheme:light;}
body{margin:0;background:#0e1c27;}
.mg-page{background:#fff;max-width:1440px;margin:0 auto;box-shadow:0 24px 70px rgba(0,0,0,.45);}
.mg-rail{max-width:1200px;margin:0 auto;padding:0 clamp(16px,4vw,32px);display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.mg-strip{background:#f2f2f2;border-bottom:1px solid #d5d5d5;font-size:12px;color:#333;}
.mg-strip .mg-rail{padding-top:6px;padding-bottom:6px;}
.mg-strip b{font-family:Georgia,serif;font-size:14px;}
.mg-strip a{color:#25506f;text-decoration:none;}
.mg-mast{background:#182b3c;color:#fff;}
.mg-mast .mg-rail{padding-top:16px;padding-bottom:16px;}
.mg-seal{width:44px;height:44px;border:1.5px solid #42c3f7;border-radius:8px;display:grid;place-items:center;font-weight:700;font-size:15px;color:#42c3f7;font-family:'League Spartan',sans-serif;}
.mg-word{line-height:1.15;}
.mg-l1{display:block;font-family:'League Spartan',sans-serif;font-size:20px;font-weight:700;}
.mg-l2{display:block;font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;color:#a9c4d8;margin-top:3px;}
.mg-util{margin-left:auto;display:flex;gap:18px;font-size:13px;flex-wrap:wrap;}
.mg-util a{color:#c6d7e4;text-decoration:none;}
.mg-nav{background:#274f73;}
.mg-nav .mg-rail{gap:2px;}
.mg-nav a{color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:13px 15px;border-bottom:3px solid transparent;}
.mg-nav a:hover{border-bottom-color:#42c3f7;background:rgba(0,0,0,.14);}
/* ---- The theme rules that actually fight this page ----------------
   Reproduced verbatim from the live site so the preview is as hostile
   as the real thing. Both carry !important AND an ID, so anything of
   ours that loses to them here would lose on maine.gov too.

   The display rule is the nasty one: every list-item link on the page
   is a grid (calendar rows, story strip, good-news list) and
   inline-block silently collapses all three into stacked text. That
   shipped once because the preview was friendlier than production.
   ------------------------------------------------------------------ */
#content a, .maincontent a, #maincontent1 a { color:#274f73 !important; }
#content li a { display:inline-block !important; }

/* #maincontent1 as the live theme sets it (padding:10px 16px) — the
   injector's reset is what removes it, so leaving the real value here
   proves the reset actually lands. */
#maincontent1{padding:10px 16px;}
`;

const out = `<title>Maine DOE Homepage Direction</title>
${fontHref ? `<link rel="stylesheet" href="${fontHref}">` : ''}
<style>${shell}</style>
<style>${cssNoImport}</style>
<script>/* document.body does not exist yet this early in the parse, so the
   class was never applied and the console carried a TypeError that
   masked real errors. */
document.addEventListener('DOMContentLoaded', function () {
  document.body.classList.add('page-node-type-home-page');
});<\/script>
<div class="mg-page">
${chrome}
<div id="content"><div id="maincontent1"><div id="block-doe-content">
${body}
</div></div></div>
</div>
<script>${js}<\/script>
`;

fs.writeFileSync(path.join(dir, 'preview.html'), out);
console.log('preview.html written — ' + (out.length / 1024).toFixed(1) + 'KB');

/* ------------------------------------------------------------------
   WAF lint.

   Saving a CSS or JS Injector rule on maine.gov POSTs the whole file
   through a WAF. A scheme-qualified web address anywhere in the body
   gets the save rejected with a bare 403 and no explanation — it
   reads as remote file inclusion.

   This is evidence-based, not a guess. The newsletter CSS rule live
   on the site today is 53KB and contains 203 var(--x) uses, 97 block
   comments, and 4 tag-like strings in comments — all fine. What it
   does NOT contain is a single URL or import. That's the whole
   difference.

   The fix is protocol-relative addresses: start at the double slash
   and carry no scheme. The browser resolves them against the page.

   The body field is NOT affected — it's a rich-text field and is
   meant to contain markup.
   ------------------------------------------------------------------ */
const RISKS = [
  [/https?:\/\//g, 'scheme-qualified address — start it at // instead'],
  [/@import/g,     'stylesheet import — attach it from the JS rule instead'],
];

let dirty = 0;
for (const [name, body] of [['drupal-css-injector.css', css], ['drupal-js-injector.js', js]]) {
  for (const [re, why] of RISKS) {
    const hits = body.match(re);
    if (!hits) continue;
    dirty++;
    const lines = body.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => re.test(l) && (re.lastIndex = 0) === 0)
      .slice(0, 5);
    console.error(`\n  WAF RISK  ${name}: ${why} — ${hits.length} occurrence(s)`);
    lines.forEach(([n, l]) => console.error(`    line ${n}: ${l.trim().slice(0, 76)}`));
  }
}
console.log(dirty
  ? '\n  ^ fix these before pasting into Drupal, or the save will 403.'
  : 'WAF lint: both injector files clean.');
