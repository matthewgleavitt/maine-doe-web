#!/usr/bin/env node
/* Maine DOE interior pages — re-pull just the pages that moved
 * Version: 2026-09-21-b  ·  Last edited: 2026-09-21
 *
 *   node refresh-pages.js /a/path /another/path
 *   node refresh-pages.js --drift        every page check-drift found
 *
 * WHY NOT JUST RE-FETCH EVERYTHING
 * --------------------------------
 * A full fetch replaces all 834 bodies, so every page in the review
 * shifts at once — including the ones already approved, which then
 * have to be looked at again. Authors edit a handful of pages a
 * week. Pulling those few keeps the rest of the review stable.
 *
 * Updates the node in cache/inventory-*.json IN PLACE, keeping the
 * file's order so nothing else in the review moves. Removes nodes
 * that have been deleted on the server.
 */
'use strict';
const fs = require('fs'), path = require('path');
const TYPE = 'multi_column_page';
const C = path.join(__dirname, 'cache');
const FILE = path.join(C, `inventory-${TYPE}.json`);

(async () => {
  let want = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (process.argv.includes('--drift')) {
    const d = JSON.parse(fs.readFileSync(path.join(C, 'drift.json'), 'utf8'));
    for (const n of [...(d.edited || []), ...(d.added || [])]) want.push(n.alias ? n : { alias: n });
    var removeThese = new Set((d.removed || []).map(n => n.alias || n));
  }
  if (!want.length && !(removeThese && removeThese.size)) {
    console.log('nothing to do — pass page paths, or --drift after running check-drift.js --json');
    return;
  }

  const idx = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const byAlias = new Map(idx.map((n, i) => [n.alias, i]));
  const FIELDS = ['title', 'path', 'changed', 'created', 'status', 'body'].join(',');
  let updated = 0, addedN = 0, missing = [];

  for (const item of want) {
    const alias = typeof item === 'string' ? item : item.alias;
    /* BY UUID, NOT BY PATH. JSON:API cannot filter on path.alias —
       it is computed, and the request comes back 500. Every node in
       the cache carries its uuid, so that is what addresses it. */
    const at0 = byAlias.get(alias);
    const uuid = (typeof item === 'object' && item.id) || (at0 !== undefined && idx[at0].id);
    if (!uuid) { missing.push(alias + ' (no id known)'); continue; }
    const url = `https://www.maine.gov/doe/jsonapi/node/${TYPE}/${uuid}`
      + `?fields%5Bnode--${TYPE}%5D=${FIELDS}`;
    const r = await fetch(url, { headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.error(`  HTTP ${r.status} for ${alias}`); continue; }
    const j = await r.json();
    if (!j.data) { missing.push(alias); continue; }
    const d = j.data, a = d.attributes;
    const node = {
      id: d.id, title: a.title,
      alias: (a.path && a.path.alias) || alias,
      changed: a.changed, status: a.status,
      format: (a.body && a.body.format) || null,
      body: (a.body && a.body.value) || '',
    };
    const at = byAlias.get(alias);
    if (at === undefined) { idx.push(node); addedN++; console.log('  added   ' + alias); }
    else {
      const before = idx[at].body.length;
      /* THE VERSION BEING REPLACED IS KEPT. Without it there is no
         way to answer "what did the author actually change?" — only
         that the page moved. One file per page, overwritten each
         time, so it is always the immediately previous version. */
      try {
        const dir = path.join(C, 'prev');
        fs.mkdirSync(dir, { recursive: true });
        const slug = (alias.replace(/^\//, '').replace(/[^A-Za-z0-9]+/g, '-') || 'home');
        fs.writeFileSync(path.join(dir, slug + '.html'), idx[at].body);
      } catch (e) { /* keeping a copy is a convenience, never a blocker */ }
      idx[at] = node; updated++;
      console.log('  updated ' + alias + '   body ' + before + ' → ' + node.body.length + ' chars');
    }
    await new Promise(s => setTimeout(s, 150));
  }

  let removedN = 0;
  if (typeof removeThese !== 'undefined') {
    for (let i = idx.length - 1; i >= 0; i--) {
      if (removeThese.has(idx[i].alias)) { console.log('  removed ' + idx[i].alias); idx.splice(i, 1); removedN++; }
    }
  }

  fs.writeFileSync(FILE, JSON.stringify(idx, null, 1));
  console.log(`\n${updated} updated, ${addedN} added, ${removedN} removed  →  ${idx.length} nodes in the cache`);
  if (missing.length) console.log('not found on the server: ' + missing.join(', '));
  console.log('\nNow re-run the audit and the builder so the proposals match:');
  console.log('  node audit-pages.js && node build-review-panel.js');
})();
