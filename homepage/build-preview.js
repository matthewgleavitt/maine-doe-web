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
/* `node build-preview.js b` builds the B variant instead. Same CSS and
   JS rules — only the body field differs between the two pages. */
const variant = (process.argv[2] || '').toLowerCase() === 'b' ? 'b' : 'a';
const bodyFile = variant === 'b' ? 'drupal-body-b.html' : 'drupal-body.html';
const outFile  = variant === 'b' ? 'preview-b.html' : 'preview.html';

const body = read(bodyFile)
  .replace(/(src|href)="\/doe\//g, '$1="https://www.maine.gov/doe/')
  /* data-endpoint and the YouTube thumbnails are protocol-relative for
     the same WAF reason as the JS — and break the same way over http. */
  .replace(/="\/\/(script\.google\.com|i\.ytimg\.com)/g, '="https://$1');
const css  = read('drupal-css-injector.css');
const js   = read('drupal-js-injector.js');

/* Protocol-relative addresses are REQUIRED in the deploy file — the WAF
   rejects a scheme-qualified one. But this preview is served over plain
   http, so `//script.google.com` resolves to http:// and Google 404s
   that scheme, which silently killed the events feed in preview while
   it worked perfectly on maine.gov. Absolutised for the preview only;
   the WAF lint below still reads the untouched source. */
const jsPreview = js.replace(/(["'])\/\/(script\.google\.com|public-api\.wordpress\.com|i\.ytimg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/g, '$1https://$2');

/* The chrome rule is a SEPARATE CSS Injector rule on the live site, so
   it is loaded separately here too. Previewing it at all is new: the
   old preview used a hand-written mock header whose class names none
   of these selectors matched, which meant every header and footer
   change had to be judged on the live site. */
const chromeCss = read('drupal-css-injector-chrome.css')
  .replace(/url\(\/doe\//g, 'url(https://www.maine.gov/doe/');

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

/* Real maine.gov chrome markup, captured from the live page and kept in
   preview-chrome.html. Split on the three markers. */
const chromeParts = (() => {
  const raw = read('preview-chrome.html');
  const grab = (a, b) => raw.slice(raw.indexOf(a) + a.length, b ? raw.indexOf(b) : undefined).trim();
  return {
    header: grab('<!--HEADER-->', '<!--MENU-->'),
    menu:   grab('<!--MENU-->', '<!--FOOTER-->'),
    footer: grab('<!--FOOTER-->'),
  };
})();

/* Minimal stand-in for the parts of the maine.gov theme this page
   actually sits inside — the header, and #maincontent1's gutters. */
const shell = `
:root{color-scheme:light;}
body{margin:0;background:#0e1c27;}
.mg-page{background:#fff;max-width:1440px;margin:0 auto;box-shadow:0 24px 70px rgba(0,0,0,.45);}
.mg-strip{background:#f2f2f2;border-bottom:1px solid #d5d5d5;font-size:12px;color:#333;}
.mg-strip>div{max-width:1200px;margin:0 auto;padding:6px clamp(16px,4vw,32px);display:flex;gap:18px;flex-wrap:wrap;}
.mg-strip b{font-family:Georgia,serif;font-size:14px;}
.mg-strip a{color:#25506f;text-decoration:none;}

/* ---- THEME RULES THE CHROME RULE HAS TO BEAT ----------------------
   Measured on the live page, not guessed. Without these the preview is
   friendlier than production and header bugs ship — which is exactly
   what happened with the logo overlap and the hover indicator.
   -------------------------------------------------------------------- */
#container>header .sub-container{background:#fff url(https://www.maine.gov/awt/templateV3/images/header.jpg) no-repeat;}
header h2.logo{text-indent:-9999px;float:left;margin:0 10px;}
header h2.logo a{height:90px!important;width:100%;color:#fff;text-decoration:none;display:block;}
/* float:right plus an !important nowrap is what pushed the utility
   links off the start edge and across the logo. */
#vtopnav{float:right;display:flex!important;flex-wrap:nowrap!important;justify-content:flex-end!important;list-style:none!important;}
.header_nav_search{float:right;}
#block-doe-mainmenu nav.megamenu{background:#182b3c;}
#block-doe-mainmenu ul.sf-menu{background:#182b3c;}
ul.sf-menu li{float:left;position:relative;z-index:498;list-style:none;background:#182b3c;}
ul.sf-menu li li:hover>ul,ul.sf-menu li.sfHover>ul{left:0;top:2.5em;}
ul.sf-menu>li>a{display:block;color:#fff;text-decoration:none;padding:16px 48px 16px 24px;}
ul.sf-menu ul{position:absolute;top:-9999px;width:14em;background:#274f73;}
ul.sf-menu li:hover>ul,ul.sf-menu li.sfHover>ul{top:100%;}
ul.sf-menu ul a{display:block;color:#fff;padding:9px 14px;text-decoration:none;font-size:13.5px;}
#footer{background:#e9e9e9;color:#333;padding:30px 0;}
#footer .sub-container{max-width:1200px;margin:0 auto;padding:0 16px;}
#footer .footer_column{float:left;width:19%;margin-right:1%;}
input.form-search.topsearch{border:1px solid #ccc;padding:6px 10px;}
#block-doe-search .form-submit{background:#274f73;color:#fff;border:0;padding:7px 14px;}
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
<style>${chromeCss}</style>
<script>/* document.body does not exist yet this early in the parse, so the
   class was never applied and the console carried a TypeError that
   masked real errors. */
document.addEventListener('DOMContentLoaded', function () {
  /* The exact trio /doe/home26 carries. The chrome rule keys off
     page-node-type-home-page + path-node — path-node is what separates a
     prototype from the live homepage, which is path-frontpage — so the
     preview must carry it or the header and footer go unstyled. */
  document.body.classList.add('page-node-type-home-page', 'path-node', 'node-id-5073');
});<\/script>
<div class="mg-page">
<div class="mg-strip"><div><b>Maine.gov</b><a href="#">Agencies</a><a href="#">Online Services</a><a href="#">Help</a><a href="#">Search Maine.gov</a></div></div>
<div id="container">
${chromeParts.header}
${chromeParts.menu}
<div id="content"><div id="maincontent1"><div id="block-doe-content">
${body}
</div></div></div>
</div>
${chromeParts.footer}
</div>
<script>${jsPreview}<\/script>
`;

fs.writeFileSync(path.join(dir, outFile), out);
console.log(outFile + ' written — ' + (out.length / 1024).toFixed(1) + 'KB  (variant ' + variant.toUpperCase() + ', body: ' + bodyFile + ')');

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
for (const [name, body] of [['drupal-css-injector.css', css],
                            ['drupal-css-injector-chrome.css', read('drupal-css-injector-chrome.css')],
                            ['drupal-js-injector.js', js]]) {
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
  : 'WAF lint: all three injector files clean.');
