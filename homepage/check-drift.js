#!/usr/bin/env node
/* Maine DOE interior pages — what has changed since the snapshot
 * Version: 2026-09-21-a  ·  Last edited: 2026-09-21
 *
 *   node check-drift.js            report only
 *   node check-drift.js --json     write cache/drift.json for the panel
 *
 * WHY THIS EXISTS
 * ---------------
 * Every proposal in out/ is built from cache/inventory-*.json, which
 * is a snapshot. Authors go on editing the live pages while the
 * review runs — so a body pasted from out/ can silently overwrite an
 * edit somebody made yesterday. That is the one way this project can
 * destroy work rather than improve it.
 *
 * This asks Drupal for nothing but each node's `changed` timestamp —
 * no bodies, so it is a small request — and compares it against the
 * snapshot. Anything newer needs its body re-fetched before its
 * proposal is trusted.
 *
 * It changes nothing. It only reports.
 */
'use strict';
const fs = require('fs'), path = require('path');
const TYPE = 'multi_column_page';
const C = path.join(__dirname, 'cache');
const snap = JSON.parse(fs.readFileSync(path.join(C, `inventory-${TYPE}.json`), 'utf8'));
const snapAt = fs.statSync(path.join(C, `inventory-${TYPE}.json`)).mtime;
const was = new Map(snap.map(n => [n.id, n]));

(async () => {
  /* Only the fields needed to tell whether a page moved. */
  const FIELDS = ['title', 'path', 'changed', 'status'].join(',');
  let url = `https://www.maine.gov/doe/jsonapi/node/${TYPE}`
    + `?page%5Blimit%5D=50&fields%5Bnode--${TYPE}%5D=${FIELDS}`;
  const now = new Map();
  while (url) {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(2); }
    const j = await r.json();
    for (const d of j.data) {
      const a = d.attributes;
      now.set(d.id, {
        id: d.id, title: a.title,
        alias: (a.path && a.path.alias) || null,
        changed: a.changed, status: a.status,
      });
    }
    url = (j.links || {}).next ? j.links.next.href : null;
    if (url) await new Promise(s => setTimeout(s, 150));
  }

  const edited = [], added = [], removed = [], unpublished = [];
  for (const [id, n] of now) {
    const old = was.get(id);
    if (!old) { added.push(n); continue; }
    if (n.changed !== old.changed) edited.push({ ...n, before: old.changed });
    if (old.status && !n.status) unpublished.push(n);
  }
  for (const [id, old] of was) if (!now.has(id)) removed.push(old);

  const fmt = d => String(d).slice(0, 16).replace('T', ' ');
  /* The file's own mtime is not the snapshot date once individual
     pages have been refreshed into it, so it is not reported as one.
     What actually decides drift is each node's own `changed` value,
     compared below. */
  const newest = snap.map(n => n.changed).filter(Boolean).sort().pop();
  console.log(`cache holds ${snap.length} pages, newest edit in it ${fmt(newest)}`);
  console.log(`site has    ${now.size} pages right now\n`);
  const line = (label, list) =>
    console.log(String(list.length).padStart(4) + '  ' + label);
  line('edited since the snapshot — body must be re-fetched before pasting', edited);
  line('added since the snapshot — no proposal exists yet', added);
  line('gone from the site — delete the proposal', removed);
  line('unpublished since the snapshot', unpublished);

  if (edited.length) {
    console.log('\nedited:');
    edited.sort((a, b) => (b.changed || '').localeCompare(a.changed || ''))
      .forEach(n => console.log('   ' + fmt(n.changed) + '  ' + (n.alias || '(no path)')));
  }
  if (added.length) { console.log('\nadded:'); added.forEach(n => console.log('   ' + (n.alias || '(no path)'))); }
  if (removed.length) { console.log('\ngone:'); removed.forEach(n => console.log('   ' + (n.alias || '(no path)'))); }

  if (process.argv.includes('--json')) {
    /* The node id goes in too. JSON:API will not filter on
       path.alias — it is a computed field and the query 500s — so
       the only reliable way to re-fetch one page is by its uuid. */
    const pair = n => ({ alias: n.alias, id: n.id, title: n.title });
    const out = { checkedAt: new Date().toISOString(), snapshotAt: snapAt.toISOString(),
      edited: edited.map(pair), added: added.map(pair), removed: removed.map(pair) };
    fs.writeFileSync(path.join(C, 'drift.json'), JSON.stringify(out, null, 1));
    console.log('\ncache/drift.json written');
  }
})();
