#!/usr/bin/env node
/* Maine DOE interior pages — what the new stylesheet does to a page
 * whose HTML has NOT been replaced yet
 * Version: 2026-09-21-a  ·  Last edited: 2026-09-21
 *
 *   node rollout-risk.js            all 831
 *   node rollout-risk.js 60         a sample
 *
 * THE ROLLOUT QUESTION, AND WHY IT CANNOT BE ANSWERED BY READING.
 * The injector is one field in Drupal. Paste it and it applies to
 * every page carrying page-node-type-multi-column-page at once —
 * all 832 — while the bodies can only be replaced one at a time.
 * So for however long the migration takes, most pages are OLD markup
 * under the NEW rule, and the whole plan depends on whether that is
 * an improvement, a wash, or a mess.
 *
 * 213 of the 395 rules target things that already exist on those
 * pages — .card, table, .contact-cube, .blockhead, .row, .dc-note,
 * .list-group, a, h2 — so "the new classes simply won't match" is not
 * an answer. It has to be measured.
 *
 * This renders each page's CURRENT live body twice, once with the
 * injector and once without, and reports the DIFFERENCE. Same DOM,
 * same probe, one stylesheet apart, so anything it reports is caused
 * by the stylesheet and nothing else. A fault present in both columns
 * is a fault the page already has today.
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = __dirname;
const { PROBE } = require(path.join(H, 'interior-checks.js'));
const C = path.join(H, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const LIMIT = Number(process.argv.find((a) => /^\d+$/.test(a))) || Infinity;
/* --css <file> measures a different stylesheet. The rollout installs
   the structural half first and the content half months later, so
   each half has to be checked on its own against live markup, not
   just the pair. */
const CSSARG = process.argv.indexOf('--css');
const CSSFILE = CSSARG > -1 ? process.argv[CSSARG + 1] : 'interior-css-injector.deploy.css';

/* The production stylesheets, taken from the preview the checks
   already trust rather than typed out again. */
const preview = fs.readFileSync(path.join(H, 'interior-preview.html'), 'utf8');
const SHEETS = [...new Set([...preview.matchAll(/href="(https:\/\/www\.maine\.gov[^"]+\.css[^"]*)"/g)].map(m => m[1]))];

(async () => {
  const { chromium } = require(path.join(process.env.HOME, 'Documents/Claude/node_modules/playwright'));
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  const shell = `<!doctype html><html><head><meta charset="utf-8">
${SHEETS.map(s => `<link rel="stylesheet" href="${s}">`).join('\n')}
<link rel="stylesheet" id="inj" href="file://${path.join(H, CSSFILE)}">
<style>#block-doe-content{max-width:940px;margin:0 auto}</style>
</head><body class="page-node-type-multi-column-page">
<div class="pv-page"><div class="pv-meta">page ·</div>
<div id="container"><div id="maincontent2"><div id="block-doe-content"></div></div></div>
</div></body></html>`;
  fs.writeFileSync(path.join(C, '_shell.html'), shell);
  await pg.goto('file://' + path.join(C, '_shell.html'), { waitUntil: 'networkidle' });

  const measure = async (body, on) => pg.evaluate(async ([html, on, probeSrc]) => {
    document.getElementById('inj').disabled = !on;
    const root = document.getElementById('block-doe-content');
    root.innerHTML = html;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const probe = eval('(' + probeSrc + ')');
    let fails = [], err = null;
    try { const out = probe(); fails = (out && out.fails) || []; }
    catch (e) { err = String(e && e.message || e); }
    const de = document.documentElement;
    return {
      err,
      contrast: fails.length,
      worst: fails.slice(0, 2).map(f => (f.got || '?') + ' ' + String(f.text || '').slice(0, 40)),
      overflow: Math.max(0, root.scrollWidth - root.clientWidth),
      pageOverflow: Math.max(0, de.scrollWidth - de.clientWidth),
      height: root.scrollHeight,
    };
  }, [body, on, PROBE.toString()]);

  const rows = [];
  let n = 0;
  for (const x of idx) {
    if (!x.body.trim()) continue;
    if (n >= LIMIT) break;
    n++;
    let off, onn;
    try { off = await measure(x.body, false); onn = await measure(x.body, true); }
    catch (e) { continue; }
    rows.push({ alias: x.alias, off, on: onn });
    if (n % 100 === 0) process.stderr.write(`  ${n}\n`);
  }
  await browser.close();

  const newContrast = rows.filter(r => r.on.contrast > r.off.contrast);
  const fixedContrast = rows.filter(r => r.on.contrast < r.off.contrast);
  const bothContrast = rows.filter(r => r.on.contrast > 0 && r.on.contrast === r.off.contrast);
  const newOverflow = rows.filter(r => r.on.pageOverflow > r.off.pageOverflow + 2);
  const fixedOverflow = rows.filter(r => r.off.pageOverflow > r.on.pageOverflow + 2);

  const sum = (a, k) => a.reduce((s, r) => s + r[k].contrast, 0);
  console.log(`\n${rows.length} pages rendered twice — current live HTML, ${CSSFILE} off then on\n`);
  console.log(`  contrast failures WITHOUT the new rule .......... ${sum(rows, 'off')}`);
  console.log(`  contrast failures WITH the new rule ............. ${sum(rows, 'on')}`);
  console.log('');
  console.log(`  pages the rule makes WORSE (new contrast fail) .. ${newContrast.length}`);
  newContrast.slice(0, 20).forEach(r => console.log(`      ${r.alias}  ${r.off.contrast} -> ${r.on.contrast}   ${r.on.worst.join(' | ')}`));
  console.log(`  pages the rule FIXES ........................... ${fixedContrast.length}`);
  fixedContrast.slice(0, 8).forEach(r => console.log(`      ${r.alias}  ${r.off.contrast} -> ${r.on.contrast}`));
  console.log(`  pages failing in BOTH (already broken today) ... ${bothContrast.length}`);
  bothContrast.slice(0, 8).forEach(r => console.log(`      ${r.alias}  ${r.on.contrast}`));
  console.log('');
  console.log(`  pages the rule makes overflow sideways ......... ${newOverflow.length}`);
  newOverflow.slice(0, 12).forEach(r => console.log(`      ${r.alias}  ${r.off.pageOverflow} -> ${r.on.pageOverflow}px`));
  console.log(`  pages whose sideways overflow it FIXES ......... ${fixedOverflow.length}`);
  fixedOverflow.slice(0, 8).forEach(r => console.log(`      ${r.alias}  ${r.off.pageOverflow} -> ${r.on.pageOverflow}px`));
  fs.writeFileSync(path.join(C, 'rollout-risk.json'), JSON.stringify(rows, null, 1));
  console.log('\ncache/rollout-risk.json written');
})();
