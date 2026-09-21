#!/usr/bin/env node
/* Maine DOE — which images on the site do not load
 * Version: 2026-09-20-a  ·  Last edited: 2026-09-20
 *
 *   node check-images.js      → cache/broken-images.json
 *
 * WHY. /MTSS carries a 404 where its framework diagram should be, and
 * nobody knew until someone looked at the page. An image that does not
 * load leaves a broken-icon and its alt text, which is worse than no
 * image at all — the page looks damaged rather than plain.
 *
 * Only the sources that image-sizes.json never managed to measure are
 * tested, because a measured image demonstrably loaded. Each is
 * fetched HEAD; a 404 is broken beyond argument. A 200 that is not an
 * image/* is reported separately and NOT treated as broken, because a
 * CDN answering with a redirect page is a different problem and may
 * still render.
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const C = path.join(__dirname, 'cache');
const idx = JSON.parse(fs.readFileSync(path.join(C, 'inventory-multi_column_page.json'), 'utf8'));
const sizes = JSON.parse(fs.readFileSync(path.join(C, 'image-sizes.json'), 'utf8'));
const dec = u => { try { return decodeURIComponent(u); } catch (e) { return u; } };
const known = new Set(Object.keys(sizes).map(dec));

const srcs = new Map();
for (const n of idx) {
  if (!n.body.trim()) continue;
  for (const m of n.body.matchAll(/<img[^>]*src="([^"]*)"[^>]*>/gi)) {
    const src = m[1];
    if (/^data:/.test(src) || known.has(dec(src))) continue;
    if (!srcs.has(src)) srcs.set(src, new Set());
    srcs.get(src).add(n.alias);
  }
}

const head = (u) => new Promise(res => {
  const url = /^https?:/.test(u) ? u : 'https://www.maine.gov' + u;
  const req = https.request(url, { method: 'HEAD', timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' } },
    r => { res({ u, code: r.statusCode, type: r.headers['content-type'] || '' }); r.resume(); });
  req.on('error', e => res({ u, code: 0, type: 'ERR ' + e.code }));
  req.on('timeout', () => { req.destroy(); res({ u, code: 0, type: 'timeout' }); });
  req.end();
});

(async () => {
  const list = [...srcs.keys()];
  const out = [];
  for (let i = 0; i < list.length; i += 8) out.push(...await Promise.all(list.slice(i, i + 8).map(head)));
  const gone = out.filter(r => r.code === 404);
  const odd = out.filter(r => r.code !== 404 && (r.code !== 200 || !/^image\//.test(r.type)));
  fs.writeFileSync(path.join(C, 'broken-images.json'), JSON.stringify(gone.map(g => g.u), null, 1));
  console.log(`${list.length} unmeasured sources tested`);
  console.log(`  404, written to cache/broken-images.json: ${gone.length}`);
  for (const g of gone) console.log('     ' + [...srcs.get(g.u)][0].padEnd(42) + g.u.split('/').pop().slice(0, 46));
  console.log(`  answered but not an image (left alone):   ${odd.length}`);
  for (const o of odd) console.log('     ' + String(o.code).padEnd(4) + o.type.slice(0, 20).padEnd(22) + o.u.slice(0, 54));
})();
