#!/usr/bin/env node
/* Maine DOE — page inventory via JSON:API
 * Version: 2026-09-19-a  ·  Last edited: 2026-09-19
 *
 *   node fetch-inventory.js [--type multi_column_page]
 *
 * Pulls every page of a content type into cache/inventory-<type>.json.
 *
 * WHY THE API AND NOT THE RENDERED PAGE. Scraping gives you the page
 * as the theme renders it — wrappers, aggregated markup, and the
 * cleanup tool then guessing which part came from the body field.
 * The API returns body.value, which IS the field, byte for byte as
 * the editor holds it. A diff against that is exact, and what we
 * paste back is the same shape as what we took out.
 *
 * READ ONLY. This writes nothing to Drupal and needs no credentials.
 * One request per 50 nodes, which is ~30 requests for the whole site
 * rather than 1,500 page loads.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TYPE = (process.argv.includes('--type')
  ? process.argv[process.argv.indexOf('--type') + 1] : 'multi_column_page');
const BASE = 'https://www.maine.gov/doe/jsonapi/node/' + TYPE;
const FIELDS = ['title', 'path', 'changed', 'created', 'status', 'body'].join(',');

(async () => {
  let url = `${BASE}?page%5Blimit%5D=50&fields%5Bnode--${TYPE}%5D=${FIELDS}`;
  const all = [];
  let page = 0;
  while (url) {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.error(`HTTP ${r.status} on page ${page}`); break; }
    const j = await r.json();
    if (j.errors) { console.error(JSON.stringify(j.errors).slice(0, 300)); break; }
    for (const n of j.data || []) {
      const a = n.attributes || {};
      all.push({
        id: n.id,
        nid: a.drupal_internal__nid,
        title: a.title,
        alias: (a.path || {}).alias || null,
        changed: a.changed,
        status: a.status,
        format: (a.body || {}).format || null,
        body: (a.body || {}).value || '',
      });
    }
    process.stdout.write(`\r  page ${++page} — ${all.length} nodes`);
    url = (j.links || {}).next ? j.links.next.href : null;
    if (url) await new Promise(s => setTimeout(s, 150));
  }
  const out = path.join(__dirname, 'cache', `inventory-${TYPE}.json`);
  fs.writeFileSync(out, JSON.stringify(all, null, 1));
  const bytes = all.reduce((s, n) => s + n.body.length, 0);
  console.log(`\n${all.length} nodes → cache/inventory-${TYPE}.json  (${(bytes / 1024 / 1024).toFixed(1)}MB of body HTML)`);
  console.log(`  with a body : ${all.filter(n => n.body.trim()).length}`);
  console.log(`  published   : ${all.filter(n => n.status).length}`);
  console.log(`  with an alias: ${all.filter(n => n.alias).length}`);
})();
